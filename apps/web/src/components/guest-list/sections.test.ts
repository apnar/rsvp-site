import { type AnswerWords, DEFAULT_WORDS } from "@rsvp-site/api/answer-words";
import { describe, expect, it } from "vitest";
import { midSentence, guestSections as sectionsIn } from "./sections";

const guestSections = (list: Parameters<typeof sectionsIn>[0]) =>
	sectionsIn(list, DEFAULT_WORDS);

const at = new Date("2026-10-03T12:00:00Z");
let ids = 0;
const g = (
	name: string,
	response: "yes" | "maybe" | "no" | null,
	viewedAt: Date | null = null,
	family: { familyId: string; child?: boolean } | null = null,
) => {
	const cut = name.lastIndexOf(" ");
	return {
		id: `g${++ids}`,
		name,
		firstName: cut < 0 ? name : name.slice(0, cut),
		lastName: cut < 0 ? "" : name.slice(cut + 1),
		response,
		viewedAt,
		familyId: family?.familyId ?? null,
		child: family ? (family.child ?? false) : null,
	};
};

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

	it("sorts by last name, then first, ignoring case and accents", () => {
		const [yes] = guestSections([
			g("zoe Park", "yes"),
			g("Ava Roux", "yes"),
			g("Émile Chen", "yes"),
			g("bo Diaz", "yes"),
			g("Ann Park", "yes"),
		]);
		expect(yes?.guests.map((x) => x.name)).toEqual([
			"Émile Chen",
			"bo Diaz",
			"Ann Park",
			"zoe Park",
			"Ava Roux",
		]);
	});

	it("files somebody with no last name under the name they go by", () => {
		const [yes] = guestSections([
			g("Dana Smith", "yes"),
			g("Cher", "yes"),
			g("Abe Zed", "yes"),
		]);
		expect(yes?.guests.map((x) => x.name)).toEqual([
			"Cher",
			"Dana Smith",
			"Abe Zed",
		]);
	});

	it("leaves the input alone", () => {
		const list = [g("B", "yes"), g("A", "yes")];
		guestSections(list);
		expect(list.map((x) => x.name)).toEqual(["B", "A"]);
	});
});

describe("households", () => {
	const lee = { familyId: "lee" };
	const leeKid = { familyId: "lee", child: true };

	it("keep relatives with the same answer together, adults first", () => {
		const [yes] = guestSections([
			g("Ava Lee", "yes", null, leeKid),
			g("Mia Moss", "yes"),
			g("Zed Lee", "yes", null, lee),
			g("Bo Adams", "yes"),
			g("Al Lee", "yes", null, lee),
		]);
		expect(
			yes?.groups.map((grp) =>
				grp.rows.map((r) => `${r.indent ? "  " : ""}${r.guest.name}`),
			),
		).toEqual([["Bo Adams"], ["Al Lee", "Zed Lee", "  Ava Lee"], ["Mia Moss"]]);
	});

	it("file under their first adult, whatever the children are called", () => {
		const [yes] = guestSections([
			g("Ava Lee", "yes", null, leeKid),
			g("Rae Zimmer", "yes", null, lee),
			g("Mia Moss", "yes"),
		]);
		expect(yes?.guests.map((x) => x.name)).toEqual([
			"Mia Moss",
			"Rae Zimmer",
			"Ava Lee",
		]);
	});

	it("split when relatives answered differently", () => {
		const sections = guestSections([
			g("Al Lee", "yes", null, lee),
			g("Ava Lee", "no", null, leeKid),
		]);
		expect(sections.map((s) => s.groups.length)).toEqual([1, 1]);
		expect(sections[1]?.groups[0]?.rows[0]?.indent).toBe(false);
	});

	it("indent no child who has no grown-up beside them", () => {
		const [no] = guestSections([
			g("Ava Lee", "no", null, leeKid),
			g("Bo Lee", "no", null, leeKid),
		]);
		expect(no?.groups).toHaveLength(1);
		expect(no?.groups[0]?.rows.map((r) => r.indent)).toEqual([false, false]);
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
