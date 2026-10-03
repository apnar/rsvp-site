/**
 * Gradient geometry, worked out once so SVG, canvas and PDF agree.
 */
import type { Stop } from "./schema";

export type LinearEnds = { x1: number; y1: number; x2: number; y2: number };

/**
 * CSS's gradient line for an angle over a w x h box: through the centre,
 * long enough that the corners land exactly on the first and last stop.
 */
export function linearEnds(angle: number, w: number, h: number): LinearEnds {
	const a = (angle * Math.PI) / 180;
	const dx = Math.sin(a);
	const dy = -Math.cos(a);
	const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
	return {
		x1: w / 2 - dx * half,
		y1: h / 2 - dy * half,
		x2: w / 2 + dx * half,
		y2: h / 2 + dy * half,
	};
}

export function sortedStops(stops: readonly Stop[]): Stop[] {
	return [...stops].sort((a, b) => a.at - b.at);
}

export function rgb(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex([r, g, b]: readonly number[]): string {
	return `#${[r, g, b]
		.map((v) =>
			Math.max(0, Math.min(255, Math.round(v ?? 0)))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

/** a mixed toward b by t (0 = a, 1 = b), in sRGB. */
export function mix(a: string, b: string, t: number): string {
	const x = rgb(a);
	const y = rgb(b);
	return toHex(x.map((v, i) => v + ((y[i] ?? 0) - v) * t));
}
