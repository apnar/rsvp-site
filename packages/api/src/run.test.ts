import { describe, expect, it } from "vitest";

import { addDays, formatGameTime, runInstant, todayInRunTimezone } from "./run";

const iso = (date: string, time: string) =>
	runInstant(date, time).toISOString();

describe("runInstant", () => {
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
		const at = runInstant("2026-09-14", "21:00");
		expect(todayInRunTimezone(at)).toBe("2026-09-14");
		expect(formatGameTime("21:00")).toBe("9:00 PM");
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
