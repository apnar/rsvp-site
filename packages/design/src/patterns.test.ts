import { describe, expect, it } from "vitest";
import { confetti, type PatternSpec, tiled, tileOf } from "./patterns";

const spec = (over: Partial<PatternSpec> = {}): PatternSpec => ({
	pattern: "dots",
	color: "#000000",
	colors: ["#ff0000", "#00ff00"],
	scale: 1,
	angle: 0,
	seed: 1,
	...over,
});

describe("tileOf", () => {
	it("makes a dot tile that scales, two dots in alternating colours", () => {
		const t = tileOf(spec({ scale: 2 }));
		expect(t).toMatchObject({ w: 112, h: 112 });
		expect(t?.shapes.map((s) => s.color)).toEqual(["#ff0000", "#00ff00"]);
	});

	it("makes one stripe per colour, each half a step wide", () => {
		const t = tileOf(
			spec({ pattern: "stripes", colors: ["#111111", "#222222", "#333333"] }),
		);
		expect(t?.w).toBe(144);
		expect(t?.shapes).toHaveLength(3);
		expect(t?.shapes.map((s) => (s.k === "rect" ? s.x : -1))).toEqual([
			0, 48, 96,
		]);
	});

	it("leaves confetti to be scattered, not tiled", () => {
		expect(tileOf(spec({ pattern: "confetti" }))).toBeNull();
	});

	it("carries the angle for renderers to turn the tile by", () => {
		expect(tileOf(spec({ angle: 30 }))?.angle).toBe(30);
	});
});

describe("tiled", () => {
	const tile = tileOf(spec());
	if (!tile) throw new Error("no tile");

	it("covers the area: every point is within a tile of some dot", () => {
		const shapes = tiled(tile, 1000, 1400);
		expect(shapes.length).toBeGreaterThanOrEqual(
			2 * Math.floor((1000 / 56) * (1400 / 56)),
		);
		const xs = shapes.map((s) => s.x);
		expect(Math.min(...xs)).toBeLessThanOrEqual(0);
		expect(Math.max(...xs)).toBeGreaterThanOrEqual(1000);
	});

	it("reaches further when padded for a bleed", () => {
		expect(tiled(tile, 1000, 1400, 50).length).toBeGreaterThan(
			tiled(tile, 1000, 1400).length,
		);
	});

	it("is the same every time", () => {
		expect(tiled(tile, 400, 400)).toEqual(tiled(tile, 400, 400));
	});
});

describe("confetti", () => {
	it("is seeded: same seed, same pieces; another seed, others", () => {
		const a = confetti(spec({ pattern: "confetti" }), 1000, 1000);
		expect(confetti(spec({ pattern: "confetti" }), 1000, 1000)).toEqual(a);
		expect(
			confetti(spec({ pattern: "confetti", seed: 2 }), 1000, 1000),
		).not.toEqual(a);
	});
});
