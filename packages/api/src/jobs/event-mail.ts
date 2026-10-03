/**
 * The half-hourly pass over upcoming events: deadline reminders, day-before
 * reminders and host digests. `schedule.ts` decides what is due; this reads,
 * claims and sends, in that order, so an email that turns out to have nobody
 * to go to is resolved without being recorded as a send.
 *
 * The claim is a conditional UPDATE that only succeeds while the stamp is
 * unset (or, for the repeating digest, older than this morning's slot), with
 * `meta.changes === 1` as the lock. Two overlapping passes cannot both send.
 */

import type { Db } from "@rsvp-site/db";
import { user } from "@rsvp-site/db/schema/auth";
import { event, eventGuest } from "@rsvp-site/db/schema/event";
import {
	dayBeforeEmail,
	deadlineReminderEmail,
	hostDigestEmail,
	type Rendered,
} from "@rsvp-site/email";
import {
	and,
	asc,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
} from "drizzle-orm";

import { cleanTheme, type EventRow, guestCountsOf, hostIdsOf } from "../events";
import { eventFacts, hostTotals, sendToList } from "../mail";
import { type Due, digestSince, dueEmails } from "../schedule";
import { addDays, todayOnSite } from "../time";

export type MailOutcome = {
	eventId: string;
	kind: Due["kind"];
	sent: number;
	failed: number;
	quiet?: string;
};

type StampColumn = "deadlineReminderAt" | "dayBeforeAt";

const COLUMN: Record<Exclude<Due["kind"], "host_digest">, StampColumn> = {
	deadline_reminder: "deadlineReminderAt",
	day_before: "dayBeforeAt",
};

async function claim(db: Db, id: string, column: StampColumn, now: Date) {
	const result = await db
		.update(event)
		.set({ [column]: now })
		.where(and(eq(event.id, id), isNull(event[column])))
		.run();
	return result.meta.changes === 1;
}

async function release(db: Db, id: string, column: StampColumn) {
	await db
		.update(event)
		.set({ [column]: null })
		.where(eq(event.id, id));
}

/** Who a reminder goes to: invited people, by what they have said. */
async function invitedWith(
	db: Db,
	eventId: string,
	answers: "none" | "coming",
): Promise<string[]> {
	const rows = await db
		.select({ userId: eventGuest.userId })
		.from(eventGuest)
		.where(
			and(
				eq(eventGuest.eventId, eventId),
				isNotNull(eventGuest.invitedAt),
				answers === "none"
					? isNull(eventGuest.response)
					: inArray(eventGuest.response, ["yes", "maybe"]),
			),
		)
		.all();
	return rows.map((r) => r.userId);
}

/** Send one stamped reminder, giving the stamp back if nothing left. */
async function sendStamped(
	db: Db,
	row: EventRow,
	kind: "deadline_reminder" | "day_before",
	rendered: Rendered,
	to: string[],
	now: Date,
): Promise<MailOutcome> {
	const column = COLUMN[kind];
	if (!(await claim(db, row.id, column, now))) {
		return { eventId: row.id, kind, sent: 0, failed: 0, quiet: "Taken." };
	}
	let result: Awaited<ReturnType<typeof sendToList>>;
	try {
		result = await sendToList(db, {
			kind,
			eventId: row.id,
			rendered,
			onlyPersonIds: to,
		});
	} catch (error) {
		await release(db, row.id, column);
		throw error;
	}
	// Nobody reachable is a resolved reminder, not a failed one.
	if (!result) {
		return { eventId: row.id, kind, sent: 0, failed: 0, quiet: "Nobody." };
	}
	// Every batch rejected: give it back and try on the next pass.
	if (result.sent === 0) await release(db, row.id, column);
	return {
		eventId: row.id,
		kind,
		sent: result.sent,
		failed: result.attempted - result.sent,
	};
}

async function runDue(
	db: Db,
	row: EventRow,
	due: Due,
	now: Date,
): Promise<MailOutcome | null> {
	if (due.kind === "host_digest") return runDigest(db, row, due);
	const column = COLUMN[due.kind];
	if (due.action === "skip") {
		await claim(db, row.id, column, now);
		return {
			eventId: row.id,
			kind: due.kind,
			sent: 0,
			failed: 0,
			quiet: "Too late.",
		};
	}
	const to = await invitedWith(
		db,
		row.id,
		due.kind === "deadline_reminder" ? "none" : "coming",
	);
	const facts = eventFacts(row);
	const rendered =
		due.kind === "deadline_reminder"
			? deadlineReminderEmail(facts)
			: dayBeforeEmail(facts);
	if (to.length === 0) {
		await claim(db, row.id, column, now);
		return {
			eventId: row.id,
			kind: due.kind,
			sent: 0,
			failed: 0,
			quiet: "Nobody.",
		};
	}
	return sendStamped(db, row, due.kind, rendered, to, now);
}

/**
 * The host digest. Claims this morning's slot first; the replies it reports
 * are the ones since the previous slot, read before the claim moved it.
 * A morning with no replies is claimed and sends nothing.
 */
async function runDigest(
	db: Db,
	row: EventRow,
	due: Extract<Due, { kind: "host_digest" }>,
): Promise<MailOutcome | null> {
	const slot = due.slot;
	const since = digestSince(row);
	const result = await db
		.update(event)
		.set({ digestAt: slot })
		.where(
			and(
				eq(event.id, row.id),
				or(isNull(event.digestAt), lt(event.digestAt, slot)),
			),
		)
		.run();
	if (result.meta.changes !== 1) return null;

	// Past this point the slot is claimed. Anything that stops the send
	// short of the mail leaving puts the old stamp back, so the next pass
	// tries this morning again instead of skipping the digest for a day.
	const giveBack = () =>
		db
			.update(event)
			.set({ digestAt: row.digestAt })
			.where(and(eq(event.id, row.id), eq(event.digestAt, slot)));
	try {
		const outcome = await digestFor(db, row, since, slot);
		// Every batch refused: nothing reached the hosts, so the slot goes back.
		if (outcome.sent === 0 && outcome.failed > 0) await giveBack();
		return outcome;
	} catch (error) {
		await giveBack();
		throw error;
	}
}

async function digestFor(
	db: Db,
	row: EventRow,
	since: Date,
	slot: Date,
): Promise<MailOutcome> {
	const replies = await db
		.select({
			name: user.name,
			response: eventGuest.response,
			adults: eventGuest.adults,
			kids: eventGuest.kids,
			note: eventGuest.note,
		})
		.from(eventGuest)
		.innerJoin(user, eq(user.id, eventGuest.userId))
		.where(
			and(
				eq(eventGuest.eventId, row.id),
				gt(eventGuest.respondedAt, since),
				lt(eventGuest.respondedAt, slot),
			),
		)
		.orderBy(asc(eventGuest.respondedAt))
		.all();
	const lines = replies.flatMap((r) =>
		r.response ? [{ ...r, response: r.response }] : [],
	);
	if (lines.length === 0) {
		return {
			eventId: row.id,
			kind: "host_digest",
			sent: 0,
			failed: 0,
			quiet: "No replies.",
		};
	}
	const totals = hostTotals(await guestCountsOf(db, row.id));
	const sent = await sendToList(db, {
		kind: "host_digest",
		eventId: row.id,
		rendered: hostDigestEmail(eventFacts(row), lines, totals),
		onlyPersonIds: await hostIdsOf(db, row.id),
	});
	return {
		eventId: row.id,
		kind: "host_digest",
		sent: sent?.sent ?? 0,
		failed: sent ? sent.attempted - sent.sent : 0,
	};
}

/**
 * One pass. Looks only at published events from yesterday on (yesterday
 * for the morning-after digest) and those with no date. One event failing
 * does not stop the rest.
 */
export async function runEventMail(
	db: Db,
	now: Date = new Date(),
): Promise<MailOutcome[]> {
	const from = addDays(todayOnSite(now), -1);
	const rows = await db
		.select()
		.from(event)
		.where(
			and(
				eq(event.status, "published"),
				or(isNull(event.date), gte(event.date, from)),
			),
		)
		.all()
		.then((found) => found.map(cleanTheme));
	const outcomes: MailOutcome[] = [];
	for (const row of rows) {
		for (const due of dueEmails(row, now)) {
			try {
				const outcome = await runDue(db, row, due, now);
				if (outcome) outcomes.push(outcome);
			} catch (error) {
				console.error(`event mail ${row.id} ${due.kind} failed`, error);
			}
		}
	}
	return outcomes;
}
