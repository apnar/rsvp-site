import { describe, expect, it } from "vitest";

import {
	ago,
	capitalize,
	coverSrc,
	crowdLine,
	firstName,
	inDays,
	initials,
	matchesPerson,
	plural,
	sentence,
	shortDate,
	since,
} from "./format";

describe("initials", () => {
	it("takes the first and last name", () => {
		expect(initials("Josh Lukens")).toBe("JL");
		expect(initials("Mary Jane Watson")).toBe("MW");
	});
	it("copes with one name, stray spaces and nothing", () => {
		expect(initials("josh")).toBe("J");
		expect(initials("  ava   ")).toBe("A");
		expect(initials("")).toBe("?");
	});
});

describe("since and ago", () => {
	const now = Date.parse("2026-10-03T12:00:00Z");
	const back = (ms: number) => new Date(now - ms);
	it("steps from minutes to days", () => {
		expect(since(back(10_000), now)).toBe("now");
		expect(since(back(12 * 60_000), now)).toBe("12m");
		expect(since(back(3 * 3_600_000), now)).toBe("3h");
		expect(since(back(2 * 86_400_000), now)).toBe("2d");
	});
	it("says it in words", () => {
		expect(ago(back(0), now)).toBe("just now");
		expect(ago(back(12 * 60_000), now)).toBe("12 min ago");
		expect(ago(back(3_600_000), now)).toBe("1 hour ago");
		expect(ago(back(5 * 3_600_000), now)).toBe("5 hours ago");
		expect(ago(back(30 * 3_600_000), now)).toBe("yesterday");
		expect(ago(back(4 * 86_400_000), now)).toBe("4 days ago");
	});
	it("never reads a future stamp as negative", () => {
		expect(since(new Date(now + 60_000), now)).toBe("now");
		expect(ago(new Date(now + 60_000), now)).toBe("just now");
	});
});

describe("dates on the site's clock", () => {
	it("formats in New York, not UTC", () => {
		// 03:00 UTC on the 3rd is still the evening of the 2nd in New York.
		expect(shortDate("2026-10-03T03:00:00Z")).toBe("Oct 2");
	});
	it("labels day offsets", () => {
		expect(inDays(0)).toBe("Today");
		expect(inDays(1)).toBe("Tomorrow");
		expect(inDays(-1)).toBe("Yesterday");
		expect(inDays(22)).toBe("In 22 days");
		expect(inDays(-3)).toBe("3 days ago");
	});
});

describe("small helpers", () => {
	it("pluralises", () => {
		expect(plural(1, "guest")).toBe("1 guest");
		expect(plural(2, "guest")).toBe("2 guests");
		expect(plural(0, "person", "people")).toBe("0 people");
		expect(plural(1, "more person", "more people")).toBe("1 more person");
	});
	it("builds the token-free cover address", () => {
		expect(coverSrc("covers/abc.jpg")).toBe("/api/covers/abc.jpg");
	});
	it("takes a first name", () => {
		expect(firstName("Josh Lukens")).toBe("Josh");
		expect(firstName("  Ava ")).toBe("Ava");
	});
	it("capitalises", () => {
		expect(capitalize("in")).toBe("In");
		expect(capitalize("")).toBe("");
	});
});

describe("matchesPerson", () => {
	const p = { name: "Linh Nguyen", email: "linh@example.com" };
	it("matches a name or an address, whatever the case of the query", () => {
		expect(matchesPerson(p, "NGUY")).toBe(true);
		expect(matchesPerson(p, "  example.com ")).toBe(true);
		expect(matchesPerson(p, "priya")).toBe(false);
	});
	it("matches everybody when nothing is typed", () => {
		expect(matchesPerson(p, "")).toBe(true);
		expect(matchesPerson(p, "   ")).toBe(true);
	});
});

describe("crowdLine and sentence", () => {
	it("is empty for nobody and bare for one", () => {
		expect(crowdLine([])).toBe("");
		expect(crowdLine(["The Nguyens"])).toBe("The Nguyens");
	});
	it("joins a few with 'and'", () => {
		expect(crowdLine(["A", "B"])).toBe("A and B");
		expect(crowdLine(["A", "B", "C", "D"])).toBe("A, B, C and D");
	});
	it("counts the rest once there are more than shown", () => {
		expect(crowdLine(["A", "B", "C", "D", "E", "F"])).toBe(
			"A, B, C, D and 2 more",
		);
		expect(crowdLine(["A", "B", "C", "D"], 3)).toBe("A, B, C and 1 more");
	});
	it("ends a sentence once", () => {
		expect(sentence("A and B")).toBe("A and B.");
		expect(sentence("Marcus T.")).toBe("Marcus T.");
		expect(sentence("Wow!")).toBe("Wow!");
	});
});
