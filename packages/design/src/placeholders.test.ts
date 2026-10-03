import { describe, expect, it } from "vitest";
import { fill, SAMPLE_VALUES, usesPlaceholder } from "./placeholders";

describe("fill", () => {
	it("fills all seven", () => {
		expect(
			fill(
				"{title}|{date}|{time}|{location}|{host}|{rsvp by}|{guest}",
				SAMPLE_VALUES,
			),
		).toBe(
			"Ava turns nine|Saturday, October 24|5:00 – 8:00 PM|12 Linden Street|The Parkers|Oct 17|The Nguyens",
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
