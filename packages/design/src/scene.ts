/**
 * A design laid out for one viewer: the draw list every renderer follows.
 *
 * The SVG on the page, the canvas behind the email image and the PDF all
 * draw exactly these nodes, with text already broken into lines and every
 * glyph placed, so the three cannot drift apart. Nothing here reads the
 * clock, the DOM or a font file, so the server and the browser agree too.
 */
import type { Faces } from "./faces";
import { type FaceKey, type FontId, faceFor, family } from "./fonts";
import { type LinearEnds, linearEnds, sortedStops } from "./paint";
import { confetti, type PatternShape, type Tile, tileOf } from "./patterns";
import { textContent, usesPlaceholder, type Values } from "./placeholders";
import {
	bleedUnits,
	CARD_W,
	cardHeight,
	type Design,
	type Element,
	type Format,
	type Stop,
} from "./schema";
import { STICKERS } from "./stickers";
import { type Line, layoutText, type TextLayout } from "./text";

/**
 * Who the card is drawn for. "web" is the guest page, "paper" the printed
 * card, "image" the one picture shared by every email and link preview,
 * which therefore leaves out anything personal.
 */
export type Mode = "web" | "paper" | "image";

export type Box = { x: number; y: number; w: number; h: number; rot: number };

type Common = {
	id: string;
	box: Box;
	opacity: number;
	/** Differs per guest: the PDF draws these on top of a shared page. */
	dynamic: boolean;
};

export type ImagePlacement = {
	ref: string;
	/** The whole image, in the box's own coordinates (it overhangs). */
	img: { x: number; y: number; w: number; h: number };
	/** The part of it that shows, in the image's pixels. */
	src: { x: number; y: number; w: number; h: number };
};

export type TextNode = Common & {
	k: "text";
	face: FaceKey;
	family: string;
	font: FontId;
	weight: number;
	italic: boolean;
	size: number;
	color: string;
	lines: Line[];
	shadow: { color: string; dx: number; dy: number } | null;
	/** What was written, for screen readers and alt text. */
	content: string;
};

export type SceneNode =
	| (Common & {
			k: "rect";
			fill: string | null;
			stroke: string | null;
			sw: number;
			r: number;
			dash: boolean;
	  })
	| (Common & {
			k: "ellipse";
			fill: string | null;
			stroke: string | null;
			sw: number;
			dash: boolean;
	  })
	| (Common & { k: "line"; stroke: string; sw: number; dash: boolean })
	| (Common & { k: "path"; d: string; vb: number; color: string })
	| (Common &
			ImagePlacement & {
				k: "image";
				mask: "none" | "circle" | "rounded";
				r: number;
				border: { color: string; width: number } | null;
			})
	| TextNode
	| (Common & { k: "qr"; fg: string; bg: string | null });

export type SceneBackground =
	| { k: "solid"; color: string }
	| ({ k: "linear"; stops: Stop[] } & LinearEnds)
	| { k: "radial"; cx: number; cy: number; r: number; stops: Stop[] }
	| (ImagePlacement & {
			k: "image";
			tint: { color: string; opacity: number } | null;
	  })
	| {
			k: "pattern";
			color: string;
			/** A repeating tile (dots, stripes) or loose pieces (confetti). */
			tile: Tile | null;
			pieces: PatternShape[];
	  };

export type Scene = {
	format: Format;
	w: number;
	h: number;
	/**
	 * The area the background covers, in card units. It reaches past the
	 * card by the bleed when printing for a print shop.
	 */
	area: { x: number; y: number; w: number; h: number };
	bleed: number;
	background: SceneBackground;
	nodes: SceneNode[];
};

export type SceneOptions = {
	values: Values;
	mode: Mode;
	faces: Faces;
	/** Paper only: lay out the bleed (the printing side decides). */
	bleed?: boolean;
	/**
	 * Lets a caller that lays the same card out again and again (the
	 * designer, on every drag step) reuse a text's line breaks while nothing
	 * that decides them has changed.
	 */
	textCache?: TextCache;
};

/** One remembered layout per element: moving or recolouring it still hits. */
export type TextCache = Map<string, { key: string; laid: TextLayout }>;

export function shows(el: Element, mode: Mode): boolean {
	if (el.type === "qr") return mode === "paper";
	if (mode === "paper") return el.show !== "screen";
	if (el.show === "paper") return false;
	if (
		mode === "image" &&
		el.type === "text" &&
		usesPlaceholder(el.text, "guest")
	) {
		return false;
	}
	return true;
}

/** Cover-fit with a focal point and zoom, as CSS object-fit + object-position. */
export function placeImage(
	ref: string,
	iw: number,
	ih: number,
	fx: number,
	fy: number,
	zoom: number,
	w: number,
	h: number,
): ImagePlacement {
	const s = Math.max(w / iw, h / ih) * zoom;
	const sw = w / s;
	const sh = h / s;
	const sx = Math.min(Math.max(fx * iw - sw / 2, 0), iw - sw);
	const sy = Math.min(Math.max(fy * ih - sh / 2, 0), ih - sh);
	return {
		ref,
		img: { x: -sx * s, y: -sy * s, w: iw * s, h: ih * s },
		src: { x: sx, y: sy, w: sw, h: sh },
	};
}

export function layoutCard(design: Design, opts: SceneOptions): Scene {
	const w = CARD_W;
	const h = cardHeight(design.format);
	const b = opts.mode === "paper" && opts.bleed ? bleedUnits(design.format) : 0;
	const area = { x: b ? -b : 0, y: b ? -b : 0, w: w + 2 * b, h: h + 2 * b };
	const nodes: SceneNode[] = [];
	for (const el of design.elements) {
		if (el.hidden) continue;
		if (!shows(el, opts.mode)) continue;
		const node = nodeOf(b ? bleedOut(el, b, w, h) : el, opts);
		if (node) nodes.push(node);
	}
	return {
		format: design.format,
		w,
		h,
		area,
		bleed: b,
		background: backgroundOf(design, w, h, area),
		nodes,
	};
}

/**
 * A photo or panel set flush with the card's edge is meant to run off it:
 * on a print shop's card it reaches through the bleed, or a cut a hair off
 * would leave a white sliver.
 */
function bleedOut(el: Element, b: number, w: number, h: number): Element {
	if ((el.type !== "rect" && el.type !== "image") || el.rot !== 0) return el;
	const near = (a: number, c: number) => Math.abs(a - c) < 0.5;
	let { x, y, w: ew, h: eh } = el;
	if (near(x, 0)) {
		x -= b;
		ew += b;
	}
	if (near(y, 0)) {
		y -= b;
		eh += b;
	}
	if (near(el.x + el.w, w)) ew += b;
	if (near(el.y + el.h, h)) eh += b;
	return { ...el, x, y, w: ew, h: eh };
}

function backgroundOf(
	design: Design,
	w: number,
	h: number,
	area: Scene["area"],
): SceneBackground {
	const bg = design.background;
	switch (bg.kind) {
		case "solid":
			return { k: "solid", color: bg.color };
		case "linear":
			return {
				k: "linear",
				stops: sortedStops(bg.stops),
				...linearEnds(bg.angle, w, h),
			};
		case "radial":
			return {
				k: "radial",
				cx: bg.cx * w,
				cy: bg.cy * h,
				r: bg.r * Math.max(w, h),
				stops: sortedStops(bg.stops),
			};
		case "image": {
			const p = placeImage(
				bg.ref,
				bg.iw,
				bg.ih,
				bg.fx,
				bg.fy,
				bg.zoom,
				area.w,
				area.h,
			);
			return {
				k: "image",
				...p,
				img: { ...p.img, x: p.img.x + area.x, y: p.img.y + area.y },
				tint: bg.tint,
			};
		}
		case "pattern": {
			const tile = tileOf(bg);
			return {
				k: "pattern",
				color: bg.color,
				tile,
				pieces: tile
					? []
					: confetti(bg, area.w, area.h).map((s) => ({
							...s,
							x: s.x + area.x,
							y: s.y + area.y,
						})),
			};
		}
	}
}

function nodeOf(el: Element, opts: SceneOptions): SceneNode | null {
	const common = {
		id: el.id,
		box: { x: el.x, y: el.y, w: el.w, h: el.h, rot: el.rot },
		opacity: el.opacity,
		dynamic: false,
	};
	switch (el.type) {
		case "rect":
			return {
				...common,
				k: "rect",
				fill: el.fill,
				stroke: el.stroke,
				sw: el.strokeWidth,
				r: Math.min(el.radius, el.w / 2, el.h / 2),
				dash: el.dash,
			};
		case "ellipse":
			return {
				...common,
				k: "ellipse",
				fill: el.fill,
				stroke: el.stroke,
				sw: el.strokeWidth,
				dash: el.dash,
			};
		case "line":
			return {
				...common,
				k: "line",
				stroke: el.stroke,
				sw: el.strokeWidth,
				dash: el.dash,
			};
		case "sticker":
			return {
				...common,
				k: "path",
				d: STICKERS[el.sticker],
				vb: 256,
				color: el.color,
			};
		case "image":
			return {
				...common,
				k: "image",
				...placeImage(el.ref, el.iw, el.ih, el.fx, el.fy, el.zoom, el.w, el.h),
				mask: el.mask,
				r: el.mask === "rounded" ? Math.min(el.radius, el.w / 2, el.h / 2) : 0,
				border: el.border && el.border.width > 0 ? el.border : null,
			};
		case "qr":
			return { ...common, dynamic: true, k: "qr", fg: el.fg, bg: el.bg };
		case "text": {
			const { key, weight, italic } = faceFor(el.font, el.weight, el.italic);
			const face = opts.faces.get(key);
			if (!face) throw new Error(`Font metrics for ${key} were not loaded`);
			const content = textContent(el, opts.values);
			const box = {
				text: content,
				face,
				size: el.size,
				tracking: el.tracking,
				lineHeight: el.lineHeight,
				align: el.align,
				valign: el.valign,
				w: el.w,
				h: el.h,
				fit: el.fit,
			};
			// Every input of layoutText, the face by its key (a cache lives
			// with one font set), so a hit is exactly the answer a miss gives.
			const cacheKey = JSON.stringify([
				key,
				content,
				el.size,
				el.tracking,
				el.lineHeight,
				el.align,
				el.valign,
				el.w,
				el.h,
				el.fit,
			]);
			let hit = opts.textCache?.get(el.id);
			if (hit?.key !== cacheKey) {
				hit = { key: cacheKey, laid: layoutText(box) };
				opts.textCache?.set(el.id, hit);
			}
			const laid = hit.laid;
			return {
				...common,
				dynamic: opts.mode === "paper" && usesPlaceholder(el.text, "guest"),
				k: "text",
				face: key,
				family: family(el.font),
				font: el.font,
				weight,
				italic,
				size: laid.size,
				color: el.color,
				lines: laid.lines,
				shadow: el.shadow,
				content,
			};
		}
	}
}

/**
 * The dash pattern every renderer strokes a dashed shape with, in card
 * units; null for a solid one. Proportional to the stroke so a thick
 * dashed line doesn't turn into dots.
 */
export function dashOf(n: { dash: boolean; sw: number }): number[] | null {
	return n.dash ? [n.sw * 3, n.sw * 2] : null;
}

export type Glyph = { c: string; x: number; y: number };

/** One drawing of the text: the shadow is the first pass, the text the last. */
export type TextPass = { dx: number; dy: number; color: string };

/**
 * What a renderer draws for a text node: each line's glyphs, with x and
 * baseline in the box's own frame, and the passes to draw them in. Spaces
 * are left out (SVG would collapse them and shift every x after them, and
 * the others have nothing to paint), and so are lines with nothing left.
 */
export function glyphsOf(n: TextNode): {
	lines: Glyph[][];
	passes: TextPass[];
} {
	const lines = n.lines
		.map((line) =>
			line.chars.flatMap((c, i) =>
				c === " " ? [] : [{ c, x: line.xs[i] ?? 0, y: line.y }],
			),
		)
		.filter((g) => g.length > 0);
	const passes: TextPass[] = [];
	if (n.shadow) passes.push(n.shadow);
	passes.push({ dx: 0, dy: 0, color: n.color });
	return { lines, passes };
}
