import { describe, expect, it } from "vitest";

import {
	clampParty,
	deciding,
	extraPeople,
	headcount,
	notInvitedCount,
	openSlots,
	potluckLines,
	relativeParty,
	seenNoReply,
	seenNoReplyCount,
	slotsLeftFor,
	stillComingCount,
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

	it("never counts a yes as fewer than one person", () => {
		expect(tally([{ response: "yes", adults: 0, kids: -1 }])).toMatchObject({
			adults: 1,
			kids: 0,
		});
	});

	it("counts a child answered for as a kid, not an adult", () => {
		expect(
			tally([
				{ response: "yes", adults: 1, kids: 0 },
				{ response: "yes", adults: 0, kids: 1 },
				{ response: "maybe", adults: 0, kids: 1 },
			]),
		).toMatchObject({ adults: 1, kids: 1, yes: 2, maybe: 1 });
	});
});

describe("relativeParty", () => {
	it("is one person, a kid only when the event asks about kids", () => {
		expect(relativeParty(false, true)).toEqual({ adults: 1, kids: 0 });
		expect(relativeParty(true, true)).toEqual({ adults: 0, kids: 1 });
		expect(relativeParty(true, false)).toEqual({ adults: 1, kids: 0 });
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

describe("deciding", () => {
	it("is the households with no reply or a maybe", () => {
		const t = tally([
			{ response: "yes", adults: 1, kids: 0 },
			{ response: "maybe", adults: 1, kids: 0 },
			{ response: "no", adults: 1, kids: 0 },
			{ response: null, adults: 1, kids: 0 },
		]);
		expect(deciding(t)).toBe(2);
		expect(deciding(tally([]))).toBe(0);
	});
});

describe("who a change or a nudge reaches", () => {
	const at = new Date("2026-10-01T12:00:00Z");

	it("stillComingCount takes the invited who have not said no", () => {
		expect(
			stillComingCount([
				{ invitedAt: at, response: null },
				{ invitedAt: at, response: "yes" },
				{ invitedAt: at, response: "maybe" },
				{ invitedAt: at, response: "no" },
				{ invitedAt: null, response: null },
				{ invitedAt: null, response: "yes" },
			]),
		).toBe(3);
	});

	it("notInvitedCount takes the uninvited that mail can reach", () => {
		expect(
			notInvitedCount([
				{ invitedAt: null, unreachable: false },
				{ invitedAt: null, unreachable: true },
				{ invitedAt: at, unreachable: false },
			]),
		).toBe(1);
	});

	it("seenNoReply is opened and silent, and an answer alone is not a view", () => {
		expect(seenNoReply({ response: null, viewedAt: at })).toBe(true);
		expect(seenNoReply({ response: "yes", viewedAt: at })).toBe(false);
		expect(seenNoReply({ response: null, viewedAt: null })).toBe(false);
		expect(
			seenNoReplyCount([
				{ response: null, viewedAt: at },
				{ response: null, viewedAt: null },
				{ response: "maybe", viewedAt: at },
				{ response: null, viewedAt: at },
			]),
		).toBe(2);
	});
});

describe("a guest choosing a potluck item", () => {
	it("gives back their saved claim and charges a ticked box", () => {
		const line = { left: 2 };
		expect(slotsLeftFor(line, { saved: false, ticked: false })).toBe(2);
		expect(slotsLeftFor(line, { saved: false, ticked: true })).toBe(1);
		expect(slotsLeftFor(line, { saved: true, ticked: false })).toBe(3);
		// Saved and still ticked: the server's count already excluded them.
		expect(slotsLeftFor(line, { saved: true, ticked: true })).toBe(2);
	});
});

describe("extraPeople", () => {
	it("counts the party without the guest", () => {
		expect(extraPeople({ adults: 2, kids: 3 })).toBe(4);
		expect(extraPeople({ adults: 1, kids: 0 })).toBe(0);
	});

	it("is never negative", () => {
		expect(extraPeople({ adults: 0, kids: 0 })).toBe(0);
	});
});
