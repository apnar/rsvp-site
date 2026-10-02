import { describe, expect, it } from "vitest";
import type { Person, SheetRow } from "./audience";
import { guestSuggestions, splitAudience, union } from "./audience";

const row = (over: Partial<SheetRow> & { name: string }): SheetRow => ({
	nameKey: over.name.trim().toLowerCase(),
	userId: null,
	addedBy: null,
	response: "in",
	...over,
});

const active: Person[] = [
	{ id: "u-sam", name: "Sam" },
	{ id: "u-dana", name: "Dana" },
	{ id: "u-ray", name: "Ray" },
	{ id: "u-dev", name: "Dev" },
];

describe("splitAudience", () => {
	it("counts guests toward the totals but never mails them", () => {
		const split = splitAudience(
			[
				row({ name: "Sam", userId: "u-sam" }),
				row({ name: "Marcus", addedBy: "u-sam" }),
				row({ name: "Dana", userId: "u-dana", response: "maybe" }),
			],
			active,
		);
		expect(split.yes).toBe(2);
		expect(split.inNames).toEqual(["Sam", "Marcus"]);
		// Marcus has no inbox, so he is not in the id set the mailer filters on.
		expect(split.inIds).toEqual(["u-sam"]);
		expect(split.maybeIds).toEqual(["u-dana"]);
		// Whoever put Marcus down can pass word along if the event is called off.
		expect(split.sponsorIds).toEqual(["u-sam"]);
	});

	it("does not accuse somebody of silence when a guest row has their name", () => {
		const split = splitAudience(
			[row({ name: "Sam", userId: "u-sam" }), row({ name: "dana " })],
			active,
		);
		// Dana's row is a guest row -- no user_id -- but her name is on the
		// sheet, so the 2 PM prod leaves her alone.
		expect(split.silentNames).toEqual(["Ray", "Dev"]);
		expect(split.silentIds).toEqual(["u-ray", "u-dev"]);
	});

	it("counts an out as answered, not silent", () => {
		const split = splitAudience(
			[row({ name: "Ray", userId: "u-ray", response: "out" })],
			active,
		);
		expect(split.out).toBe(1);
		expect(split.yes).toBe(0);
		expect(split.silent).toBe(3);
		expect(split.silentIds).not.toContain("u-ray");
	});

	it("has nobody silent when the sheet is empty of nobody", () => {
		const split = splitAudience([], []);
		expect(split).toMatchObject({ yes: 0, maybe: 0, out: 0, silent: 0 });
	});
});

describe("union", () => {
	it("merges without repeating anyone", () => {
		expect(union(["a", "b"], ["b", "c"], [])).toEqual(["a", "b", "c"]);
	});
});

describe("guestSuggestions", () => {
	const past = (...names: string[]) =>
		names.map((name) => ({ name, nameKey: name.trim().toLowerCase() }));

	it("keeps the order they were last brought in", () => {
		expect(guestSuggestions(past("Marcus", "Tone", "Big Rob"), [], 6)).toEqual([
			"Marcus",
			"Tone",
			"Big Rob",
		]);
	});

	it("collapses the same guest typed three different ways", () => {
		// Whatever spelling was used most recently is the one offered back.
		expect(
			guestSuggestions(past("Marcus", "marcus", " MARCUS "), [], 6),
		).toEqual(["Marcus"]);
	});

	it("does not offer somebody already on tonight's sheet", () => {
		expect(guestSuggestions(past("Marcus", "Tone"), ["marcus"], 6)).toEqual([
			"Tone",
		]);
	});

	it("stops at the limit", () => {
		expect(guestSuggestions(past("A", "B", "C"), [], 2)).toEqual(["A", "B"]);
	});
});
