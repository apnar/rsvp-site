/**
 * The designer's geometry: dragging, resizing and turning elements, and
 * snapping them to the card and to each other. Pure, so it is tested here
 * rather than by hand in a browser.
 */
import type { Box } from "./scene";

export type Point = { x: number; y: number };

/** -1, 0 or 1 per axis: which edges a handle moves. "nw" is (-1, -1). */
export type Handle = { hx: -1 | 0 | 1; hy: -1 | 0 | 1 };

export const HANDLES = {
	nw: { hx: -1, hy: -1 },
	n: { hx: 0, hy: -1 },
	ne: { hx: 1, hy: -1 },
	e: { hx: 1, hy: 0 },
	se: { hx: 1, hy: 1 },
	s: { hx: 0, hy: 1 },
	sw: { hx: -1, hy: 1 },
	w: { hx: -1, hy: 0 },
} as const satisfies Record<string, Handle>;

export type HandleName = keyof typeof HANDLES;

function turn(p: Point, deg: number): Point {
	const a = (deg * Math.PI) / 180;
	return {
		x: p.x * Math.cos(a) - p.y * Math.sin(a),
		y: p.x * Math.sin(a) + p.y * Math.cos(a),
	};
}

/** A point turned by `deg` about another one. */
export function turnAbout(p: Point, about: Point, deg: number): Point {
	const t = turn({ x: p.x - about.x, y: p.y - about.y }, deg);
	return { x: about.x + t.x, y: about.y + t.y };
}

function centerOf(b: Box): Point {
	return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** A point of the box, in its own frame relative to its centre, on the card. */
export function boxPoint(b: Box, local: Point): Point {
	const c = centerOf(b);
	return turnAbout({ x: c.x + local.x, y: c.y + local.y }, c, b.rot);
}

/** The four corners on the card, turned. */
export function corners(b: Box): Point[] {
	return [
		{ x: -b.w / 2, y: -b.h / 2 },
		{ x: b.w / 2, y: -b.h / 2 },
		{ x: b.w / 2, y: b.h / 2 },
		{ x: -b.w / 2, y: b.h / 2 },
	].map((p) => boxPoint(b, p));
}

/** The upright rectangle around a (possibly turned) box. */
export function bounds(b: Box): { x: number; y: number; w: number; h: number } {
	const pts = b.rot
		? corners(b)
		: [
				{ x: b.x, y: b.y },
				{ x: b.x + b.w, y: b.y + b.h },
			];
	const xs = pts.map((p) => p.x);
	const ys = pts.map((p) => p.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

const MIN_SIZE = 8;

/**
 * Drag a handle to `p`. The opposite edge or corner stays where it is on
 * the card, turned box or not. With `keepAspect` the box scales evenly.
 */
export function resize(
	b: Box,
	handle: Handle,
	p: Point,
	keepAspect: boolean,
): Box {
	const { hx, hy } = handle;
	const c = centerOf(b);
	const local = turn({ x: p.x - c.x, y: p.y - c.y }, -b.rot);
	const anchor = { x: (-hx * b.w) / 2, y: (-hy * b.h) / 2 };
	let w = hx ? Math.max(MIN_SIZE, (local.x - anchor.x) * hx) : b.w;
	let h = hy ? Math.max(MIN_SIZE, (local.y - anchor.y) * hy) : b.h;
	if (keepAspect) {
		const k = hx && hy ? Math.max(w / b.w, h / b.h) : hx ? w / b.w : h / b.h;
		w = Math.max(MIN_SIZE, b.w * k);
		h = Math.max(MIN_SIZE, b.h * k);
	}
	const mid = {
		x: hx ? anchor.x + (hx * w) / 2 : 0,
		y: hy ? anchor.y + (hy * h) / 2 : 0,
	};
	const t = turn(mid, b.rot);
	const nc = { x: c.x + t.x, y: c.y + t.y };
	return { x: nc.x - w / 2, y: nc.y - h / 2, w, h, rot: b.rot };
}

/**
 * The angle that points the box's top at `p`. Always settles on a right
 * angle within 3°; with `steps`, on 15° steps.
 */
export function rotation(b: Box, p: Point, steps: boolean): number {
	const c = centerOf(b);
	let deg = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
	if (steps) deg = Math.round(deg / 15) * 15;
	const right = Math.round(deg / 90) * 90;
	if (Math.abs(deg - right) < 3) deg = right;
	deg = ((((deg + 180) % 360) + 360) % 360) - 180;
	return Math.round(deg * 10) / 10;
}

export type Guide = { axis: "x" | "y"; at: number };

/**
 * Snap a moving rectangle's edges and centre to the targets on each axis,
 * within `tolerance`. Returns how far to shift it and the lines it met.
 */
export function snap(
	moving: { x: number; y: number; w: number; h: number },
	targets: { x: number[]; y: number[] },
	tolerance: number,
): { dx: number; dy: number; guides: Guide[] } {
	const axis = (from: number[], to: number[]) => {
		let best: { d: number; at: number } | null = null;
		for (const f of from) {
			for (const t of to) {
				const d = t - f;
				if (
					Math.abs(d) <= tolerance &&
					(!best || Math.abs(d) < Math.abs(best.d))
				) {
					best = { d, at: t };
				}
			}
		}
		return best;
	};
	const sx = axis(
		[moving.x, moving.x + moving.w / 2, moving.x + moving.w],
		targets.x,
	);
	const sy = axis(
		[moving.y, moving.y + moving.h / 2, moving.y + moving.h],
		targets.y,
	);
	const guides: Guide[] = [];
	if (sx) guides.push({ axis: "x", at: sx.at });
	if (sy) guides.push({ axis: "y", at: sy.at });
	return { dx: sx?.d ?? 0, dy: sy?.d ?? 0, guides };
}

/** Lines worth snapping to: the card's edges and middle, and other boxes'. */
export function snapTargets(
	card: { w: number; h: number; bleed: number },
	others: readonly Box[],
): { x: number[]; y: number[] } {
	const x = [0, card.w / 2, card.w];
	const y = [0, card.h / 2, card.h];
	if (card.bleed) {
		x.push(-card.bleed, card.w + card.bleed);
		y.push(-card.bleed, card.h + card.bleed);
	}
	for (const o of others) {
		const r = bounds(o);
		x.push(r.x, r.x + r.w / 2, r.x + r.w);
		y.push(r.y, r.y + r.h / 2, r.y + r.h);
	}
	return { x, y };
}
