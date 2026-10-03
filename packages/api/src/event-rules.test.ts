import { describe, expect, it } from "vitest";

import {
	csvCell,
	describeChanges,
	movesGuestFacts,
	rearmFor,
} from "./event-rules";

const base = {
	date: "2026-10-24" as string | null,
	startTime: "18:00" as string | null,
	endTime: "21:00" as string | null,
	location: "The barn",
	rsvpDeadline: "2026-10-20" as string | null,
};

describe("csvCell", () => {
	it("leaves plain text alone", () => {
		expect(csvCell("Dana")).toBe("Dana");
	});

	it("quotes commas, quotes and line breaks", () => {
		expect(csvCell("a,b")).toBe('"a,b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
	});

	it("defuses anything a spreadsheet would run as a formula", () => {
		for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
			expect(csvCell(`${lead}SUM(A1)`).replace(/^"/, "")).toMatch(/^'/);
		}
		expect(csvCell("=HYPERLINK(1,2)")).toBe(`"'=HYPERLINK(1,2)"`);
	});

	it("does not touch a dash in the middle", () => {
		expect(csvCell("a-b")).toBe("a-b");
	});
});

describe("describeChanges", () => {
	it("says nothing when nothing guests care about moved", () => {
		expect(describeChanges(base, { ...base })).toEqual([]);
	});

	it("reports a new date, with the old one", () => {
		const [change] = describeChanges(base, { ...base, date: "2026-10-31" });
		expect(change?.label).toBe("Date");
		expect(change?.was).not.toBe(change?.now);
	});

	it("names a missing date and a missing time", () => {
		const changes = describeChanges(base, {
			...base,
			date: null,
			startTime: null,
			endTime: null,
		});
		expect(changes.map((c) => [c.label, c.now])).toEqual([
			["Date", "No date"],
			["Time", "No time"],
		]);
	});

	it("falls back to a phrase for an empty place", () => {
		expect(describeChanges(base, { ...base, location: "" })).toEqual([
			{ label: "Where", was: "The barn", now: "To be announced" },
		]);
		expect(describeChanges({ ...base, location: "" }, base)).toEqual([
			{ label: "Where", was: "Nowhere yet", now: "The barn" },
		]);
	});
});

describe("movesGuestFacts", () => {
	it("counts only the fields in the edit that differ", () => {
		expect(movesGuestFacts(base, {})).toBe(false);
		expect(movesGuestFacts(base, { location: "The barn" })).toBe(false);
		expect(movesGuestFacts(base, { location: "The loft" })).toBe(true);
	});
});

describe("rearmFor", () => {
	it("re-arms nothing for an edit that moves nothing", () => {
		expect(rearmFor(base, {})).toEqual({});
		expect(
			rearmFor(base, { date: base.date, rsvpDeadline: base.rsvpDeadline }),
		).toEqual({});
	});

	it("clears the day-before stamp when the date or the start moves", () => {
		expect(rearmFor(base, { date: "2026-10-31" })).toEqual({
			dayBeforeAt: null,
		});
		expect(rearmFor(base, { startTime: "19:00" })).toEqual({
			dayBeforeAt: null,
		});
		expect(rearmFor(base, { date: null })).toEqual({ dayBeforeAt: null });
	});

	it("clears the deadline stamp when the deadline moves, and only then", () => {
		expect(rearmFor(base, { rsvpDeadline: "2026-10-22" })).toEqual({
			deadlineReminderAt: null,
		});
	});

	it("clears both when both moved", () => {
		expect(rearmFor(base, { date: "2026-11-07", rsvpDeadline: null })).toEqual({
			dayBeforeAt: null,
			deadlineReminderAt: null,
		});
	});
});
