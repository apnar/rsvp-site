/**
 * Rules about what a change to an event means, and one export format.
 * Pure (no drizzle at runtime), so the tests pin them down.
 */

import type { Access, EventRow } from "./events";
import { startsAt } from "./schedule";
import { formatDate, formatTimeRange } from "./time";

// Defined in schedule.ts, which must stay free of this file's imports, and
// re-exported so every caller reaches the rule through event-rules.
export { emailsHeld } from "./schedule";

/**
 * Why nothing can be asked of an event's guests right now, or null while it
 * is open: published, not canceled, not started. One wording per refusal,
 * so answering, inviting a friend and nudging cannot drift apart.
 */
export function openRefusal(
	row: Pick<EventRow, "status" | "date" | "startTime">,
	now: number = Date.now(),
): string | null {
	if (row.status === "canceled") return "It's been canceled.";
	if (row.status !== "published") return "It hasn't gone out yet.";
	const start = startsAt(row);
	if (start && now >= start.getTime()) return "It's already started.";
	return null;
}

/** Fields a guest would want to hear changed. Details and notes are not. */
const NOTIFY_FIELDS = ["date", "startTime", "endTime", "location"] as const;

type Notify = Pick<EventRow, (typeof NOTIFY_FIELDS)[number]>;

/** Whether an edit touches anything worth emailing the guests about. */
export function movesGuestFacts(before: Notify, fields: Partial<Notify>) {
	return NOTIFY_FIELDS.some((k) => k in fields && fields[k] !== before[k]);
}

export function describeChanges(before: Notify, after: Notify) {
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

/**
 * The reminder stamps to clear for an edit. A reminder already resolved for
 * the old date would never fire for the new one, so moving the date or the
 * deadline re-arms them.
 */
export function rearmFor(
	before: Pick<EventRow, "date" | "startTime" | "rsvpDeadline">,
	fields: Partial<Pick<EventRow, "date" | "startTime" | "rsvpDeadline">>,
) {
	return {
		...(("date" in fields && fields.date !== before.date) ||
		("startTime" in fields && fields.startTime !== before.startTime)
			? { dayBeforeAt: null }
			: {}),
		...("rsvpDeadline" in fields && fields.rsvpDeadline !== before.rsvpDeadline
			? { deadlineReminderAt: null }
			: {}),
	};
}

/** One CSV cell, quoted when it has to be, and never read as a formula. */
export function csvCell(value: string): string {
	const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * Whether the caller may erase an event. A draft is any host's, as it
 * always was; once it has gone out, deleting takes the guest list and every
 * answer with it, so only the owner or an admin may. Co-hosts can cancel.
 */
export function mayDelete(
	row: Pick<EventRow, "status">,
	who: { isHost: boolean; isOwner: boolean; isAdmin: boolean },
): boolean {
	if (row.status === "draft") return who.isHost;
	return who.isOwner || who.isAdmin;
}

/**
 * The invitation a visit to the invite page counts as viewed, or null.
 * Only the guest's own: a host or an admin looking at the page as a guest
 * sees it for their own reasons, and a relative opening theirs hasn't
 * shown it to the family they answer for.
 */
export function viewedGuestId(
	access: Pick<Access, "isHost" | "guest">,
): string | null {
	return access.guest && !access.isHost ? access.guest.id : null;
}

/**
 * How stale `last_viewed_at` must be before a visit rewrites it, so tabs
 * left open and reloads don't each cost a write.
 */
export const VIEW_REFRESH_MS = 10 * 60_000;

/**
 * Sent and not started: guests are still expecting it, so deleting it is
 * canceling it first. Past, canceled and draft events just go.
 */
export function expectingGuests(
	row: Pick<EventRow, "status" | "date" | "startTime">,
	now: number = Date.now(),
): boolean {
	return openRefusal(row, now) === null;
}

/** One event the person being deleted owns, with who could take it over. */
export type OwnedEvent = Pick<
	EventRow,
	"id" | "title" | "status" | "date" | "startTime"
> & {
	/** The co-host who would become owner: the first who may still host. */
	heir: { id: string; name: string } | null;
};

/**
 * What deleting a person does to the events they own. Co-hosted ones pass
 * to the co-host; ones they host alone go with them, unless guests are still
 * expecting one, which blocks the delete: erasing a party out from under
 * its guests is a cancellation nobody was told about.
 */
export function planRemoval<T extends OwnedEvent>(
	owned: T[],
	now: number = Date.now(),
) {
	const handOff: { event: T; to: { id: string; name: string } }[] = [];
	const erase: T[] = [];
	const blocking: T[] = [];
	for (const e of owned) {
		if (e.heir) handOff.push({ event: e, to: e.heir });
		else if (expectingGuests(e, now)) blocking.push(e);
		else erase.push(e);
	}
	return { handOff, erase, blocking };
}
