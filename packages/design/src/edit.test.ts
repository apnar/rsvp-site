import { describe, expect, it } from "vitest";
import {
	bounds,
	boxPoint,
	HANDLES,
	type HandleName,
	resize,
	rotation,
	snap,
	snapTargets,
} from "./edit";

const H = (name: HandleName) => HANDLES[name];
const box = { x: 100, y: 100, w: 200, h: 100, rot: 0 };
const close = (a: Record<string, number>, b: Record<string, number>) => {
	for (const k of Object.keys(b)) expect(a[k]).toBeCloseTo(b[k] ?? 0, 6);
};

describe("resize", () => {
	it("drags the bottom-right corner with the top-left fixed", () => {
		close(resize(box, H("se"), { x: 350, y: 260 }, false), {
			x: 100,
			y: 100,
			w: 250,
			h: 160,
		});
	});

	it("drags the left edge, keeping the right one and the height", () => {
		close(resize(box, H("w"), { x: 50, y: 999 }, false), {
			x: 50,
			y: 100,
			w: 250,
			h: 100,
		});
	});

	it("scales evenly when asked", () => {
		close(resize(box, H("se"), { x: 500, y: 210 }, true), {
			x: 100,
			y: 100,
			w: 400,
			h: 200,
		});
	});

	it("keeps the opposite corner of a turned box where it was", () => {
		const turned = { ...box, rot: 90 };
		const topLeft = (b: typeof box) =>
			boxPoint(b, { x: -b.w / 2, y: -b.h / 2 });
		const before = topLeft(turned);
		expect(before.x).toBeCloseTo(250);
		expect(before.y).toBeCloseTo(50);
		const after = resize(turned, H("se"), { x: 150, y: 400 }, false);
		close(topLeft(after), before);
		expect(after.w).not.toBe(turned.w);
	});

	it("never shrinks below the minimum", () => {
		expect(resize(box, H("se"), { x: 0, y: 0 }, false).w).toBe(8);
	});
});

describe("rotation", () => {
	it("points the top at the pointer", () => {
		expect(rotation(box, { x: 400, y: 150 }, false)).toBe(90);
		expect(rotation(box, { x: 200, y: 0 }, false)).toBe(0);
	});

	it("settles on right angles and steps", () => {
		expect(rotation(box, { x: 400, y: 160 }, false)).toBe(90);
		expect(rotation(box, { x: 400, y: 100 }, true)).toBe(75);
	});
});

describe("snap", () => {
	it("pulls the nearest edge or centre onto a target", () => {
		const r = snap({ x: 497, y: 10, w: 100, h: 50 }, { x: [500], y: [] }, 6);
		expect(r.dx).toBe(3);
		expect(r.guides).toEqual([{ axis: "x", at: 500 }]);
		expect(
			snap({ x: 445, y: 0, w: 100, h: 50 }, { x: [500], y: [] }, 6).dx,
		).toBe(5);
		expect(
			snap({ x: 480, y: 0, w: 100, h: 50 }, { x: [500], y: [] }, 6).dx,
		).toBe(0);
	});

	it("targets the card, its bleed, and other boxes' bounds", () => {
		const t = snapTargets({ w: 1000, h: 1400, bleed: 25 }, [
			{ x: 10, y: 20, w: 30, h: 40, rot: 0 },
		]);
		expect(t.x).toEqual([0, 500, 1000, -25, 1025, 10, 25, 40]);
	});
});

describe("bounds", () => {
	it("is the box itself unturned, and grows when turned", () => {
		expect(bounds(box)).toEqual({ x: 100, y: 100, w: 200, h: 100 });
		const b = bounds({ ...box, rot: 90 });
		expect(b.w).toBeCloseTo(100);
		expect(b.h).toBeCloseTo(200);
	});
});
