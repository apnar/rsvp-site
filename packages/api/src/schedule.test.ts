import { describe, expect, it } from "vitest";

import {
	dayBeforeAt,
	deadlineReminderAt,
	dueEmails,
	type ScheduleEvent,
} from "./schedule";
import { siteInstant } from "./time";

const at = (date: string, time: string) => siteInstant(date, time);

/** Sat, Oct 24 2026 at 5 PM, deadline Sat, Oct 17, published Oct 1. */
const base: ScheduleEvent = {
	status: "published",
	date: "2026-10-24",
	startTime: "17:00",
	rsvpDeadline: "2026-10-17",
	remindDeadline: true,
	remindDaysBefore: 3,
	remindDayBefore: true,
	hostAlerts: "off",
	publishedAt: at("2026-10-01", "12:00"),
	deadlineReminderAt: null,
	dayBeforeAt: null,
	digestAt: null,
};

const kinds = (e: ScheduleEvent, now: Date) =>
	dueEmails(e, now).map((d) => `${d.kind}:${d.action}`);

describe("when the reminders fall", () => {
	it("puts the deadline reminder N days ahead at ten in the morning", () => {
		expect(deadlineReminderAt(base)?.toISOString()).toBe(
			at("2026-10-14", "10:00").toISOString(),
		);
		expect(deadlineReminderAt({ ...base, remindDaysBefore: 0 })).toEqual(
			at("2026-10-17", "10:00"),
		);
	});

	it("puts the day-before reminder at ten the day before", () => {
		expect(dayBeforeAt(base)).toEqual(at("2026-10-23", "10:00"));
	});

	it("keeps ten in the morning across the fall-back weekend", () => {
		// Clocks go back Sunday 2026-11-01: EDT before, EST after.
		const e = { ...base, date: "2026-11-02" };
		expect(dayBeforeAt(e)?.toISOString()).toBe("2026-11-01T15:00:00.000Z");
	});
});

describe("dueEmails", () => {
	it("says nothing before anything is due", () => {
		expect(kinds(base, at("2026-10-14", "09:59"))).toEqual([]);
	});

	it("sends the deadline reminder once its moment comes", () => {
		expect(kinds(base, at("2026-10-14", "10:00"))).toEqual([
			"deadline_reminder:send",
		]);
	});

	it("does not send what is already stamped", () => {
		const e = { ...base, deadlineReminderAt: at("2026-10-14", "10:00") };
		expect(kinds(e, at("2026-10-15", "10:00"))).toEqual([]);
	});

	it("skips a deadline reminder whose deadline has passed", () => {
		expect(kinds(base, at("2026-10-18", "00:30"))).toEqual([
			"deadline_reminder:skip",
		]);
	});

	it("skips a reminder when the invitation only just went out", () => {
		const e = { ...base, publishedAt: at("2026-10-16", "09:00") };
		expect(kinds(e, at("2026-10-16", "09:30"))).toEqual([
			"deadline_reminder:skip",
		]);
	});

	it("sends the day-before reminder, and skips it once the party started", () => {
		const e = { ...base, deadlineReminderAt: at("2026-10-14", "10:00") };
		expect(kinds(e, at("2026-10-23", "10:00"))).toEqual(["day_before:send"]);
		expect(kinds(e, at("2026-10-24", "17:00"))).toEqual(["day_before:skip"]);
	});

	it("sends nothing at all for drafts and cancellations", () => {
		const now = at("2026-10-23", "10:00");
		expect(kinds({ ...base, status: "draft" }, now)).toEqual([]);
		expect(kinds({ ...base, status: "canceled" }, now)).toEqual([]);
	});

	it("respects the switches", () => {
		const e = { ...base, remindDeadline: false, remindDayBefore: false };
		expect(kinds(e, at("2026-10-23", "10:00"))).toEqual([]);
	});
});

describe("the host digest", () => {
	const daily = {
		...base,
		hostAlerts: "daily" as const,
		remindDeadline: false,
		remindDayBefore: false,
	};

	it("goes once a day at eight, claiming that morning's slot", () => {
		const due = dueEmails(daily, at("2026-10-05", "08:00"));
		expect(due).toEqual([
			{
				kind: "host_digest",
				action: "send",
				slot: at("2026-10-05", "08:00"),
			},
		]);
		expect(kinds(daily, at("2026-10-05", "07:59"))).toEqual([]);
	});

	it("waits for the next morning once today's slot is claimed", () => {
		const e = { ...daily, digestAt: at("2026-10-05", "08:00") };
		expect(kinds(e, at("2026-10-05", "20:00"))).toEqual([]);
		expect(kinds(e, at("2026-10-06", "08:00"))).toEqual(["host_digest:send"]);
	});

	it("does not fire the morning of publishing for a slot before it", () => {
		const e = { ...daily, publishedAt: at("2026-10-05", "09:00") };
		expect(kinds(e, at("2026-10-05", "12:00"))).toEqual([]);
	});

	it("stops the morning after the party", () => {
		expect(kinds(daily, at("2026-10-25", "08:00"))).toEqual([
			"host_digest:send",
		]);
		expect(kinds(daily, at("2026-10-26", "08:00"))).toEqual([]);
	});
});
