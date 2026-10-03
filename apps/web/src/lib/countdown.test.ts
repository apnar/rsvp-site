import { describe, expect, it } from "vitest";

import { countdownTile, nextTickDelay } from "./countdown";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("countdownTile", () => {
	it("counts days from a day out", () => {
		expect(countdownTile(DAY)).toEqual({ value: "1", label: "day" });
		expect(countdownTile(22 * DAY + 5 * HOUR)).toEqual({
			value: "22",
			label: "days",
		});
	});
	it("counts hours inside a day", () => {
		expect(countdownTile(DAY - 1)).toEqual({ value: "23", label: "hours" });
		expect(countdownTile(HOUR)).toEqual({ value: "1", label: "hour" });
	});
	it("counts minutes inside an hour, never showing zero", () => {
		expect(countdownTile(HOUR - 1)).toEqual({ value: "59", label: "minutes" });
		expect(countdownTile(30 * 1000)).toEqual({ value: "1", label: "minutes" });
	});
	it("says now once it has started", () => {
		expect(countdownTile(0)).toEqual({ value: "Now", label: "party on" });
		expect(countdownTile(-5 * MIN).value).toBe("Now");
	});
});

describe("nextTickDelay", () => {
	it("stops once the party has started", () => {
		expect(nextTickDelay(0)).toBeNull();
		expect(nextTickDelay(-1)).toBeNull();
	});
	it("waits for the next whole minute of the target, never a second", () => {
		// 2h 30m 20s out: the minutes digit changes in 20 seconds.
		const delay = nextTickDelay(2 * HOUR + 30 * MIN + 20_000);
		expect(delay).toBeGreaterThanOrEqual(20_000);
		expect(delay).toBeLessThan(21_000);
	});
	it("waits a full minute when it is already on the boundary", () => {
		const delay = nextTickDelay(3 * HOUR);
		expect(delay).toBeGreaterThanOrEqual(MIN);
		expect(delay).toBeLessThan(MIN + 1000);
	});
	it("never ticks faster than a minute", () => {
		for (const r of [1, 999, 59_999, 60_000, 61_000, 5 * DAY + 1]) {
			expect(nextTickDelay(r) ?? 0).toBeLessThanOrEqual(MIN + 25);
		}
	});
});
