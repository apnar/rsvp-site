import { describe, expect, it } from "vitest";

import {
	clampParty,
	headcount,
	openSlots,
	potluckLines,
	tally,
} from "./headcount";

describe("tally", () => {
	const t = tally([
		{ response: "yes", adults: 2, kids: 2 },
		{ response: "yes", adults: 1, kids: 0 },
		{ response: "maybe", adults: 2, kids: 3 },
		{ response: "no", adults: 1, kids: 0 },
		{ response: null, adults: 1, kids: 0 },
		{ response: null, adults: 1, kids: 0 },
	]);

	it("counts households by answer, silence included", () => {
		expect(t).toMatchObject({
			invited: 6,
			yes: 2,
			maybe: 1,
			no: 1,
			waiting: 2,
		});
	});

	it("counts people only on a yes", () => {
		expect(t.adults).toBe(3);
		expect(t.kids).toBe(2);
		expect(headcount(t)).toBe(5);
	});

	it("never counts a yes as fewer than one adult", () => {
		expect(tally([{ response: "yes", adults: 0, kids: -1 }])).toMatchObject({
			adults: 1,
			kids: 0,
		});
	});
});

describe("potluck", () => {
	const lines = potluckLines(
		[
			{ id: "a", label: "Drinks", quantity: 4 },
			{ id: "b", label: "Dessert", quantity: 1 },
			{ id: "c", label: "Ice", quantity: 2 },
		],
		[{ itemId: "a" }, { itemId: "b" }, { itemId: "b" }],
	);

	it("says how many of each are left, never below zero", () => {
		expect(lines.map((l) => [l.claimed, l.left])).toEqual([
			[1, 3],
			[2, 0],
			[0, 2],
		]);
		expect(openSlots(lines)).toBe(5);
	});
});

describe("clampParty", () => {
	it("holds adults to the guest plus the plus-ones allowed", () => {
		expect(
			clampParty({ adults: 9, kids: 0 }, { maxPlusOnes: 2, askKids: true }),
		).toEqual({ adults: 3, kids: 0 });
		expect(
			clampParty({ adults: 0, kids: 0 }, { maxPlusOnes: 2, askKids: true }),
		).toEqual({ adults: 1, kids: 0 });
	});

	it("drops kids when the event does not ask, and plus-ones when it allows none", () => {
		expect(
			clampParty({ adults: 3, kids: 4 }, { maxPlusOnes: 0, askKids: false }),
		).toEqual({ adults: 1, kids: 0 });
	});
});
