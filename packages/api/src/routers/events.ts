import { ORPCError } from "@orpc/server";
import {
	findOrCreatePeople,
	findReachablePersonByEmail,
	markLinkSent,
	newToken,
	normalizeEmail,
} from "@rsvp-site/db/people";
import { canHost, isAdmin } from "@rsvp-site/db/roles";
import { user } from "@rsvp-site/db/schema/auth";
import {
	event,
	eventGuest,
	eventHost,
	HOST_ALERTS,
	potluckItem,
} from "@rsvp-site/db/schema/event";
import {
	cancelEmail,
	coverUrl,
	joinLinkEmail,
	nudgeEmail,
	updateEmail,
} from "@rsvp-site/email";
import { getMailer, siteUrl } from "@rsvp-site/email/worker";
import {
	and,
	desc,
	eq,
	getTableColumns,
	inArray,
	isNotNull,
	isNull,
	lt,
	ne,
	notInArray,
	or,
} from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import {
	accessTo,
	cardsFor,
	type EventRow,
	findEvent,
	findEventByShareToken,
	guestsOf,
	hostAccessTo,
	hostsOf,
	labelsOf,
	notFound,
	potluckOf,
} from "../events";
import { canInviteOthers, invitesLeft } from "../guest-invites";
import { headcount, openSlots, tally } from "../headcount";
import { hostProcedure, personProcedure, publicProcedure } from "../index";
import { eventFacts, sendInvites, sendToList, signInUrl } from "../mail";
import { startsAt } from "../schedule";
import { formatDate, formatTimeRange, todayOnSite } from "../time";

type Db = Context["db"];

const idInput = z.object({ eventId: z.string().min(1) });
const dateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
	.nullable();
const timeSchema = z
	.string()
	.regex(/^\d{2}:\d{2}$/, "Pick a time.")
	.nullable();

/** Everything a host can set on the editor. All optional on update. */
const eventFields = z.object({
	title: z.string().trim().min(1, "Give it a name.").max(120),
	hostLine: z.string().trim().max(120),
	date: dateSchema,
	startTime: timeSchema,
	endTime: timeSchema,
	location: z.string().trim().max(200),
	details: z.string().trim().max(5000),
	rsvpDeadline: dateSchema,
	maxPlusOnes: z.number().int().min(0).max(20),
	askKids: z.boolean(),
	askDietary: z.boolean(),
	askNote: z.boolean(),
	potluckEnabled: z.boolean(),
	showGuestNames: z.boolean(),
	shareEnabled: z.boolean(),
	guestInvites: z.boolean(),
	guestInviteLimit: z.number().int().min(1).max(20),
	remindDeadline: z.boolean(),
	remindDaysBefore: z.number().int().min(0).max(30),
	remindDayBefore: z.boolean(),
	notifyChanges: z.boolean(),
	hostAlerts: z.enum(HOST_ALERTS),
});

const potluckInput = z
	.array(
		z.object({
			id: z.string().min(1).optional(),
			label: z.string().trim().min(1).max(80),
			quantity: z.number().int().min(1).max(99),
		}),
	)
	.max(40);

/** How long before the same person can be nudged again. */
const NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
/** How long before somebody can ask a share link for another email. */
const JOIN_COOLDOWN_MS = 2 * 60 * 1000;
const COVER_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const COVER_EXT: Record<(typeof COVER_TYPES)[number], string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

/** Fields a guest would want to hear changed. Details and notes are not. */
const NOTIFY_FIELDS = ["date", "startTime", "endTime", "location"] as const;

function describeChanges(before: EventRow, after: EventRow) {
	const changes: { label: string; was: string; now: string }[] = [];
	if (before.date !== after.date) {
		changes.push({
			label: "Date",
			was: before.date ? formatDate(before.date) : "No date",
			now: after.date ? formatDate(after.date) : "No date",
		});
	}
	const timeBefore = formatTimeRange(before.startTime, before.endTime);
	const timeAfter = formatTimeRange(after.startTime, after.endTime);
	if (timeBefore !== timeAfter) {
		changes.push({
			label: "Time",
			was: timeBefore ?? "No time",
			now: timeAfter ?? "No time",
		});
	}
	if (before.location !== after.location) {
		changes.push({
			label: "Where",
			was: before.location || "Nowhere yet",
			now: after.location || "To be announced",
		});
	}
	return changes;
}

/** People who have the invitation and have not said no. */
async function stillComing(db: Db, eventId: string): Promise<string[]> {
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

function requirePublishable(row: EventRow) {
	if (!row.date) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Give it a date before sending.",
		});
	}
	if (row.status === "canceled") {
		throw new ORPCError("BAD_REQUEST", { message: "It's canceled." });
	}
}

/** The page a guest sees. Hosts see the same page, with everything. */
async function invitePayload(
	db: Db,
	me: { id: string },
	access: Awaited<ReturnType<typeof accessTo>>,
) {
	const row = access.event;
	const [guests, potluck, hosts] = await Promise.all([
		guestsOf(db, row.id),
		row.potluckEnabled
			? potluckOf(db, row.id)
			: Promise.resolve({ lines: [], claims: [] }),
		hostsOf(db, row.id),
	]);
	const totals = tally(guests);
	const mine = access.guest;
	const myFriends = mine
		? guests.filter((g) => g.source === "guest" && g.addedBy === mine.userId)
		: [];
	const myClaims = mine
		? potluck.claims.filter((c) => c.guestId === mine.id).map((c) => c.itemId)
		: [];
	const showNames = row.showGuestNames || access.isHost;
	const names = (answer: "yes" | "maybe") =>
		showNames
			? guests.filter((g) => g.response === answer).map((g) => g.name)
			: [];
	const start = startsAt(row);
	return {
		now: new Date().toISOString(),
		startsAt: start?.toISOString() ?? null,
		isHost: access.isHost,
		event: {
			id: row.id,
			title: row.title,
			hostLine: row.hostLine,
			status: row.status,
			date: row.date,
			startTime: row.startTime,
			endTime: row.endTime,
			location: row.location,
			details: row.details,
			coverKey: row.coverKey,
			rsvpDeadline: row.rsvpDeadline,
			maxPlusOnes: row.maxPlusOnes,
			askKids: row.askKids,
			askDietary: row.askDietary,
			askNote: row.askNote,
			potluckEnabled: row.potluckEnabled,
			showGuestNames: row.showGuestNames,
			guestInviteLimit: row.guestInviteLimit,
			...labelsOf(row),
		},
		hosts: hosts.map((h) => ({ id: h.id, name: h.name })),
		me: mine
			? {
					guestId: mine.id,
					response: mine.response,
					adults: mine.adults,
					kids: mine.kids,
					dietary: mine.dietary,
					note: mine.note,
					claims: myClaims,
					name: guests.find((g) => g.id === mine.id)?.name ?? "",
					friends: myFriends.map((g) => ({
						guestId: g.id,
						name: g.name,
						email: g.email,
						response: g.response,
					})),
					// Asked here rather than on the page, so the form shows only when
					// the API would take it.
					canInvite:
						row.guestInvites &&
						row.status === "published" &&
						canInviteOthers(mine.source),
					invitesLeft: invitesLeft(row.guestInviteLimit, myFriends.length),
				}
			: null,
		viewerId: me.id,
		totals,
		headcount: headcount(totals),
		crowd: { yes: names("yes"), maybe: names("maybe") },
		potluck: potluck.lines.map((line) => ({
			...line,
			mine: myClaims.includes(line.id),
		})),
	};
}

export const eventsRouter = {
	/**
	 * The host dashboard: the caller's events as cards, with the tiles and
	 * the latest replies across all of them. `all` lets an admin see every
	 * event on the site, not just their own.
	 */
	mine: hostProcedure
		.input(
			z.object({ all: z.boolean().default(false) }).default({ all: false }),
		)
		.handler(async ({ context, input }) => {
			const all = input.all && isAdmin(context.me);
			const rows = all
				? await context.db.select().from(event).all()
				: await context.db
						.select(eventColumns)
						.from(event)
						.innerJoin(eventHost, eq(eventHost.eventId, event.id))
						.where(eq(eventHost.userId, context.me.id))
						.all();
			const today = todayOnSite();
			const cards = await cardsFor(context.db, rows);
			const byDate = (a: { date: string | null }, b: { date: string | null }) =>
				(a.date ?? "9999").localeCompare(b.date ?? "9999");
			const upcoming = cards
				.filter((c) => c.status !== "draft" && (c.date ?? "") >= today)
				.sort(byDate);
			const drafts = cards.filter((c) => c.status === "draft").sort(byDate);
			const past = cards
				.filter((c) => c.status !== "draft" && (c.date ?? "") < today)
				.sort(byDate)
				.reverse();

			const live = upcoming.filter((c) => c.status === "published");
			const ids = rows.map((r) => r.id);
			const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
			const fresh = ids.length
				? await context.db
						.select({
							guestId: eventGuest.id,
							eventId: eventGuest.eventId,
							name: user.name,
							response: eventGuest.response,
							adults: eventGuest.adults,
							kids: eventGuest.kids,
							respondedAt: eventGuest.respondedAt,
						})
						.from(eventGuest)
						.innerJoin(user, eq(user.id, eventGuest.userId))
						.where(
							and(
								inArray(eventGuest.eventId, ids.slice(0, 90)),
								isNotNull(eventGuest.respondedAt),
							),
						)
						.orderBy(desc(eventGuest.respondedAt))
						.limit(8)
						.all()
				: [];
			const titles = new Map(rows.map((r) => [r.id, r.title]));
			return {
				now: new Date().toISOString(),
				today,
				upcoming,
				drafts,
				past,
				tiles: {
					newReplies: fresh.filter(
						(f) => f.respondedAt && f.respondedAt > since,
					).length,
					// A canceled party has nobody left to decide and nothing to bring.
					deciding: live.reduce(
						(n, c) => n + c.totals.waiting + c.totals.maybe,
						0,
					),
					openSlots: live.reduce((n, c) => n + openSlots(c.potluck), 0),
				},
				fresh: fresh.map((f) => ({
					...f,
					eventTitle: titles.get(f.eventId) ?? "",
				})),
			};
		}),

	/** The caller's own invitations, upcoming first, for "My invites". */
	invites: personProcedure.handler(async ({ context }) => {
		const rows = await context.db
			.select({ ...eventColumns, response: eventGuest.response })
			.from(eventGuest)
			.innerJoin(event, eq(event.id, eventGuest.eventId))
			.where(
				and(eq(eventGuest.userId, context.me.id), ne(event.status, "draft")),
			)
			.all();
		const cards = await cardsFor(context.db, rows);
		const today = todayOnSite();
		const response = new Map(rows.map((r) => [r.id, r.response]));
		const withMine = cards.map((c) => ({
			...c,
			myResponse: response.get(c.id) ?? null,
		}));
		const byDate = (a: { date: string | null }, b: { date: string | null }) =>
			(a.date ?? "9999").localeCompare(b.date ?? "9999");
		return {
			today,
			upcoming: withMine.filter((c) => (c.date ?? "") >= today).sort(byDate),
			past: withMine
				.filter((c) => (c.date ?? "") < today)
				.sort(byDate)
				.reverse(),
		};
	}),

	/** The invitation page: for guests, and for hosts seeing it as a guest. */
	invite: personProcedure.input(idInput).handler(async ({ context, input }) => {
		const access = await accessTo(context.db, context.me, input.eventId);
		return invitePayload(context.db, context.me, access);
	}),

	/** Everything the editor needs. */
	get: hostProcedure.input(idInput).handler(async ({ context, input }) => {
		const { event: row } = await hostAccessTo(
			context.db,
			context.me,
			input.eventId,
		);
		const [guests, potluck, hosts] = await Promise.all([
			guestsOf(context.db, row.id),
			potluckOf(context.db, row.id),
			hostsOf(context.db, row.id),
		]);
		return {
			event: row,
			labels: labelsOf(row),
			hosts,
			guests: guests.map((g) => ({
				id: g.id,
				userId: g.userId,
				name: g.name,
				email: g.email,
				response: g.response,
				invitedAt: g.invitedAt,
				unreachable: g.unreachable,
			})),
			potluck: potluck.lines,
			notInvited: guests.filter((g) => g.invitedAt === null && !g.unreachable)
				.length,
			stillComing: (await stillComing(context.db, row.id)).length,
			shareUrl: `${siteUrl()}/i/${row.shareToken}`,
		};
	}),

	/** A new draft, owned by the caller. */
	create: hostProcedure
		.input(eventFields.partial().extend({ title: eventFields.shape.title }))
		.handler(async ({ context, input }) => {
			const id = crypto.randomUUID();
			await context.db.batch([
				context.db.insert(event).values({
					id,
					shareToken: newToken(),
					createdBy: context.me.id,
					...input,
				}),
				context.db
					.insert(eventHost)
					.values({ eventId: id, userId: context.me.id, isOwner: true }),
			]);
			return { id };
		}),

	/**
	 * Save the editor. On a published event with `notifyChanges`, moving the
	 * date, time or place tells everybody still coming -- the editor says so
	 * on the button, so the host knows mail will go.
	 */
	update: hostProcedure
		.input(idInput.extend({ fields: eventFields.partial() }))
		.handler(async ({ context, input }) => {
			const { event: before } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			if (before.status === "canceled") {
				throw new ORPCError("BAD_REQUEST", {
					message: "It's canceled. Make a new one instead.",
				});
			}
			const fields = { ...input.fields };
			const moved = NOTIFY_FIELDS.some(
				(k) => k in fields && fields[k] !== before[k],
			);
			// A reminder already resolved for the old date would never fire for
			// the new one, so moving the date or the deadline re-arms them.
			const rearm = {
				...(("date" in fields && fields.date !== before.date) ||
				("startTime" in fields && fields.startTime !== before.startTime)
					? { dayBeforeAt: null }
					: {}),
				...("rsvpDeadline" in fields &&
				fields.rsvpDeadline !== before.rsvpDeadline
					? { deadlineReminderAt: null }
					: {}),
			};
			await context.db
				.update(event)
				.set({ ...fields, ...rearm })
				.where(eq(event.id, before.id));
			const after = (await findEvent(context.db, before.id)) ?? before;

			let notified = 0;
			if (before.status === "published" && after.notifyChanges && moved) {
				const changes = describeChanges(before, after);
				if (changes.length > 0) {
					const result = await sendToList(context.db, {
						kind: "update",
						eventId: after.id,
						rendered: updateEmail(eventFacts(after), changes),
						sentBy: context.me.id,
						onlyPersonIds: await stillComing(context.db, after.id),
					});
					notified = result?.sent ?? 0;
				}
			}
			return { ok: true, notified };
		}),

	/**
	 * Replace the potluck list. Items missing from the new list go, and the
	 * claims on them with them; kept items keep their claims even if the
	 * quantity drops below what is claimed (the page shows them as full).
	 */
	setPotluck: hostProcedure
		.input(idInput.extend({ items: potluckInput }))
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			const keep = input.items.flatMap((i) => (i.id ? [i.id] : []));
			const statements = [
				context.db
					.delete(potluckItem)
					.where(
						keep.length
							? and(
									eq(potluckItem.eventId, row.id),
									notInArray(potluckItem.id, keep),
								)
							: eq(potluckItem.eventId, row.id),
					),
				...input.items.map((item, sort) =>
					item.id
						? context.db
								.update(potluckItem)
								.set({ label: item.label, quantity: item.quantity, sort })
								.where(
									and(
										eq(potluckItem.id, item.id),
										eq(potluckItem.eventId, row.id),
									),
								)
						: context.db.insert(potluckItem).values({
								id: crypto.randomUUID(),
								eventId: row.id,
								label: item.label,
								quantity: item.quantity,
								sort,
							}),
				),
			];
			await context.db.batch(
				statements as [(typeof statements)[0], ...typeof statements],
			);
			return { ok: true };
		}),

	/**
	 * Put up a cover photo. The browser scales it down before upload, so the
	 * limit here is a backstop, not the usual case. The old photo is deleted
	 * after the new one is in place, never before.
	 */
	uploadCover: hostProcedure
		.input(
			idInput.extend({
				file: z
					.file()
					.max(5 * 1024 * 1024, "Under 5 MB, please.")
					.mime([...COVER_TYPES], "A JPEG, PNG or WebP, please."),
			}),
		)
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			const type = input.file.type as (typeof COVER_TYPES)[number];
			const key = `covers/${crypto.randomUUID()}.${COVER_EXT[type]}`;
			// zod's `File` and the Workers `Blob` are different declarations of
			// the same object; the cast is the File/Blob mismatch CLAUDE.md
			// mentions, not a conversion.
			const bytes = await (input.file as unknown as Blob).arrayBuffer();
			await context.env.MEDIA.put(key, bytes, {
				httpMetadata: { contentType: type },
				customMetadata: { eventId: row.id, uploadedBy: context.me.id },
			});
			await context.db
				.update(event)
				.set({ coverKey: key })
				.where(eq(event.id, row.id));
			if (row.coverKey) await context.env.MEDIA.delete(row.coverKey);
			return { coverKey: key };
		}),

	removeCover: hostProcedure
		.input(idInput)
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			await context.db
				.update(event)
				.set({ coverKey: null })
				.where(eq(event.id, row.id));
			if (row.coverKey) await context.env.MEDIA.delete(row.coverKey);
			return { ok: true };
		}),

	/**
	 * Make somebody a co-host by address. They must already be a host: being
	 * able to run events is an admin's call, not another host's.
	 */
	addCohost: hostProcedure
		.input(idInput.extend({ email: z.email().max(254) }))
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			const person = await context.db
				.select({ id: user.id, role: user.role, status: user.status })
				.from(user)
				.where(eq(user.email, normalizeEmail(input.email)))
				.get();
			if (!person || person.status === "deactivated" || !canHost(person)) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"Co-hosts have to be hosts on the site. Ask an admin to make them one.",
				});
			}
			await context.db
				.insert(eventHost)
				.values({ eventId: row.id, userId: person.id })
				.onConflictDoNothing();
			return { ok: true };
		}),

	removeCohost: hostProcedure
		.input(idInput.extend({ userId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			const result = await context.db
				.delete(eventHost)
				.where(
					and(
						eq(eventHost.eventId, row.id),
						eq(eventHost.userId, input.userId),
						eq(eventHost.isOwner, false),
					),
				)
				.run();
			if (result.meta.changes !== 1) {
				throw new ORPCError("BAD_REQUEST", {
					message: "The owner stays. Remove a co-host instead.",
				});
			}
			return { ok: true };
		}),

	/**
	 * Send the invitations: publishes a draft, and on a published event sends
	 * to whoever was added since. Each person gets one invitation, ever.
	 */
	send: hostProcedure.input(idInput).handler(async ({ context, input }) => {
		const { event: before } = await hostAccessTo(
			context.db,
			context.me,
			input.eventId,
		);
		requirePublishable(before);
		if (before.status === "draft") {
			await context.db
				.update(event)
				.set({ status: "published", publishedAt: new Date() })
				.where(and(eq(event.id, before.id), eq(event.status, "draft")));
		}
		const row = (await findEvent(context.db, before.id)) ?? before;
		const outcome = await sendInvites(context.db, row, context.me.id);
		return { ...outcome, dryRun: getMailer().dryRun };
	}),

	/** Call it off, and tell everybody who was still coming if asked to. */
	cancel: hostProcedure
		.input(
			idInput.extend({
				note: z.string().trim().max(1000).default(""),
				notify: z.boolean().default(true),
			}),
		)
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			if (row.status !== "published") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Only a sent event can be canceled. Delete a draft instead.",
				});
			}
			const result = await context.db
				.update(event)
				.set({ status: "canceled", canceledAt: new Date() })
				.where(and(eq(event.id, row.id), eq(event.status, "published")))
				.run();
			if (result.meta.changes !== 1) return { notified: 0 };
			if (!input.notify) return { notified: 0 };
			const sent = await sendToList(context.db, {
				kind: "cancel",
				eventId: row.id,
				rendered: cancelEmail(eventFacts(row), input.note),
				sentBy: context.me.id,
				onlyPersonIds: await stillComing(context.db, row.id),
			});
			return { notified: sent?.sent ?? 0 };
		}),

	/** Delete a draft or a canceled event. A live one must be canceled first. */
	remove: hostProcedure.input(idInput).handler(async ({ context, input }) => {
		const { event: row } = await hostAccessTo(
			context.db,
			context.me,
			input.eventId,
		);
		if (row.status === "published") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Cancel it first, so the guests hear about it.",
			});
		}
		await context.db.delete(event).where(eq(event.id, row.id));
		if (row.coverKey) await context.env.MEDIA.delete(row.coverKey);
		return { ok: true };
	}),

	/**
	 * Nudge the people who have the invitation and have not answered: all of
	 * them, or one. Each person is nudged at most once every twelve hours,
	 * claimed in the UPDATE so two hosts pressing at once send one email.
	 */
	nudge: hostProcedure
		.input(idInput.extend({ guestId: z.string().min(1).optional() }))
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			if (row.status !== "published") {
				throw new ORPCError("BAD_REQUEST", { message: "It hasn't gone out." });
			}
			const now = new Date();
			const claimed = await context.db
				.update(eventGuest)
				.set({ nudgedAt: now })
				.where(
					and(
						eq(eventGuest.eventId, row.id),
						input.guestId ? eq(eventGuest.id, input.guestId) : undefined,
						isNull(eventGuest.response),
						isNotNull(eventGuest.invitedAt),
						or(
							isNull(eventGuest.nudgedAt),
							lt(
								eventGuest.nudgedAt,
								new Date(now.getTime() - NUDGE_COOLDOWN_MS),
							),
						),
					),
				)
				.returning({ userId: eventGuest.userId })
				.all();
			if (claimed.length === 0) {
				return { sent: 0, waiting: true };
			}
			const result = await sendToList(context.db, {
				kind: "nudge",
				eventId: row.id,
				rendered: nudgeEmail(eventFacts(row)),
				sentBy: context.me.id,
				onlyPersonIds: claimed.map((c) => c.userId),
			});
			return { sent: result?.sent ?? 0, waiting: false };
		}),

	/** Retire the share link and make a new one. Invitations are unaffected. */
	resetShareLink: hostProcedure
		.input(idInput)
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			const token = newToken();
			await context.db
				.update(event)
				.set({ shareToken: token })
				.where(eq(event.id, row.id));
			return { shareUrl: `${siteUrl()}/i/${token}` };
		}),

	/** The guest list as CSV, for a spreadsheet or a caterer. */
	exportCsv: hostProcedure
		.input(idInput)
		.handler(async ({ context, input }) => {
			const { event: row } = await hostAccessTo(
				context.db,
				context.me,
				input.eventId,
			);
			const [guests, potluck] = await Promise.all([
				guestsOf(context.db, row.id),
				potluckOf(context.db, row.id),
			]);
			const labels = new Map(potluck.lines.map((l) => [l.id, l.label]));
			const bringing = (guestId: string) =>
				potluck.claims
					.filter((c) => c.guestId === guestId)
					.map((c) => labels.get(c.itemId) ?? "")
					.join("; ");
			const header = [
				"Name",
				"Email",
				"Answer",
				"Adults",
				"Kids",
				"Dietary",
				"Note",
				"Bringing",
				"Answered",
				"Added by",
			];
			const lines = guests.map((g) => [
				g.name,
				g.email,
				g.response ?? "no reply",
				g.response === "yes" ? String(g.adults) : "",
				g.response === "yes" ? String(g.kids) : "",
				g.dietary,
				g.note,
				bringing(g.id),
				g.respondedAt ? g.respondedAt.toISOString() : "",
				g.source === "guest"
					? (g.addedByName ?? "a guest")
					: g.source === "link"
						? "share link"
						: "host",
			]);
			const csv = [header, ...lines]
				.map((cells) => cells.map(csvCell).join(","))
				.join("\r\n");
			return {
				fileName: `${row.title.replace(/[^\w\- ]+/g, "").trim() || "guests"}.csv`,
				csv,
			};
		}),

	/** What a share link shows before anybody signs in: the outside of the envelope. */
	teaser: publicProcedure
		.input(z.object({ token: z.string().min(1).max(64) }))
		.handler(async ({ context, input }) => {
			const row = await findEventByShareToken(context.db, input.token);
			if (!row?.shareEnabled || row.status === "draft") throw notFound();
			return {
				eventId: row.id,
				title: row.title,
				hostLine: row.hostLine,
				coverKey: row.coverKey,
				status: row.status,
				...labelsOf(row),
			};
		}),

	/**
	 * A stranger on a share link types their address. Says the same thing
	 * whatever happens -- new person, known person, deactivated, too soon --
	 * so the form cannot be used to learn who is on the site. Rate-limited by
	 * address (the cooldown) and by IP (the Workers rate limiter), so it
	 * cannot be turned into a way to mail strangers.
	 */
	join: publicProcedure
		.input(
			z.object({
				token: z.string().min(1).max(64),
				email: z.email("That doesn't look like an email address.").max(254),
			}),
		)
		.handler(async ({ context, input }) => {
			const row = await findEventByShareToken(context.db, input.token);
			if (!row?.shareEnabled || row.status !== "published") {
				throw notFound();
			}
			const ip = context.headers.get("cf-connecting-ip") ?? "local";
			const { success } = await context.env.JOIN_LIMITER.limit({ key: ip });
			if (!success) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "Too many tries. Wait a minute and try again.",
				});
			}
			const email = normalizeEmail(input.email);
			const existing = await findReachablePersonByEmail(context.db, email);
			if (
				existing?.linkSentAt &&
				Date.now() - existing.linkSentAt.getTime() < JOIN_COOLDOWN_MS
			) {
				return { ok: true };
			}
			const [person] = await findOrCreatePeople(context.db, [email], "link");
			if (!person || person.status === "deactivated") return { ok: true };
			const token = await context.db
				.select({ linkToken: user.linkToken })
				.from(user)
				.where(eq(user.id, person.id))
				.get();
			if (!token?.linkToken) return { ok: true };
			const outcome = await getMailer().sendOne(
				{ email: person.email, name: null },
				joinLinkEmail({
					title: row.title,
					url: signInUrl(token.linkToken, `/i/${row.shareToken}`),
					coverUrl: row.coverKey ? coverUrl(siteUrl(), row.coverKey) : null,
				}),
				{ tags: ["join_link"] },
			);
			if (outcome.ok) await markLinkSent(context.db, person.id);
			return { ok: true };
		}),

	/**
	 * Signed in on a share link: put the caller on the list. They clicked a
	 * link in their own inbox to get here, so they count as invited and get
	 * no invitation email on top.
	 */
	claimJoin: personProcedure
		.input(z.object({ token: z.string().min(1).max(64) }))
		.handler(async ({ context, input }) => {
			const row = await findEventByShareToken(context.db, input.token);
			if (!row?.shareEnabled || row.status === "draft") throw notFound();
			await context.db
				.insert(eventGuest)
				.values({
					id: crypto.randomUUID(),
					eventId: row.id,
					userId: context.me.id,
					source: "link",
					invitedAt: new Date(),
				})
				.onConflictDoNothing();
			return { eventId: row.id };
		}),
};

/**
 * Every event column by name, so a join can select them flat. Read off the
 * table rather than listed, so a new column cannot be forgotten here.
 */
const eventColumns = getTableColumns(event);

/** One CSV cell, quoted when it has to be, and never read as a formula. */
function csvCell(value: string): string {
	const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
