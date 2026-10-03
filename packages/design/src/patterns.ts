/**
 * Background pattern geometry. Shapes come from here, seeded, so every
 * renderer draws the same dots in the same places.
 */

export type PatternShape =
	| {
			k: "rect";
			x: number;
			y: number;
			w: number;
			h: number;
			rot: number;
			color: string;
	  }
	| { k: "circle"; x: number; y: number; r: number; color: string };

export type PatternSpec = {
	pattern: "dots" | "stripes" | "confetti";
	color: string;
	colors: readonly string[];
	scale: number;
	angle: number;
	seed: number;
};

/** A repeating tile, drawn turned by `angle` about the area's centre. */
export type Tile = {
	w: number;
	h: number;
	angle: number;
	shapes: PatternShape[];
};

export function tileOf(p: PatternSpec): Tile | null {
	const c = (i: number) => p.colors[i % p.colors.length] ?? p.color;
	if (p.pattern === "dots") {
		const s = 56 * p.scale;
		const r = s * 0.15;
		return {
			w: s,
			h: s,
			angle: p.angle,
			shapes: [
				{ k: "circle", x: s / 4, y: s / 4, r, color: c(0) },
				{ k: "circle", x: (3 * s) / 4, y: (3 * s) / 4, r, color: c(1) },
			],
		};
	}
	if (p.pattern === "stripes") {
		const s = 48 * p.scale;
		const n = p.colors.length;
		return {
			w: s * n,
			h: s,
			angle: p.angle,
			shapes: p.colors.map((_, i) => ({
				k: "rect" as const,
				x: i * s,
				y: 0,
				w: s / 2,
				h: s,
				rot: 0,
				color: c(i),
			})),
		};
	}
	return null;
}

/** mulberry32: small, fast, and the same everywhere. */
function prng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Confetti pieces scattered over a w x h area. */
export function confetti(p: PatternSpec, w: number, h: number): PatternShape[] {
	const rand = prng(p.seed);
	const cell = 120 * p.scale;
	const count = Math.min(400, Math.round(((w * h) / (cell * cell)) * 1.4));
	const out: PatternShape[] = [];
	for (let i = 0; i < count; i++) {
		const color = p.colors[Math.floor(rand() * p.colors.length)] ?? p.color;
		const x = rand() * w;
		const y = rand() * h;
		if (rand() < 0.3) {
			out.push({ k: "circle", x, y, r: (5 + rand() * 4) * p.scale, color });
		} else {
			const len = (16 + rand() * 14) * p.scale;
			out.push({
				k: "rect",
				x: x - len / 2,
				y: y - 3.5 * p.scale,
				w: len,
				h: 7 * p.scale,
				rot: rand() * 180,
				color,
			});
		}
	}
	return out;
}

/**
 * A tile repeated over a w x h area, in the tile's own (turned) frame:
 * draw these inside rotate(angle) about (w/2, h/2), clipped to the area.
 * `pad` reaches past the card's edges, for a print bleed.
 */
export function tiled(
	tile: Tile,
	w: number,
	h: number,
	pad = 0,
): PatternShape[] {
	const reach = Math.hypot(w + 2 * pad, h + 2 * pad) / 2;
	const cx = w / 2;
	const cy = h / 2;
	const out: PatternShape[] = [];
	const x0 = Math.floor((cx - reach) / tile.w);
	const x1 = Math.ceil((cx + reach) / tile.w);
	const y0 = Math.floor((cy - reach) / tile.h);
	const y1 = Math.ceil((cy + reach) / tile.h);
	for (let i = x0; i < x1; i++) {
		for (let j = y0; j < y1; j++) {
			const ox = i * tile.w;
			const oy = j * tile.h;
			for (const s of tile.shapes) {
				out.push(
					s.k === "circle"
						? { ...s, x: s.x + ox, y: s.y + oy }
						: { ...s, x: s.x + ox, y: s.y + oy },
				);
			}
		}
	}
	return out;
}
