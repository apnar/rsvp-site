import { describe, expect, it } from "vitest";

import {
	addDays,
	daysBetween,
	formatDate,
	formatTime,
	formatTimeRange,
	siteInstant,
	todayOnSite,
} from "./time";

const iso = (date: string, time: string) =>
	siteInstant(date, time).toISOString();

describe("siteInstant", () => {
	it("reads the venue's clock in winter and summer", () => {
		// EST is UTC-5, EDT is UTC-4. Same wall clock, different instants.
		expect(iso("2026-01-05", "17:00")).toBe("2026-01-05T22:00:00.000Z");
		expect(iso("2026-07-06", "17:00")).toBe("2026-07-06T21:00:00.000Z");
	});

	it("survives the spring-forward weekend", () => {
		// Clocks go forward Sunday 2026-03-08. A next-day event's call goes out
		// Sunday evening at UTC-5... and the event itself is at UTC-4. One
		// cycle, two offsets, which is the whole reason for the second pass.
		expect(iso("2026-03-08", "17:00")).toBe("2026-03-08T21:00:00.000Z");
		expect(iso("2026-03-09", "19:30")).toBe("2026-03-09T23:30:00.000Z");
	});

	it("survives the fall-back weekend", () => {
		// Clocks go back Sunday 2026-11-01, the other way round.
		expect(iso("2026-11-01", "17:00")).toBe("2026-11-01T22:00:00.000Z");
		expect(iso("2026-11-02", "19:30")).toBe("2026-11-03T00:30:00.000Z");
	});

	it("agrees with the day and time the rest of the app reads", () => {
		const at = siteInstant("2026-09-14", "21:00");
		expect(todayOnSite(at)).toBe("2026-09-14");
		expect(formatTime("21:00")).toBe("9:00 PM");
	});
});

describe("addDays", () => {
	it("walks the calendar, not the clock", () => {
		expect(addDays("2026-09-14", -1)).toBe("2026-09-13");
		expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
		expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
		expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
		expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
	});

	it("is unmoved by a daylight-saving Sunday", () => {
		// 2026-03-08 is 23 hours long in the venue's timezone. Still one day.
		expect(addDays("2026-03-09", -1)).toBe("2026-03-08");
		expect(addDays("2026-11-02", -1)).toBe("2026-11-01");
	});
});

describe("daysBetween", () => {
	it("counts calendar days, whatever the clocks did", () => {
		expect(daysBetween("2026-10-17", "2026-10-24")).toBe(7);
		expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
		expect(daysBetween("2026-10-24", "2026-10-17")).toBe(-7);
	});
});

describe("formatTimeRange", () => {
	it("says both ends, one, or nothing", () => {
		expect(formatTimeRange("17:00", "22:00")).toBe("5:00 PM - 10:00 PM");
		expect(formatTimeRange("17:00", null)).toBe("5:00 PM");
		expect(formatTimeRange(null, "22:00")).toBeNull();
	});
});

describe("formatDate and formatTime", () => {
	it("format real values", () => {
		expect(formatDate("2026-10-24")).toBe("Sat, Oct 24");
		expect(formatTime("17:05")).toBe("5:05 PM");
	});
	it("hand back an invalid stored value rather than throwing", () => {
		expect(formatDate("2026-13-01")).toBe("2026-13-01");
		expect(formatDate("")).toBe("");
		expect(formatTime("soon")).toBe("soon");
	});
});
