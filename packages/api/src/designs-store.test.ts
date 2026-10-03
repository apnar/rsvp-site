import { fromTemplate, TEMPLATES } from "@rsvp-site/design/templates/index";
import { describe, expect, it } from "vitest";

import { readDesign, readTheme } from "./designs-store";

const first = TEMPLATES[0];
if (!first) throw new Error("no templates");
const design = fromTemplate(first, { cover: null, paper: false });

describe("readTheme", () => {
	it("hands back a theme that parses", () => {
		expect(readTheme(design.theme)).toEqual(design.theme);
	});

	it("treats null, and anything that is not exactly a theme, as none", () => {
		expect(readTheme(null)).toBeNull();
		expect(readTheme(undefined)).toBeNull();
		expect(readTheme("{}")).toBeNull();
		expect(readTheme({ ...design.theme, bg: "red" })).toBeNull();
		// A colour that would break out of a <style> never gets through.
		expect(readTheme({ ...design.theme, bg: "#fff;}</style>" })).toBeNull();
		expect(readTheme({ bg: design.theme.bg })).toBeNull();
	});
});

describe("readDesign", () => {
	it("hands back a stored document that still parses", () => {
		expect(readDesign(design)?.format).toBe(design.format);
	});

	it("reads an old shape or a hand edit as no design", () => {
		expect(readDesign(null)).toBeNull();
		expect(readDesign({ v: 0 })).toBeNull();
		expect(readDesign({ ...design, format: "poster" })).toBeNull();
		expect(readDesign("not json")).toBeNull();
	});
});
