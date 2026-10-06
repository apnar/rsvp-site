import { describe, expect, it } from "vitest";

import type { RsvpValues } from "@/components/invite/rsvp-form";
import type { Invite } from "@/components/invite/types";
import { dietPeople } from "./diet-people";

const diet = { diets: [], note: "", confirmed: false };
const me = {
	userId: "u-me",
	diet,
	family: [
		{
			guestId: "g-kid",
			userId: "u-kid",
			name: "Kit",
			child: true,
			response: null,
			diet,
		},
		{
			guestId: "g-spouse",
			userId: "u-sp",
			name: "Sam",
			child: false,
			response: "yes",
			diet,
		},
	],
} as unknown as NonNullable<Invite["me"]>;

const sent = (
	response: RsvpValues["response"],
	family: RsvpValues["family"] = [],
) => ({ response, family }) as RsvpValues;

describe("dietPeople", () => {
	it("asks nobody when the event does not ask about diets", () => {
		expect(dietPeople(me, false, sent("yes"))).toEqual([]);
	});

	it("starts with the guest if they are coming, then relatives who are", () => {
		const people = dietPeople(me, true, sent("yes"));
		expect(people.map((p) => p.userId)).toEqual(["u-me", "u-sp"]);
		expect(people[0]).toMatchObject({ name: "You", you: true });
	});

	it("counts maybe as coming and no as not", () => {
		expect(dietPeople(me, true, sent("maybe"))[0]?.userId).toBe("u-me");
		expect(dietPeople(me, true, sent("no")).map((p) => p.userId)).toEqual([
			"u-sp",
		]);
	});

	it("takes a relative's answer from what was just sent, not the page copy", () => {
		const people = dietPeople(
			me,
			true,
			sent("no", [
				{ guestId: "g-kid", response: "yes" },
				{ guestId: "g-spouse", response: "no" },
			]),
		);
		expect(people.map((p) => p.userId)).toEqual(["u-kid"]);
		expect(people[0]?.child).toBe(true);
	});
});
