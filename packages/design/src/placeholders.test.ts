import { describe, expect, it } from "vitest";
import {
	fill,
	SAMPLE_VALUES,
	usesGuest,
	usesPlaceholder,
} from "./placeholders";

describe("fill", () => {
	it("fills all eight", () => {
		expect(
			fill(
				"{title}|{date}|{time}|{location}|{host}|{rsvp by}|{details}|{guest}",
				SAMPLE_VALUES,
			),
		).toBe(
			`Ava turns nine|Saturday, October 24|5:00 – 8:00 PM|12 Linden Street|The Parkers|Oct 17|${SAMPLE_VALUES.details}|The Nguyens`,
		);
	});

	it("ignores case and stray spaces", () => {
		expect(fill("{ Title } {RSVP  BY}", SAMPLE_VALUES)).toBe(
			"Ava turns nine Oct 17",
		);
	});

	it("leaves other braces as typed", () => {
		expect(fill("{dress code} {}", SAMPLE_VALUES)).toBe("{dress code} {}");
	});

	it("fills empty values with nothing", () => {
		expect(fill("At {location}", { ...SAMPLE_VALUES, location: "" })).toBe(
			"At ",
		);
	});

	it("does not re-read a value as a placeholder", () => {
		expect(fill("{guest}", { ...SAMPLE_VALUES, guest: "{title}" })).toBe(
			"{title}",
		);
	});
});

describe("usesPlaceholder", () => {
	it("finds a placeholder in any spelling", () => {
		expect(usesPlaceholder("For { GUEST }", "guest")).toBe(true);
		expect(usesPlaceholder("For {guests}", "guest")).toBe(false);
		expect(usesPlaceholder("By {rsvp by}", "rsvp by")).toBe(true);
	});
});

describe("basisOf", () => {
	it("changes with the facts and the version, not the guest", async () => {
		const { basisOf } = await import("./basis");
		const a = basisOf(3, SAMPLE_VALUES);
		expect(basisOf(3, { ...SAMPLE_VALUES, guest: "Someone else" })).toBe(a);
		expect(basisOf(3, { ...SAMPLE_VALUES, guestFirst: "Bo" })).toBe(a);
		expect(basisOf(3, { ...SAMPLE_VALUES, guestLast: "Li" })).toBe(a);
		expect(basisOf(4, SAMPLE_VALUES)).not.toBe(a);
		expect(basisOf(3, { ...SAMPLE_VALUES, date: "Sunday" })).not.toBe(a);
	});
});

describe("{details}", () => {
	it("is a placeholder like the rest, and counts toward the card's basis", async () => {
		const { basisOf } = await import("./basis");
		expect(usesPlaceholder("{ Details }", "details")).toBe(true);
		expect(basisOf(1, { ...SAMPLE_VALUES, details: "Other" })).not.toBe(
			basisOf(1, SAMPLE_VALUES),
		);
	});
});

describe("{guest's}", () => {
	const with_ = (guest: string) =>
		fill("{guest's}", { ...SAMPLE_VALUES, guest });

	it.each([
		["Josh", "Josh’s"],
		["James", "James’s"],
		["Max", "Max’s"],
		["The Nguyens", "The Nguyens’"],
		["the Parkers", "the Parkers’"],
		["Aly & Josh", "Aly & Josh’s"],
		["Marcus T.", "Marcus T.’s"],
		["JOSH", "JOSH’S"],
		["Josh's", "Josh's"],
		["The Joneses’", "The Joneses’"],
		["your guest", "your guest’s"],
		["", ""],
	])("%s becomes %s", (name, want) => {
		expect(with_(name)).toBe(want);
	});

	it("takes a curly apostrophe and stray spaces too", () => {
		expect(fill("{ Guest’s }", { ...SAMPLE_VALUES, guest: "Josh" })).toBe(
			"Josh’s",
		);
	});

	it("counts as {guest}, so it is per card on paper and off the shared picture", () => {
		expect(usesPlaceholder("At {guest's} place", "guest")).toBe(true);
		expect(usesPlaceholder("At {guest} place", "guest's")).toBe(true);
	});
});

describe("{first name} and {last name}", () => {
	it("fill from the split name, in any spelling", () => {
		expect(fill("{first name} {last name}", SAMPLE_VALUES)).toBe("Linh Nguyen");
		expect(fill("{ First  Name }/{LAST NAME}", SAMPLE_VALUES)).toBe(
			"Linh/Nguyen",
		);
	});

	it("make the first name possessive, with either apostrophe", () => {
		expect(fill("{first name's}", SAMPLE_VALUES)).toBe("Linh’s");
		expect(fill("{ First  Name’s }", SAMPLE_VALUES)).toBe("Linh’s");
		expect(fill("{first name}", SAMPLE_VALUES)).toBe("Linh");
	});

	it("leave {guest} alone", () => {
		expect(fill("{guest} {guest's}", SAMPLE_VALUES)).toBe(
			"The Nguyens The Nguyens’",
		);
	});
});

describe("usesGuest", () => {
	it.each([
		"{guest}",
		"{ Guest’s }",
		"Hi {first name}",
		"{first name's} place",
		"Mr. {last name}",
	])("is true for %s", (text) => {
		expect(usesGuest(text)).toBe(true);
	});

	it.each(["{title}", "{guests}", "{first names}", "plain"])(
		"is false for %s",
		(text) => {
			expect(usesGuest(text)).toBe(false);
		},
	);
});
