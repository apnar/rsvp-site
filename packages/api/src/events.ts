/**
 * Reading events, and deciding who may see what. Shared by the routers and
 * the cron job. Everything that grants access reads D1, never the session.
 */

import { ORPCError } from "@orpc/server";
import type { Person } from "@rsvp-site/db/people";
import { isAdmin } from "@rsvp-site/db/roles";
import { user } from "@rsvp-site/db/schema/auth";
import {
	event,
	eventDesign,
	eventGuest,
	eventHost,
	potluckClaim,
	potluckItem,
} from "@rsvp-site/db/schema/event";
import { facesOf, loadFaces } from "@rsvp-site/design/faces";
import type { Values } from "@rsvp-site/design/placeholders";
import { layoutCard, type Mode, type Scene } from "@rsvp-site/design/scene";
import type { Design, Format } from "@rsvp-site/design/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { Context } from "./context";
import {
	type PotluckLine,
	potluckLines,
	type Totals,
	tally,
} from "./headcount";
import { formatDate, formatTimeRange } from "./time";

type Db = Context["db"];

export type EventRow = typeof event.$inferSelect;
export type GuestRow = typeof eventGuest.$inferSelect;

export async function findEvent(db: Db, id: string): Promise<EventRow | null> {
	return (await db.select().from(event).where(eq(event.id, id)).get()) ?? null;
}

export async function findEventByShareToken(
	db: Db,
	token: string,
): Promise<EventRow | null> {
	return (
		(await db.select().from(event).where(eq(event.shareToken, token)).get()) ??
		null
	);
}

/** The ids of an event's hosts, owner first. */
export async function hostIdsOf(db: Db, eventId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: eventHost.userId })
		.from(eventHost)
		.where(eq(eventHost.eventId, eventId))
		.orderBy(sql`${eventHost.isOwner} desc`, asc(eventHost.createdAt))
		.all();
	return rows.map((r) => r.userId);
}

export async function hostsOf(db: Db, eventId: string) {
	return db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			isOwner: eventHost.isOwner,
		})
		.from(eventHost)
		.innerJoin(user, eq(user.id, eventHost.userId))
		.where(eq(eventHost.eventId, eventId))
		.orderBy(sql`${eventHost.isOwner} desc`, asc(eventHost.createdAt))
		.all();
}

export type Access = {
	event: EventRow;
	/** May edit it, see the whole list, send for it. */
	isHost: boolean;
	/** The caller's own invitation, when they have one. */
	guest: GuestRow | null;
};

/**
 * What the caller may do with an event. A stranger gets the same "no such
 * event" as a wrong id, so ids cannot be probed. Guests never see a draft:
 * nothing has been sent, and a host may still be deciding who to ask.
 */
export async function accessTo(
	db: Db,
	me: Pick<Person, "id" | "role">,
	eventId: string,
): Promise<Access> {
	const row = await findEvent(db, eventId);
	if (!row) throw notFound();
	const [hostRow, guest] = await Promise.all([
		db
			.select({ userId: eventHost.userId })
			.from(eventHost)
			.where(and(eq(eventHost.eventId, eventId), eq(eventHost.userId, me.id)))
			.get(),
		db
			.select()
			.from(eventGuest)
			.where(and(eq(eventGuest.eventId, eventId), eq(eventGuest.userId, me.id)))
			.get(),
	]);
	const isHost = Boolean(hostRow) || isAdmin(me);
	if (isHost) return { event: row, isHost, guest: guest ?? null };
	if (!guest || row.status === "draft") throw notFound();
	return { event: row, isHost: false, guest };
}

/** Access that must be a host's, or it is the same "no such event". */
export async function hostAccessTo(
	db: Db,
	me: Pick<Person, "id" | "role">,
	eventId: string,
): Promise<Access> {
	const access = await accessTo(db, me, eventId);
	if (!access.isHost) throw notFound();
	return access;
}

export function notFound() {
	return new ORPCError("NOT_FOUND", { message: "No such event." });
}

export type GuestListRow = {
	id: string;
	userId: string;
	name: string;
	email: string;
	source: GuestRow["source"];
	response: GuestRow["response"];
	adults: number;
	kids: number;
	dietary: string;
	note: string;
	invitedAt: Date | null;
	respondedAt: Date | null;
	nudgedAt: Date | null;
	createdAt: Date;
	/** Mail cannot reach them: unsubscribed, or deactivated. */
	unreachable: boolean;
	/** Who put them on the list. */
	addedBy: string | null;
	addedByName: string | null;
	/** Added by name alone, for paper: no address, never mailed. */
	noEmail: boolean;
	/** Their paper card has a QR code issued. */
	hasPaper: boolean;
};

/**
 * A paper event whose host has not pressed "Start emails" yet: no guest
 * email of any kind may go, so the printed card arrives first.
 */
export function emailsHeld(row: Pick<EventRow, "paper" | "emailsReleasedAt">) {
	return row.paper && row.emailsReleasedAt === null;
}

/** The person who added a guest, joined a second time under its own name. */
const adder = alias(user, "adder");

/** Everybody on an event's list, with the person behind each row. */
export async function guestsOf(
	db: Db,
	eventId: string,
): Promise<GuestListRow[]> {
	const rows = await db
		.select({
			id: eventGuest.id,
			userId: eventGuest.userId,
			name: user.name,
			email: user.email,
			source: eventGuest.source,
			response: eventGuest.response,
			adults: eventGuest.adults,
			kids: eventGuest.kids,
			dietary: eventGuest.dietary,
			note: eventGuest.note,
			invitedAt: eventGuest.invitedAt,
			respondedAt: eventGuest.respondedAt,
			nudgedAt: eventGuest.nudgedAt,
			createdAt: eventGuest.createdAt,
			unsubscribedAt: user.unsubscribedAt,
			status: user.status,
			addedBy: eventGuest.addedBy,
			addedByName: adder.name,
			noEmail: user.noEmail,
			paperToken: eventGuest.paperToken,
		})
		.from(eventGuest)
		.innerJoin(user, eq(user.id, eventGuest.userId))
		.leftJoin(adder, eq(adder.id, eventGuest.addedBy))
		.where(eq(eventGuest.eventId, eventId))
		.orderBy(asc(eventGuest.createdAt))
		.all();
	return rows.map(({ unsubscribedAt, status, paperToken, ...row }) => ({
		...row,
		// A placeholder address is never shown, not even to the host.
		email: row.noEmail ? "" : row.email,
		hasPaper: paperToken !== null,
		unreachable:
			unsubscribedAt !== null || status === "deactivated" || row.noEmail,
	}));
}

/** The potluck with who took what. */
export async function potluckOf(db: Db, eventId: string) {
	const [items, claims] = await Promise.all([
		db
			.select({
				id: potluckItem.id,
				label: potluckItem.label,
				quantity: potluckItem.quantity,
			})
			.from(potluckItem)
			.where(eq(potluckItem.eventId, eventId))
			.orderBy(asc(potluckItem.sort), asc(potluckItem.createdAt))
			.all(),
		db
			.select({ itemId: potluckClaim.itemId, guestId: potluckClaim.guestId })
			.from(potluckClaim)
			.innerJoin(potluckItem, eq(potluckItem.id, potluckClaim.itemId))
			.where(eq(potluckItem.eventId, eventId))
			.all(),
	]);
	return { lines: potluckLines(items, claims), claims };
}

export type EventCard = {
	id: string;
	title: string;
	status: EventRow["status"];
	date: string | null;
	dateLabel: string | null;
	timeLabel: string | null;
	coverKey: string | null;
	/** The designed card's picture, when the design is on, and its page colour. */
	card: { key: string; bg: string } | null;
	hostLine: string;
	totals: Totals;
	potluck: PotluckLine[];
};

/** Totals for a set of events in two queries, for the dashboard. */
export async function cardsFor(
	db: Db,
	rows: readonly EventRow[],
): Promise<EventCard[]> {
	if (rows.length === 0) return [];
	const ids = rows.map((r) => r.id);
	const [guests, items, claims] = await Promise.all([
		db
			.select({
				eventId: eventGuest.eventId,
				response: eventGuest.response,
				adults: eventGuest.adults,
				kids: eventGuest.kids,
			})
			.from(eventGuest)
			.where(inArray(eventGuest.eventId, ids))
			.all(),
		db
			.select({
				id: potluckItem.id,
				eventId: potluckItem.eventId,
				label: potluckItem.label,
				quantity: potluckItem.quantity,
			})
			.from(potluckItem)
			.where(inArray(potluckItem.eventId, ids))
			.orderBy(asc(potluckItem.sort))
			.all(),
		db
			.select({ itemId: potluckClaim.itemId })
			.from(potluckClaim)
			.innerJoin(potluckItem, eq(potluckItem.id, potluckClaim.itemId))
			.where(inArray(potluckItem.eventId, ids))
			.all(),
	]);
	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		status: row.status,
		date: row.date,
		dateLabel: row.date ? formatDate(row.date) : null,
		timeLabel: formatTimeRange(row.startTime, row.endTime),
		coverKey: row.coverKey,
		card:
			row.designOn && row.cardKey && row.theme
				? { key: row.cardKey, bg: row.theme.bg }
				: null,
		hostLine: row.hostLine,
		totals: tally(guests.filter((g) => g.eventId === row.id)),
		potluck: row.potluckEnabled
			? potluckLines(
					items.filter((i) => i.eventId === row.id),
					claims,
				)
			: [],
	}));
}

/** "Sat, Oct 24" style labels for an event row, shared by pages and mail. */
export function labelsOf(row: EventRow) {
	return {
		dateLabel: row.date ? formatDate(row.date) : null,
		timeLabel: formatTimeRange(row.startTime, row.endTime),
		deadlineLabel: row.rsvpDeadline ? formatDate(row.rsvpDeadline) : null,
	};
}

/** The event's facts as a design's placeholders read them. */
export function designValues(row: EventRow, guest: string): Values {
	const labels = labelsOf(row);
	return {
		title: row.title,
		date: labels.dateLabel ?? "",
		time: labels.timeLabel ?? "",
		location: row.location,
		host: row.hostLine,
		rsvpBy: labels.deadlineLabel ?? "",
		details: row.details,
		guest,
	};
}

/** The saved design, when it is on. Parsed on the way in (designs.save). */
export async function designedDoc(
	db: Db,
	row: EventRow,
): Promise<{ doc: Design; version: number } | null> {
	if (!row.designOn) return null;
	const saved = await db
		.select({ doc: eventDesign.doc, version: eventDesign.version })
		.from(eventDesign)
		.where(eq(eventDesign.eventId, row.id))
		.get();
	return saved ? { doc: saved.doc as Design, version: saved.version } : null;
}

/**
 * The event's card laid out for one viewer, when its design is on. The
 * layout happens here, on the server, so the page receives line breaks
 * and glyph positions and needs no font metrics of its own.
 */
export async function designedCard(
	db: Db,
	row: EventRow,
	mode: Mode,
	guest: string,
): Promise<{ scene: Scene; version: number } | null> {
	const saved = await designedDoc(db, row);
	if (!saved) return null;
	const doc = saved.doc;
	const faces = await loadFaces(facesOf(doc));
	return {
		scene: layoutCard(doc, { values: designValues(row, guest), mode, faces }),
		version: saved.version,
	};
}

/**
 * The card's format, when the event's design is on: the guest list needs
 * it to offer print layouts, and nothing else of the document.
 */
export async function designFormatOf(
	db: Db,
	row: EventRow,
): Promise<Format | null> {
	if (!row.designOn) return null;
	const found = await db
		.select({
			format: sql<Format>`json_extract(${eventDesign.doc}, '$.format')`,
		})
		.from(eventDesign)
		.where(eq(eventDesign.eventId, row.id))
		.get();
	return found?.format ?? null;
}
