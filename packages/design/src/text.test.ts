import { describe, expect, it } from "vitest";
import { layoutText, prepareFace, run, unsupportedChars, wrap } from "./text";

// A monospace face: every character 500 wide, "AV" kerned in by 100.
const face = prepareFace({
	asc: 800,
	desc: -200,
	chars: " ABVabcdefghijklmnopqrstuvwxyzé",
	adv: Array.from({ length: 31 }, () => 500),
	kern: "AV-100 Va-50",
});

describe("run", () => {
	it("adds advances, kerning and tracking", () => {
		// size 100: each glyph 50 wide.
		expect(run(face, "ab", 100, 0).width).toBe(100);
		expect(run(face, "AV", 100, 0).xs).toEqual([0, 40]);
		expect(run(face, "ab", 100, 0.1).xs).toEqual([0, 60]);
	});

	it("kerns an accented letter as its base", () => {
		const f = prepareFace({
			asc: 800,
			desc: -200,
			chars: "VaÀ",
			adv: [500, 500, 500],
			kern: "AV-100",
		});
		expect(run(f, "ÀV", 100, 0).xs).toEqual([0, 40]);
	});
});

describe("wrap", () => {
	it("breaks greedily at spaces", () => {
		// 50 per glyph at size 100: "abc def" = 350.
		expect(wrap(face, "abc def ghi", 100, 0, 360).lines).toEqual([
			"abc def",
			"ghi",
		]);
	});

	it("keeps hard line breaks and empty lines", () => {
		expect(wrap(face, "ab\n\ncd", 100, 0, 1000).lines).toEqual([
			"ab",
			"",
			"cd",
		]);
	});

	it("splits a word wider than the box", () => {
		const r = wrap(face, "abcdefgh", 100, 0, 200);
		expect(r.lines).toEqual(["abcd", "efgh"]);
		expect(r.overflow).toBe(true);
	});
});

describe("layoutText", () => {
	const box = {
		face,
		size: 100,
		tracking: 0,
		lineHeight: 1,
		align: "left" as const,
		valign: "top" as const,
		w: 1000,
		h: 100,
		fit: "none" as const,
	};

	it("puts the baseline at the ascent for a line height of 1", () => {
		const l = layoutText({ ...box, text: "ab" });
		expect(l.lines[0]?.y).toBeCloseTo(80);
	});

	it("centres and right-aligns", () => {
		expect(
			layoutText({ ...box, text: "ab", align: "center" }).lines[0]?.xs[0],
		).toBe(450);
		expect(
			layoutText({ ...box, text: "ab", align: "right" }).lines[0]?.xs[0],
		).toBe(900);
	});

	it("shrinks to fit, but no further than the floor", () => {
		const long = "abcd ".repeat(20).trim();
		const shrunk = layoutText({ ...box, text: long, fit: "shrink" });
		expect(shrunk.size).toBeLessThan(100);
		expect(shrunk.lines.length * shrunk.size).toBeLessThanOrEqual(100.01);
		const floored = layoutText({
			...box,
			text: long.repeat(10),
			fit: "shrink",
		});
		expect(floored.size).toBeCloseTo(40);
	});

	it("ends with an ellipsis what won't fit even at its smallest", () => {
		const l = layoutText({
			...box,
			text: "abcd ".repeat(400).trim(),
			fit: "shrink",
		});
		expect(l.lines.length * l.size).toBeLessThanOrEqual(100.01);
		expect(l.lines.at(-1)?.chars.at(-1)).toBe("…");
	});

	it("bottom-aligns a block in its box", () => {
		const l = layoutText({ ...box, h: 300, text: "ab", valign: "bottom" });
		expect(l.lines[0]?.y).toBeCloseTo(280);
	});
});

describe("unsupportedChars", () => {
	it("names what the face can't print", () => {
		expect(unsupportedChars(face, "abc 🎉 ł\nab")).toEqual(["🎉", "ł"]);
	});
});
