import { type AnswerWords, DEFAULT_WORDS } from "@rsvp-site/api/answer-words";
import { describe, expect, it } from "vitest";
import { midSentence, guestSections as sectionsIn } from "./sections";

const guestSections = (list: Parameters<typeof sectionsIn>[0]) =>
	sectionsIn(list, DEFAULT_WORDS);

const at = new Date("2026-10-03T12:00:00Z");
const g = (
	name: string,
	response: "yes" | "maybe" | "no" | null,
	viewedAt: Date | null = null,
) => ({ name, response, viewedAt });

describe("guestSections", () => {
	it("orders yes, maybe, no, viewed, not viewed, and drops empty ones", () => {
		const sections = guestSections([
			g("Uma", null),
			g("Theo", "no"),
			g("Sam", null, at),
			g("Rae", "yes"),
		]);
		expect(sections.map((s) => s.key)).toEqual([
			"yes",
			"no",
			"viewed",
			"unseen",
		]);
		expect(sections.map((s) => s.label)).toEqual([
			"Yes",
			"Can't",
			"Viewed, no reply",
			"Not viewed",
		]);
	});

	it("puts an answered guest under their answer, viewed or not", () => {
		const [maybe] = guestSections([g("Ann", "maybe", at)]);
		expect(maybe?.key).toBe("maybe");
	});

	it("sorts by name inside a section, ignoring case and accents", () => {
		const [yes] = guestSections([
			g("zoe Park", "yes"),
			g("Émile Roux", "yes"),
			g("Ava Chen", "yes"),
			g("bo Diaz", "yes"),
		]);
		expect(yes?.guests.map((x) => x.name)).toEqual([
			"Ava Chen",
			"bo Diaz",
			"Émile Roux",
			"zoe Park",
		]);
	});

	it("leaves the input alone", () => {
		const list = [g("B", "yes"), g("A", "yes")];
		guestSections(list);
		expect(list.map((x) => x.name)).toEqual(["B", "A"]);
	});
});

describe("an event's own words", () => {
	const own: AnswerWords = {
		...DEFAULT_WORDS,
		yes: { pick: "Going", count: "going" },
		none: { pick: "RSVP pending", count: "pending" },
	};

	it("head the sections", () => {
		const sections = sectionsIn([g("Rae", "yes"), g("Sam", null, at)], own);
		expect(sections.map((s) => s.label)).toEqual([
			"Going",
			"Viewed, RSVP pending",
		]);
	});

	it("lower only a word in sentence case", () => {
		expect(midSentence("No reply")).toBe("no reply");
		expect(midSentence("RSVP pending")).toBe("RSVP pending");
		expect(midSentence("silent")).toBe("silent");
	});
});
