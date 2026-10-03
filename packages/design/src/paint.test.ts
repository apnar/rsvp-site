import { describe, expect, it } from "vitest";
import { linearEnds, mix, rgb, toHex } from "./paint";

describe("mix", () => {
	it("is a at 0 and b at 1", () => {
		expect(mix("#102030", "#ffffff", 0)).toBe("#102030");
		expect(mix("#102030", "#ffffff", 1)).toBe("#ffffff");
	});

	it("blends in the middle, rounding each channel", () => {
		expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
		expect(mix("#ff0000", "#0000ff", 0.25)).toBe("#bf0040");
	});

	it("stays a valid colour when t overshoots", () => {
		expect(mix("#000000", "#ffffff", 2)).toBe("#ffffff");
		expect(mix("#000000", "#ffffff", -1)).toBe("#000000");
	});
});

describe("rgb and toHex", () => {
	it("round trip", () => {
		expect(toHex(rgb("#c6ff3d"))).toBe("#c6ff3d");
	});
});

describe("linearEnds", () => {
	it("runs bottom to top at 0 degrees, through the centre", () => {
		const e = linearEnds(0, 100, 200);
		expect(e.x1).toBeCloseTo(50);
		expect(e.x2).toBeCloseTo(50);
		expect(e.y1).toBeCloseTo(200);
		expect(e.y2).toBeCloseTo(0);
	});
});
