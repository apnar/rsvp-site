/**
 * Reading events, and deciding who may see what. Shared by the routers and
 * the cron job. Everything that grants access reads D1, never the session.
 */

import { ORPCError } from "@orpc/server";
import type { Db } from "@rsvp-site/db";
import { mapChunks } from "@rsvp-site/db/batch";
import { firstNameOf } from "@rsvp-site/db/names";
import type { Person } from "@rsvp-site/db/people";
import { canHost, isAdmin } from "@rsvp-site/db/roles";
import { user } from "@rsvp-site/db/schema/auth";
import {
	event,
	eventDesign,
	eventGuest,
	eventHost,
	potluckClaim,
	potluckItem,
} from "@rsvp-site/db/schema/event";
import { familyMember } from "@rsvp-site/db/schema/family";
import { facesOf, loadFaces } from "@rsvp-site/design/faces";
import type { Values } from "@rsvp-site/design/placeholders";
import { layoutCard, type Mode, type Scene } from "@rsvp-site/design/scene";
import {
	type Design,
	type DesignTheme,
	FORMAT_IDS,
	type Format,
} from "@rsvp-site/design/schema";
import {
	and,
	asc,
	eq,
	inArray,
	isNotNull,
	isNull,
	ne,
	or,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { answersOf } from "./answer-words";
import { readTheme, savedDesign } from "./designs-store";
import { emailsHeld, mayDelete, openRefusal } from "./event-rules";
import { type GuestCounts, potluckLines, tally } from "./headcount";
import { formatDate, formatTimeRange } from "./time";

export { emailsHeld };

/** A row as D1 hands it over: the theme is unchecked JSON. */
export type RawEventRow = typeof event.$inferSelect;
/**
 * An event as the rest of the API sees it. The theme reaches a raw <style>
 * and email HTML, so it only exists here once `cleanTheme` has parsed it:
 * the compiler refuses a raw row anywhere an `EventRow` is wanted.
 */
export type EventRow = Omit<RawEventRow, "theme"> & {
	theme: DesignTheme | null;
};
export type GuestRow = typeof eventGuest.$inferSelect;

export function cleanTheme<T extends { theme: unknown }>(
	row: T,
): Omit<T, "theme"> & { theme: DesignTheme | null } {
	return { ...row, theme: readTheme(row.theme) };
}

/** A canceled event is read-only: nothing a host does to it can matter. */
export function refuseCanceled(
	row: Pick<EventRow, "status">,
	message = "It's canceled.",
) {
	if (row.status === "canceled") {
		throw new ORPCError("BAD_REQUEST", { message });
	}
}

/** Refuse unless the event is published, not canceled and not yet started. */
export function requireOpen(
	row: Pick<EventRow, "status" | "date" | "startTime">,
	now: number = Date.now(),
) {
	const refusal = openRefusal(row, now);
	if (refusal) throw new ORPCError("BAD_REQUEST", { message: refusal });
}

export async function findEvent(db: Db, id: string): Promise<EventRow | null> {
	const row = await db.select().from(event).where(eq(event.id, id)).get();
	return row ? cleanTheme(row) : null;
}

export async function findEventByShareToken(
	db: Db,
	token: string,
): Promise<EventRow | null> {
	const row = await db
		.select()
		.from(event)
		.where(eq(event.shareToken, token))
		.get();
	return row ? cleanTheme(row) : null;
}

/** Owner first, then in the order they joined: the one order hosts are listed in. */
const hostOrder = () => [
	sql`${eventHost.isOwner} desc`,
	asc(eventHost.createdAt),
];

/** Soonest first; undated last. Callers reverse it for "past". */
export function byDate(a: { date: string | null }, b: { date: string | null }) {
	return (a.date ?? "9999").localeCompare(b.date ?? "9999");
}

/** People who have the invitation and have not said no. */
export async function stillComing(db: Db, eventId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: eventGuest.userId })
		.from(eventGuest)
		.where(
			and(
				eq(eventGuest.eventId, eventId),
				isNotNull(eventGuest.invitedAt),
				or(isNull(eventGuest.response), ne(eventGuest.response, "no")),
			),
		)
		.all();
	return rows.map((r) => r.userId);
}

/**
 * The ids of an event's hosts, owner first. Only people who may still host:
 * a demoted co-host keeps their event_host row, but alerts and digests carry
 * guests' names and notes and must stop with the role.
 */
export async function hostIdsOf(db: Db, eventId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: eventHost.userId, role: user.role })
		.from(eventHost)
		.innerJoin(user, eq(user.id, eventHost.userId))
		.where(eq(eventHost.eventId, eventId))
		.orderBy(...hostOrder())
		.all();
	return rows.filter((r) => canHost(r)).map((r) => r.userId);
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
		.orderBy(...hostOrder())
		.all();
}

export type Access = {
	event: EventRow;
	/** May edit it, see the whole list, send for it. */
	isHost: boolean;
	/** May erase it: `mayDelete`, decided here where the role is known. */
	canDelete: boolean;
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
			.select({ isOwner: eventHost.isOwner })
			.from(eventHost)
			.where(and(eq(eventHost.eventId, eventId), eq(eventHost.userId, me.id)))
			.get(),
		db
			.select()
			.from(eventGuest)
			.where(and(eq(eventGuest.eventId, eventId), eq(eventGuest.userId, me.id)))
			.get(),
	]);
	// The row alone is not enough: a demoted co-host keeps it, and must fall
	// back to an ordinary guest (or a stranger) the moment the role changes.
	const isHost = (Boolean(hostRow) && canHost(me)) || isAdmin(me);
	if (isHost) {
		const canDelete = mayDelete(row, {
			isHost,
			isOwner: Boolean(hostRow?.isOwner) && canHost(me),
			isAdmin: isAdmin(me),
		});
		return { event: row, isHost, canDelete, guest: guest ?? null };
	}
	if (!guest || row.status === "draft") throw notFound();
	return { event: row, isHost: false, canDelete: false, guest };
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

/** The person who added a guest, joined a second time under its own name. */
const adder = alias(user, "adder");
/** The relative who answered for a guest, a third time. */
const answerer = alias(user, "answerer");

/**
 * Everybody on an event's list, with the person behind each row.
 * `unreachable` means mail cannot reach them (unsubscribed, deactivated, no
 * address); `addedBy` is who put them on the list; `answeredByName` the
 * relative who answered for them; `familyId` their family, if any;
 * `hasPaper` says their printed card has a QR code issued; `viewedAt` is
 * for hosts only, so guest-facing payloads pick their fields by hand.
 */
export async function guestsOf(db: Db, eventId: string) {
	const rows = await db
		.select({
			id: eventGuest.id,
			userId: eventGuest.userId,
			name: user.name,
			image: user.image,
			email: user.email,
			source: eventGuest.source,
			response: eventGuest.response,
			adults: eventGuest.adults,
			kids: eventGuest.kids,
			dietary: eventGuest.dietary,
			note: eventGuest.note,
			invitedAt: eventGuest.invitedAt,
			respondedAt: eventGuest.respondedAt,
			viewedAt: eventGuest.viewedAt,
			lastViewedAt: eventGuest.lastViewedAt,
			nudgedAt: eventGuest.nudgedAt,
			createdAt: eventGuest.createdAt,
			unsubscribedAt: user.unsubscribedAt,
			status: user.status,
			addedBy: eventGuest.addedBy,
			addedByName: adder.name,
			answeredByName: answerer.name,
			familyId: familyMember.familyId,
			noEmail: user.noEmail,
			paperToken: eventGuest.paperToken,
		})
		.from(eventGuest)
		.innerJoin(user, eq(user.id, eventGuest.userId))
		.leftJoin(adder, eq(adder.id, eventGuest.addedBy))
		.leftJoin(answerer, eq(answerer.id, eventGuest.answeredBy))
		.leftJoin(familyMember, eq(familyMember.userId, eventGuest.userId))
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

/** Rows under their key, in the order they came. */
function groupBy<T>(rows: readonly T[], key: (row: T) => string) {
	const groups = new Map<string, T[]>();
	for (const row of rows) {
		const k = key(row);
		const group = groups.get(k);
		if (group) group.push(row);
		else groups.set(k, [row]);
	}
	return groups;
}

/**
 * The potluck with who took what. `byGuest` is the one place a guest's
 * picks are worked out: the host's list, the CSV and a guest's own page
 * all read it rather than filtering the claims themselves.
 */
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
	const labels = new Map(items.map((i) => [i.id, i.label]));
	const byGuest = new Map(
		[...groupBy(claims, (c) => c.guestId)].map(([guestId, picks]) => [
			guestId,
			picks.map((c) => ({
				itemId: c.itemId,
				label: labels.get(c.itemId) ?? "",
			})),
		]),
	);
	return { lines: potluckLines(items, claims), byGuest };
}

export type Potluck = Awaited<ReturnType<typeof potluckOf>>;

/** What an event without a potluck has: nothing, and nobody bringing it. */
export const NO_POTLUCK: Potluck = { lines: [], byGuest: new Map() };

/**
 * Only what the totals read, for the places that count and never show
 * names: no join to the people behind the rows.
 */
export function guestCountsOf(db: Db, eventId: string): Promise<GuestCounts[]> {
	return db
		.select({
			response: eventGuest.response,
			adults: eventGuest.adults,
			kids: eventGuest.kids,
		})
		.from(eventGuest)
		.where(eq(eventGuest.eventId, eventId))
		.all();
}

function cardOf(row: EventRow) {
	return row.designOn && row.cardKey && row.theme
		? { key: row.cardKey, bg: row.theme.bg }
		: null;
}

/**
 * Totals for a set of events in a few queries, for the dashboard. Each
 * card has the event's facts, its picture (`card`, when the design is on,
 * with the page colour) and, as HH:MM, `startTime` so a card can show the
 * start alone without parsing a label.
 */
export async function cardsFor(db: Db, rows: readonly EventRow[]) {
	if (rows.length === 0) return [];
	const ids = rows.map((r) => r.id);
	// D1 caps a statement at 100 bound parameters, so the ids go in slices.
	const [guests, items, claims] = await Promise.all([
		mapChunks(ids, (slice) =>
			db
				.select({
					eventId: eventGuest.eventId,
					response: eventGuest.response,
					adults: eventGuest.adults,
					kids: eventGuest.kids,
				})
				.from(eventGuest)
				.where(inArray(eventGuest.eventId, slice))
				.all(),
		),
		mapChunks(ids, (slice) =>
			db
				.select({
					id: potluckItem.id,
					eventId: potluckItem.eventId,
					label: potluckItem.label,
					quantity: potluckItem.quantity,
				})
				.from(potluckItem)
				.where(inArray(potluckItem.eventId, slice))
				.orderBy(asc(potluckItem.sort))
				.all(),
		),
		mapChunks(ids, (slice) =>
			db
				.select({ itemId: potluckClaim.itemId })
				.from(potluckClaim)
				.innerJoin(potluckItem, eq(potluckItem.id, potluckClaim.itemId))
				.where(inArray(potluckItem.eventId, slice))
				.all(),
		),
	]);
	// Grouped once, so a long dashboard is not a scan of every guest per event.
	const guestsBy = groupBy(guests, (g) => g.eventId);
	const itemsBy = groupBy(items, (i) => i.eventId);
	const eventOfItem = new Map(items.map((i) => [i.id, i.eventId]));
	const claimsBy = groupBy(claims, (c) => eventOfItem.get(c.itemId) ?? "");
	return rows.map((row) => {
		const { dateLabel, timeLabel } = labelsOf(row);
		return {
			id: row.id,
			title: row.title,
			status: row.status,
			date: row.date,
			dateLabel,
			timeLabel,
			startTime: row.startTime,
			coverKey: row.coverKey,
			card: cardOf(row),
			hostLine: row.hostLine,
			answers: answersOf(row),
			totals: tally(guestsBy.get(row.id) ?? []),
			potluck: row.potluckEnabled
				? potluckLines(itemsBy.get(row.id) ?? [], claimsBy.get(row.id) ?? [])
				: [],
		};
	});
}

/** "Sat, Oct 24" style labels for an event row, shared by pages and mail. */
export function labelsOf(row: EventRow) {
	return {
		dateLabel: row.date ? formatDate(row.date) : null,
		timeLabel: formatTimeRange(row.startTime, row.endTime),
		deadlineLabel: row.rsvpDeadline ? formatDate(row.rsvpDeadline) : null,
	};
}

/** Who a card is addressed to, as its placeholders read them. */
export type Addressee = { name: string; firstName: string; lastName: string };

/** A card for nobody in particular: the shared picture, a sheet of blanks. */
export const NOBODY: Addressee = { name: "", firstName: "", lastName: "" };

/** What a host previewing the page sees where a guest's name would be. */
export const YOUR_GUEST: Addressee = {
	name: "your guest",
	firstName: "your guest",
	lastName: "",
};

/** The event's facts as a design's placeholders read them. */
export function designValues(row: EventRow, guest: Addressee): Values {
	const labels = labelsOf(row);
	return {
		title: row.title,
		date: labels.dateLabel ?? "",
		time: labels.timeLabel ?? "",
		location: row.location,
		host: row.hostLine,
		rsvpBy: labels.deadlineLabel ?? "",
		details: row.details,
		guest: guest.name,
		guestFirst: firstNameOf(guest),
		guestLast: guest.lastName,
	};
}

/** The saved design, when it is on. Parsed on the way in (designs.save). */
export async function designedDoc(
	db: Db,
	row: EventRow,
): Promise<{ doc: Design; version: number } | null> {
	if (!row.designOn) return null;
	const saved = await savedDesign(db, row.id);
	return saved?.doc ? { doc: saved.doc, version: saved.version } : null;
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
	guest: Addressee,
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

const formatSchema = z.enum(FORMAT_IDS);

/**
 * The card's format, when the event's design is on: the guest list needs
 * it to offer print layouts, and nothing else of the document. Checked
 * again here: the column is JSON, and a format that no longer exists
 * would otherwise reach the print layouts.
 */
export async function designFormatOf(
	db: Db,
	row: EventRow,
): Promise<Format | null> {
	if (!row.designOn) return null;
	const found = await db
		.select({
			format: sql<unknown>`json_extract(${eventDesign.doc}, '$.format')`,
		})
		.from(eventDesign)
		.where(eq(eventDesign.eventId, row.id))
		.get();
	const parsed = formatSchema.safeParse(found?.format);
	return parsed.success ? parsed.data : null;
}
