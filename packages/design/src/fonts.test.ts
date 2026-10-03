import { describe, expect, it } from "vitest";
import {
	FACES,
	FONT_IDS,
	FONTS,
	type FontInfo,
	faceFor,
	faceKey,
	hasItalic,
	nearestWeight,
	parseFace,
} from "./fonts";

describe("parseFace", () => {
	it("undoes faceKey for every face, hyphenated ids (baloo-2) included", () => {
		for (const key of FACES) {
			const { font, weight, italic } = parseFace(key);
			expect(FONT_IDS).toContain(font);
			expect(faceKey(font, weight, italic)).toBe(key);
		}
		expect(parseFace("baloo-2-800")).toEqual({
			font: "baloo-2",
			weight: 800,
			italic: false,
		});
	});

	it("lists a face for every weight and italic the registry names", () => {
		let count = 0;
		for (const id of FONT_IDS) {
			const info: FontInfo = FONTS[id];
			count += info.weights.length + (info.italics?.length ?? 0);
		}
		expect(FACES).toHaveLength(count);
	});
});

describe("faceFor", () => {
	it("snaps to the nearest weight the font has", () => {
		expect(faceFor("manrope", 700)).toEqual({
			key: "manrope-600",
			weight: 600,
			italic: false,
		});
		expect(nearestWeight("unbounded", 100)).toBe(400);
	});

	it("is italic only where the font has an italic", () => {
		expect(hasItalic("merriweather")).toBe(true);
		expect(faceFor("merriweather", 700, true).key).toBe("merriweather-700i");
		expect(faceFor("manrope", 400, true)).toEqual({
			key: "manrope-400",
			weight: 400,
			italic: false,
		});
	});
});
