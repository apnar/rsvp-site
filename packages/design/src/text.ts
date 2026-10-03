/**
 * Text layout, done once here for every renderer. A browser left to wrap
 * a line itself would break it a word earlier or later than the PDF
 * does, so the page, the card image and the print all take their line
 * breaks and every glyph's x from this file instead.
 *
 * Sizes are in card units and font metrics in thousandths of an em.
 */

/** What scripts/gen-design-fonts.ts writes for each face. */
export type FaceMetrics = {
	asc: number;
	desc: number;
	/** The characters the face has, in the order of adv. */
	chars: string;
	adv: number[];
	/** "<a><b><adjust>" entries joined by spaces. */
	kern: string;
};

export type Face = {
	asc: number;
	desc: number;
	adv: Map<string, number>;
	kern: Map<string, number>;
	/** What a character the face lacks is measured as. */
	missing: number;
};

const faces = new WeakMap<FaceMetrics, Face>();

export function prepareFace(m: FaceMetrics): Face {
	const cached = faces.get(m);
	if (cached) return cached;
	const adv = new Map<string, number>();
	Array.from(m.chars).forEach((c, i) => {
		adv.set(c, m.adv[i] ?? 0);
	});
	const kern = new Map<string, number>();
	for (const entry of m.kern.split(" ")) {
		if (entry.length < 3) continue;
		const [a, b] = Array.from(entry);
		if (!a || !b) continue;
		kern.set(a + b, Number(entry.slice(a.length + b.length)));
	}
	const face: Face = {
		asc: m.asc,
		desc: m.desc,
		adv,
		kern,
		missing: adv.get("n") ?? 550,
	};
	faces.set(m, face);
	return face;
}

const bases = new Map<string, string>();

/** "é" kerns as "e": the tables only hold ASCII pairs. */
function kernBase(c: string): string {
	if (c.charCodeAt(0) < 0x80) return c;
	let b = bases.get(c);
	if (b === undefined) {
		const stripped = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
		b = stripped.length === 1 ? stripped : c;
		bases.set(c, b);
	}
	return b;
}

function advance(face: Face, c: string): number {
	return face.adv.get(c) ?? face.missing;
}

function kerning(face: Face, a: string, b: string): number {
	return face.kern.get(kernBase(a) + kernBase(b)) ?? 0;
}

export type Run = {
	/** One entry per character (code point). */
	chars: string[];
	/** Each character's x from the start of the run, in card units. */
	xs: number[];
	width: number;
};

/** Lay out one line's glyphs: advances, pair kerning, letter spacing. */
export function run(
	face: Face,
	text: string,
	size: number,
	tracking: number,
): Run {
	const chars = Array.from(text);
	const xs: number[] = [];
	const k = size / 1000;
	const gap = tracking * size;
	let x = 0;
	chars.forEach((c, i) => {
		const prev = chars[i - 1];
		if (prev !== undefined) x += kerning(face, prev, c) * k + gap;
		xs.push(x);
		x += advance(face, c) * k;
	});
	return { chars, xs, width: x };
}

export type TextBox = {
	text: string;
	face: Face;
	size: number;
	tracking: number;
	lineHeight: number;
	align: "left" | "center" | "right";
	valign: "top" | "middle" | "bottom";
	w: number;
	h: number;
	fit: "shrink" | "none";
};

export type Line = {
	chars: string[];
	/** Absolute x of each character within the box. */
	xs: number[];
	/** The baseline, from the top of the box. */
	y: number;
	width: number;
};

export type TextLayout = { size: number; lines: Line[] };

/** Greedy wrap at spaces; hard breaks at \n; overlong words split. */
export function wrap(
	face: Face,
	text: string,
	size: number,
	tracking: number,
	width: number,
): { lines: string[]; overflow: boolean } {
	const lines: string[] = [];
	let overflow = false;
	const fits = (s: string) =>
		run(face, s, size, tracking).width <= width + 0.01;
	for (const para of text.split("\n")) {
		const words = para.split(/ +/).filter(Boolean);
		let line = "";
		for (const word of words) {
			const next = line ? `${line} ${word}` : word;
			if (fits(next)) {
				line = next;
				continue;
			}
			if (line) lines.push(line);
			if (fits(word)) {
				line = word;
				continue;
			}
			// A word wider than the box: break it wherever it has to.
			overflow = true;
			let piece = "";
			for (const c of Array.from(word)) {
				if (piece && !fits(piece + c)) {
					lines.push(piece);
					piece = c;
				} else piece += c;
			}
			line = piece;
		}
		lines.push(line);
	}
	return { lines, overflow };
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}

/** The smallest a "shrink" box goes, as a share of its set size. */
export const SHRINK_FLOOR = 0.4;

export function layoutText(box: TextBox): TextLayout {
	let size = box.size;
	let lines = wrap(box.face, box.text, size, box.tracking, box.w);
	if (box.fit === "shrink") {
		const floor = box.size * SHRINK_FLOOR;
		while (
			size > floor &&
			(lines.overflow ||
				lines.lines.length * size * box.lineHeight > box.h + 0.01)
		) {
			size = Math.max(floor, size * 0.95);
			lines = wrap(box.face, box.text, size, box.tracking, box.w);
		}
	}
	const lh = size * box.lineHeight;
	const k = size / 1000;
	const glyphH = (box.face.asc - box.face.desc) * k;
	const blockH = lines.lines.length * lh;
	const top =
		box.valign === "top"
			? 0
			: box.valign === "middle"
				? (box.h - blockH) / 2
				: box.h - blockH;
	return {
		size,
		lines: lines.lines.map((text, i) => {
			const r = run(box.face, text, size, box.tracking);
			const dx =
				box.align === "left"
					? 0
					: box.align === "center"
						? (box.w - r.width) / 2
						: box.w - r.width;
			return {
				chars: r.chars,
				// Hundredths of a unit are far below a printer's dot, and the
				// rounding keeps the scene small enough to send to the page.
				xs: r.xs.map((x) => round(x + dx)),
				y: round(top + i * lh + (lh - glyphH) / 2 + box.face.asc * k),
				width: round(r.width),
			};
		}),
	};
}

/** Characters the face can't print, which would come out as boxes on paper. */
export function unsupportedChars(face: Face, text: string): string[] {
	const out = new Set<string>();
	for (const c of Array.from(text)) {
		if (c === "\n" || c === " ") continue;
		if (!face.adv.has(c)) out.add(c);
	}
	return [...out];
}
