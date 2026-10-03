/**
 * Rules about what a change to an event means, and one export format.
 * Pure (no drizzle at runtime), so the tests pin them down.
 */

import type { EventRow } from "./events";
import { formatDate, formatTimeRange } from "./time";

/** Fields a guest would want to hear changed. Details and notes are not. */
export const NOTIFY_FIELDS = [
	"date",
	"startTime",
	"endTime",
	"location",
] as const;

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
