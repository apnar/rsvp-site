import { describe, expect, it } from "vitest";

import type { StageKey } from "../cycle";
import { runInstant } from "../run";
import { planStage, type Stamps } from "./plan";

/** An evening event that starts at nine. */
const DATE = "2026-09-14";
const START = "21:00";

const at = (date: string, time: string) => runInstant(date, time);

const stamps = (done: Partial<Stamps> = {}): Stamps => ({
	call: null,
	nudge: null,
	confirmed: null,
	lastCall: null,
	final: null,
	...done,
});

const plan = (now: Date, over: Partial<Parameters<typeof planStage>[0]> = {}) =>
	planStage({
		date: DATE,
		startTime: START,
		stamps: stamps(),
		lastEmailAt: null,
		now,
		...over,
	});

describe("the ordinary week", () => {
	it("does nothing before five the evening before", () => {
		expect(plan(at("2026-09-13", "16:30")).run).toBeNull();
	});

	it("asks the list at five the evening before", () => {
		expect(plan(at("2026-09-13", "17:00")).run).toBe("call");
	});

	it("prods at two if the call went out yesterday", () => {
		const p = plan(at(DATE, "14:00"), {
			stamps: stamps({ call: at("2026-09-13", "17:00") }),
			lastEmailAt: at("2026-09-13", "17:00"),
		});
		expect(p.run).toBe("nudge");
		expect(p.skip).toEqual([]);
	});

	it("last-calls at six, then decides at half seven", () => {
		const done = {
			stamps: stamps({
				call: at("2026-09-13", "17:00"),
				nudge: at(DATE, "14:00"),
			}),
			lastEmailAt: at(DATE, "14:00"),
		};
		expect(plan(at(DATE, "18:00"), done).run).toBe("lastCall");
		expect(
			plan(at(DATE, "19:30"), {
				stamps: stamps({ ...done.stamps, lastCall: at(DATE, "18:00") }),
				lastEmailAt: at(DATE, "18:00"),
			}).run,
		).toBe("final");
	});
});

describe("a venue booked late", () => {
	// Booked at four on the day. The five-o'clock-yesterday call is overdue,
	// and so is the two o'clock prod.
	it("tells the list it exists before it nags them about it", () => {
		const p = plan(at(DATE, "16:30"));
		expect(p.run).toBe("call");
		expect(p.silent).toBe(false);
	});

	it("holds the next stage for ninety minutes", () => {
		const p = plan(at(DATE, "17:30"), {
			stamps: stamps({ call: at(DATE, "16:30") }),
			lastEmailAt: at(DATE, "16:30"),
		});
		expect(p.run).toBeNull();
		expect(p.reason).toMatch(/holding/);
	});

	it("abandons the stale prod rather than sending it late", () => {
		const p = plan(at(DATE, "18:00"), {
			stamps: stamps({ call: at(DATE, "16:30") }),
			lastEmailAt: at(DATE, "16:00"),
		});
		expect(p.run).toBe("lastCall");
		expect(p.skip).toEqual<StageKey[]>(["nudge"]);
	});
});

describe("the verdict is not optional", () => {
	it("ignores the cooldown -- exactly ninety minutes after the last call", () => {
		// 18:00 to 19:30 is the cooldown to the minute. The day somebody makes
		// `final` respect it, this test says whether anyone gets told.
		const p = plan(at(DATE, "19:30"), {
			stamps: stamps({
				call: at("2026-09-13", "17:00"),
				nudge: at(DATE, "14:00"),
				lastCall: at(DATE, "18:00"),
			}),
			lastEmailAt: at(DATE, "18:00"),
		});
		expect(p.run).toBe("final");
	});

	it("records a missed verdict after the start but emails nobody", () => {
		const p = plan(at(DATE, "21:30"), {
			stamps: stamps({ call: at("2026-09-13", "17:00") }),
		});
		expect(p.run).toBe("final");
		expect(p.silent).toBe(true);
		expect(p.skip).toEqual(expect.arrayContaining(["nudge", "lastCall"]));
	});

	it("goes quiet once the verdict is in", () => {
		const p = plan(at(DATE, "22:00"), {
			stamps: stamps({
				call: at("2026-09-13", "17:00"),
				nudge: at(DATE, "14:00"),
				lastCall: at(DATE, "18:00"),
				final: at(DATE, "19:30"),
			}),
		});
		expect(p.run).toBeNull();
	});
});

describe("the week the clocks change", () => {
	it("still calls the evening before, an hour of offset notwithstanding", () => {
		// 2026-03-09 is the day after spring-forward. The call is at
		// UTC-5, the event at UTC-4.
		const p = planStage({
			date: "2026-03-09",
			startTime: START,
			stamps: stamps(),
			lastEmailAt: null,
			now: at("2026-03-08", "17:00"),
		});
		expect(p.run).toBe("call");
	});
});
