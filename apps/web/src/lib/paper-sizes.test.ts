import { FORMATS } from "@rsvp-site/design/schema";
import { describe, expect, it } from "vitest";

import { layoutsFor, PAPER_SIZES } from "./paper-sizes";

describe("layoutsFor", () => {
	it("offers every card format at least one layout", () => {
		for (const format of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) {
			expect(layoutsFor(format).length).toBeGreaterThan(0);
		}
	});
	it("always includes the card's own size, last or alone", () => {
		for (const format of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) {
			expect(layoutsFor(format).some((l) => l.value === "exact")).toBe(true);
		}
	});
	it("puts two to a sheet first for the small cards", () => {
		expect(layoutsFor("5x7")[0]?.value).toBe("two-up");
		expect(layoutsFor("5x7l")[0]?.value).toBe("two-up");
		expect(layoutsFor("half")[0]?.value).toBe("two-up");
	});
	it("puts the card on letter with cut marks first for the big ones", () => {
		expect(layoutsFor("8x10")[0]?.value).toBe("on-letter");
		expect(layoutsFor("square")[0]?.value).toBe("on-letter");
	});
	it("has nothing to choose for a letter-sized card", () => {
		expect(layoutsFor("letter").map((l) => l.value)).toEqual(["exact"]);
	});
	it("gives each layout a distinct value", () => {
		for (const format of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) {
			const values = layoutsFor(format).map((l) => l.value);
			expect(new Set(values).size).toBe(values.length);
		}
	});
});

describe("PAPER_SIZES", () => {
	it("starts with the 5x7 card, the classic default", () => {
		expect(PAPER_SIZES[0]?.value).toBe("card");
	});
});
