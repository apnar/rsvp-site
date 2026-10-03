/**
 * Ending things: calling an event off, and erasing an event or a person for
 * good. Every foreign key to `event` and `user` is ON DELETE CASCADE or SET
 * NULL, so a delete is one statement and D1 takes the guest lists, answers,
 * claims, hosts, contacts and sessions with it. What D1 cannot reach is R2.
 */

import type { Db } from "@rsvp-site/db";
import { canHost } from "@rsvp-site/db/roles";
import { user } from "@rsvp-site/db/schema/auth";
import { event, eventHost } from "@rsvp-site/db/schema/event";
import { cancelEmail } from "@rsvp-site/email";
import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { type OwnedEvent, planRemoval } from "./event-rules";
import { type EventRow, emailsHeld, stillComing } from "./events";
import { eventFacts, sendToList } from "./mail";
import { deleteDesignMedia, type Env } from "./media";

/**
 * Cancel a sent event, and tell everybody still coming if asked. Returns how
 * many were told. A second caller loses the claim and tells nobody.
 * `pictures: false` leaves the cover and the card out of the email, for an
 * event about to be erased: mail clients fetch them when it is opened.
 */
export async function callOff(
	db: Db,
	row: EventRow,
	opts: { note: string; notify: boolean; sentBy: string; pictures: boolean },
): Promise<number> {
	const result = await db
		.update(event)
		.set({ status: "canceled", canceledAt: new Date() })
		.where(and(eq(event.id, row.id), eq(event.status, "published")))
		.run();
	if (result.meta.changes !== 1) return 0;
	// Held paper events tell nobody by email; the host knows who has a card
	// and can tell them.
	if (!opts.notify || emailsHeld(row)) return 0;
	const shown = opts.pictures ? row : { ...row, coverKey: null, cardKey: null };
	const sent = await sendToList(db, {
		kind: "cancel",
		eventId: row.id,
		rendered: cancelEmail(eventFacts(shown), opts.note),
		sentBy: opts.sentBy,
		onlyPersonIds: await stillComing(db, row.id),
	});
	return sent?.sent ?? 0;
}

/** An erased event's pictures: the cover, and everything under its designs. */
export async function deleteEventMedia(
	env: Env,
	row: Pick<EventRow, "id" | "coverKey">,
) {
	if (row.coverKey) await env.MEDIA.delete(row.coverKey);
	await deleteDesignMedia(env, row.id);
}

type Owned = OwnedEvent & Pick<EventRow, "coverKey">;

/**
 * The events a person owns, each with its heir: the co-host who has hosted
 * it longest and may still host. A demoted or deactivated co-host keeps
 * their row but cannot run the event, so they never inherit it.
 */
async function ownedEvents(db: Db, userId: string): Promise<Owned[]> {
	const mine = db
		.select({ id: eventHost.eventId })
		.from(eventHost)
		.where(and(eq(eventHost.userId, userId), eq(eventHost.isOwner, true)));
	const [rows, others] = await Promise.all([
		db
			.select({
				id: event.id,
				title: event.title,
				status: event.status,
				date: event.date,
				startTime: event.startTime,
				coverKey: event.coverKey,
			})
			.from(event)
			.where(inArray(event.id, mine))
			.all(),
		// Subqueries, not id lists: D1 caps bound parameters.
		db
			.select({
				eventId: eventHost.eventId,
				id: user.id,
				name: user.name,
				role: user.role,
				status: user.status,
			})
			.from(eventHost)
			.innerJoin(user, eq(user.id, eventHost.userId))
			.where(
				and(inArray(eventHost.eventId, mine), ne(eventHost.userId, userId)),
			)
			.orderBy(asc(eventHost.createdAt))
			.all(),
	]);
	const heirs = new Map<string, { id: string; name: string }>();
	for (const o of others) {
		if (heirs.has(o.eventId) || o.status === "deactivated" || !canHost(o)) {
			continue;
		}
		heirs.set(o.eventId, { id: o.id, name: o.name });
	}
	return rows.map((r) => ({ ...r, heir: heirs.get(r.id) ?? null }));
}

/** What deleting a person would do to their events, read fresh each time. */
export async function removalPlan(db: Db, userId: string) {
	return planRemoval(await ownedEvents(db, userId));
}

/**
 * Erase a person: hand their co-hosted events over, erase the ones they host
 * alone, and delete the row, in one batch so a failure leaves them whole.
 * The caller has checked the plan has nothing blocking. Brevo is left alone
 * on purpose: its blocklist keeps an address that unsubscribed or bounced
 * from being mailed if somebody adds it again.
 */
export async function erasePerson(
	db: Db,
	env: Env,
	userId: string,
	plan: Awaited<ReturnType<typeof removalPlan>>,
) {
	await db.batch([
		db.delete(user).where(eq(user.id, userId)),
		...plan.handOff.map((h) =>
			db
				.update(eventHost)
				.set({ isOwner: true })
				.where(
					and(eq(eventHost.eventId, h.event.id), eq(eventHost.userId, h.to.id)),
				),
		),
		...plan.erase.map((e) => db.delete(event).where(eq(event.id, e.id))),
	]);
	for (const e of plan.erase) await deleteEventMedia(env, e);
}
