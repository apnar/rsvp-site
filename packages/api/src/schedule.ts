/**
 * When an event's own emails go out. Pure: given an event's settings, its
 * stamps and a clock, say what is due. The cron job does the reading,
 * claiming and sending; these rules are what the tests pin down.
 *
 * Every moment is a wall-clock time on the site's clock, turned into an
 * instant by `siteInstant`, so a reminder sent across a daylight-saving
 * weekend still lands at ten in the morning.
 *
 * A stamp means resolved, not sent. An email whose moment has passed is
 * stamped without sending -- otherwise the job would retry it every half
 * hour forever -- and `email_send` stays the record of what actually went.
 */

import type { EventStatus, HostAlerts } from "@rsvp-site/db/schema/event";

import { addDays, siteInstant, todayOnSite } from "./time";

/** Reminders go out mid-morning, when people read mail and can still plan. */
export const REMINDER_TIME = "10:00";
/** The host digest covers the day before and lands with the coffee. */
export const DIGEST_TIME = "08:00";

export type ScheduleEvent = {
	status: EventStatus;
	date: string | null;
	startTime: string | null;
	rsvpDeadline: string | null;
	remindDeadline: boolean;
	remindDaysBefore: number;
	remindDayBefore: boolean;
	hostAlerts: HostAlerts;
	/** Paper invitations hold guest email until the host releases it. */
	paper: boolean;
	emailsReleasedAt: Date | null;
	publishedAt: Date | null;
	deadlineReminderAt: Date | null;
	dayBeforeAt: Date | null;
	digestAt: Date | null;
};

export type DueKind = "deadline_reminder" | "day_before" | "host_digest";

export type Due = {
	kind: DueKind;
	/** `send` when its moment is now; `skip` to stamp it resolved quietly. */
	action: "send" | "skip";
	/**
	 * For the digest, the slot being claimed: today's DIGEST_TIME. The claim
	 * only succeeds while the stored stamp is older, which is what keeps a
	 * repeating email to once a day.
	 */
	slot?: Date;
};

/** When the event starts, or null when it has no date yet. */
export function startsAt(e: Pick<ScheduleEvent, "date" | "startTime">) {
	return e.date ? siteInstant(e.date, e.startTime ?? "00:00") : null;
}

/** When the deadline reminder is due, or null when there is not one. */
export function deadlineReminderAt(
	e: Pick<ScheduleEvent, "rsvpDeadline" | "remindDaysBefore">,
): Date | null {
	if (!e.rsvpDeadline) return null;
	const days = Math.max(0, Math.trunc(e.remindDaysBefore));
	return siteInstant(addDays(e.rsvpDeadline, -days), REMINDER_TIME);
}

/** When the day-before reminder is due, or null without a date. */
export function dayBeforeAt(e: Pick<ScheduleEvent, "date">): Date | null {
	return e.date ? siteInstant(addDays(e.date, -1), REMINDER_TIME) : null;
}

export function dueEmails(e: ScheduleEvent, now: Date): Due[] {
	if (e.status !== "published" || !e.publishedAt) return [];
	const due: Due[] = [];
	const t = now.getTime();
	const start = startsAt(e)?.getTime() ?? null;
	// When guests first heard from us by email: publishing, or for a paper
	// event the host's "Start emails". Until then a paper event's guests get
	// nothing -- their card is meant to arrive first.
	const held = e.paper && e.emailsReleasedAt === null;
	const published = (
		e.paper ? (e.emailsReleasedAt ?? e.publishedAt) : e.publishedAt
	).getTime();
	const started = start !== null && t >= start;

	if (
		!held &&
		e.remindDeadline &&
		e.rsvpDeadline &&
		e.deadlineReminderAt === null
	) {
		const at = deadlineReminderAt(e)?.getTime() ?? null;
		// The deadline day runs to midnight; after that, nobody is late any more.
		const closes = siteInstant(addDays(e.rsvpDeadline, 1), "00:00").getTime();
		if (at !== null && t >= at) {
			// Published after the reminder was due: the invitation itself just
			// went out, and a "still deciding?" on its heels is noise.
			const stale = t >= closes || started || published >= at;
			due.push({ kind: "deadline_reminder", action: stale ? "skip" : "send" });
		}
	}

	if (!held && e.remindDayBefore && e.date && e.dayBeforeAt === null) {
		const at = dayBeforeAt(e)?.getTime() ?? null;
		if (at !== null && t >= at) {
			const stale = started || published >= at;
			due.push({ kind: "day_before", action: stale ? "skip" : "send" });
		}
	}

	if (e.hostAlerts === "daily") {
		const today = todayOnSite(now);
		const slot = siteInstant(today, DIGEST_TIME);
		// Through the morning after the event, for the replies of its last day.
		const over = e.date !== null && today > addDays(e.date, 1);
		const claimed =
			e.digestAt !== null && e.digestAt.getTime() >= slot.getTime();
		// The digest is for hosts, so a paper hold does not stop it, and it
		// counts from publishing rather than from the release.
		const live = e.publishedAt.getTime();
		if (!over && !claimed && t >= slot.getTime() && live < slot.getTime()) {
			due.push({ kind: "host_digest", action: "send", slot });
		}
	}

	return due;
}

/**
 * The window a digest reports on: replies since the last one, or since the
 * event went out for the first.
 */
export function digestSince(
	e: Pick<ScheduleEvent, "digestAt" | "publishedAt">,
): Date {
	return e.digestAt ?? e.publishedAt ?? new Date(0);
}
