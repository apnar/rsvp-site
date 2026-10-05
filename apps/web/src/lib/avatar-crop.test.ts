import { describe, expect, it } from "vitest";

import {
	type Crop,
	clamp,
	exportTransform,
	MAX_ZOOM,
	pan,
	type Rotation,
	rotate90,
	type Size,
	START,
	zoomAt,
} from "./avatar-crop";

const landscape: Size = { width: 4000, height: 3000 };
const portrait: Size = { width: 1200, height: 1600 };

/** Where an output pixel lands in the source image, by inverting the transform. */
function sourceOf(crop: Crop, img: Size, size: number, px: number, py: number) {
	const t = exportTransform(crop, img, size);
	const dx = px - t.tx;
	const dy = py - t.ty;
	const c = Math.cos(-t.radians);
	const s = Math.sin(-t.radians);
	return {
		x: (dx * c - dy * s) / t.scale + img.width / 2,
		y: (dx * s + dy * c) / t.scale + img.height / 2,
	};
}

function coversSquare(crop: Crop, img: Size) {
	for (const [px, py] of [
		[0, 0],
		[512, 0],
		[0, 512],
		[512, 512],
	] as const) {
		const p = sourceOf(crop, img, 512, px, py);
		expect(p.x).toBeGreaterThanOrEqual(-1e-6);
		expect(p.y).toBeGreaterThanOrEqual(-1e-6);
		expect(p.x).toBeLessThanOrEqual(img.width + 1e-6);
		expect(p.y).toBeLessThanOrEqual(img.height + 1e-6);
	}
}

describe("avatar crop", () => {
	it("starts on the middle of the picture, edge to edge on the short side", () => {
		const centre = sourceOf(START, landscape, 512, 256, 256);
		expect(centre.x).toBeCloseTo(2000);
		expect(centre.y).toBeCloseTo(1500);
		expect(sourceOf(START, landscape, 512, 256, 0).y).toBeCloseTo(0);
		expect(sourceOf(START, landscape, 512, 256, 512).y).toBeCloseTo(3000);
	});

	it("never pans or zooms out past the picture's edge", () => {
		for (const img of [landscape, portrait]) {
			for (const rotation of [0, 90, 180, 270] as Rotation[]) {
				const wild = clamp({ zoom: 0.2, x: 3, y: -3, rotation }, img);
				expect(wild.zoom).toBe(1);
				coversSquare(wild, img);
				const far = pan({ ...START, zoom: 2.5, rotation }, img, -10, 10);
				coversSquare(far, img);
			}
		}
	});

	it("lets a landscape picture slide sideways but not up and down at zoom 1", () => {
		const moved = pan(START, landscape, 1, 1);
		expect(moved.x).toBeCloseTo((4000 / 3000 - 1) / 2);
		expect(moved.y).toBe(0);
	});

	it("keeps the point under the cursor where it is while zooming", () => {
		const point = { x: 0.2, y: -0.1 };
		const crop = { ...START, zoom: 1.5 };
		const px = (0.5 + point.x) * 512;
		const py = (0.5 + point.y) * 512;
		const before = sourceOf(crop, landscape, 512, px, py);
		const after = sourceOf(
			zoomAt(crop, landscape, 1.4, point),
			landscape,
			512,
			px,
			py,
		);
		expect(after.x).toBeCloseTo(before.x);
		expect(after.y).toBeCloseTo(before.y);
	});

	it("stops zooming at the limit", () => {
		expect(zoomAt(START, landscape, 100).zoom).toBe(MAX_ZOOM);
	});

	it("turns about the centre, so the middle stays the middle", () => {
		const crop = clamp({ ...START, zoom: 2, x: 0.2, y: 0.1 }, portrait);
		const turned = rotate90(crop, portrait);
		expect(turned.rotation).toBe(90);
		const before = sourceOf(crop, portrait, 512, 256, 256);
		const after = sourceOf(turned, portrait, 512, 256, 256);
		expect(after.x).toBeCloseTo(before.x);
		expect(after.y).toBeCloseTo(before.y);
		coversSquare(turned, portrait);
		expect(
			rotate90(rotate90(rotate90(turned, portrait), portrait), portrait)
				.rotation,
		).toBe(0);
	});
});
