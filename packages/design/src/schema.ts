/**
 * An invitation design: the card face a host builds on the canvas, and the
 * colours and fonts the rest of the guest page takes from it.
 *
 * Everything a host can set is validated here, and the renderers only ever
 * see parsed values: colours are #rrggbb, fonts and stickers come from
 * our registries, numbers are finite and bounded. That is what lets the
 * values go into CSS, SVG attributes and PDF operators without escaping.
 *
 * Geometry is in card units: the card is 1000 wide and as tall as its
 * format says (cardHeight), with y running down.
 */
import { z } from "zod";
import { FONT_IDS, FONTS, type FontId } from "./fonts";
import { STICKER_IDS } from "./stickers";

export const FORMATS = {
	"5x7": { label: "5×7 card", w: 5, h: 7 },
	"5x7l": { label: "5×7 card, landscape", w: 7, h: 5 },
	square: { label: "Square 5.5×5.5", w: 5.5, h: 5.5 },
	half: { label: "Half letter", w: 5.5, h: 8.5 },
	letter: { label: "Letter", w: 8.5, h: 11 },
} as const;

export type Format = keyof typeof FORMATS;
export const FORMAT_IDS = Object.keys(FORMATS) as [Format, ...Format[]];

export const CARD_W = 1000;

export function cardHeight(format: Format): number {
	const f = FORMATS[format];
	return (CARD_W * f.h) / f.w;
}

/** A print shop's 1/8 inch, in card units for this format. */
export function bleedUnits(format: Format): number {
	return (CARD_W * 0.125) / FORMATS[format].w;
}

/** Card units per inch, for warnings phrased in inches. */
export function unitsPerInch(format: Format): number {
	return CARD_W / FORMATS[format].w;
}

export const LIMITS = {
	elements: 80,
	images: 12,
	text: 500,
	/** JSON.stringify of the whole document. */
	bytes: 64_000,
};

const hex = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/, "Colours are #rrggbb")
	.transform((s) => s.toLowerCase());
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const pos = num(-2000, 4000);
const size = num(1, 4000);
const unit = num(0, 1);
const elementId = z.string().regex(/^[a-z0-9]{1,12}$/);
/**
 * An uploaded image of this event's (assertRefs checks which event). The
 * shape alone already rules out paths and URLs.
 */
const ref = z
	.string()
	.regex(
		/^designs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/,
		"Not an uploaded image",
	);

const base = {
	id: elementId,
	x: pos,
	y: pos,
	w: size,
	h: size,
	rot: num(-180, 180).default(0),
	opacity: unit.default(1),
	locked: z.boolean().default(false),
	hidden: z.boolean().default(false),
	/** "paper" prints but is left off the page; "screen" the reverse. */
	show: z.enum(["all", "paper", "screen"]).default("all"),
	name: z.string().max(40).optional(),
};

const crop = {
	ref,
	/** The image's own pixel size, so a crop can be worked out anywhere. */
	iw: z.number().int().min(1).max(10_000),
	ih: z.number().int().min(1).max(10_000),
	/** The point of the image kept in view as it is cropped, 0-1. */
	fx: unit.default(0.5),
	fy: unit.default(0.5),
	zoom: num(1, 5).default(1),
};

export const textElement = z.object({
	...base,
	type: z.literal("text"),
	text: z.string().max(LIMITS.text),
	font: z.enum(FONT_IDS),
	weight: z.number().int().min(100).max(900).default(400),
	size: num(4, 800),
	color: hex,
	align: z.enum(["left", "center", "right"]).default("left"),
	valign: z.enum(["top", "middle", "bottom"]).default("top"),
	lineHeight: num(0.6, 3).default(1.2),
	/** Letter spacing in em. */
	tracking: num(-0.2, 1).default(0),
	upper: z.boolean().default(false),
	shadow: z
		.object({ color: hex, dx: num(-60, 60), dy: num(-60, 60) })
		.nullable()
		.default(null),
	/**
	 * "shrink" steps the size down until the text fits the box: what a
	 * {guest} or {title} needs, since their length changes per card.
	 */
	fit: z.enum(["shrink", "none"]).default("none"),
});

export const imageElement = z.object({
	...base,
	type: z.literal("image"),
	...crop,
	mask: z.enum(["none", "circle", "rounded"]).default("none"),
	radius: num(0, 500).default(0),
	border: z
		.object({ color: hex, width: num(0, 80) })
		.nullable()
		.default(null),
});

const shapeFields = {
	fill: hex.nullable().default(null),
	stroke: hex.nullable().default(null),
	strokeWidth: num(0, 120).default(0),
	dash: z.boolean().default(false),
};

export const rectElement = z.object({
	...base,
	type: z.literal("rect"),
	...shapeFields,
	radius: num(0, 2000).default(0),
});

export const ellipseElement = z.object({
	...base,
	type: z.literal("ellipse"),
	...shapeFields,
});

/** A line runs along the middle of its box, from left to right. */
export const lineElement = z.object({
	...base,
	type: z.literal("line"),
	stroke: hex,
	strokeWidth: num(0.5, 120).default(4),
	dash: z.boolean().default(false),
});

export const stickerElement = z.object({
	...base,
	type: z.literal("sticker"),
	sticker: z.enum(STICKER_IDS),
	color: hex,
});

/** The guest's own sign-in code. It only means anything on paper. */
export const qrElement = z.object({
	...base,
	type: z.literal("qr"),
	fg: hex.default("#14101f"),
	bg: hex.nullable().default("#ffffff"),
});

export const element = z.discriminatedUnion("type", [
	textElement,
	imageElement,
	rectElement,
	ellipseElement,
	lineElement,
	stickerElement,
	qrElement,
]);

const stop = z.object({ at: unit, color: hex });
const stops = z.array(stop).min(2).max(5);

export const background = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("solid"), color: hex }),
	z.object({
		kind: z.literal("linear"),
		/** CSS convention: 0 runs bottom to top, 90 left to right. */
		angle: num(0, 360),
		stops,
	}),
	z.object({
		kind: z.literal("radial"),
		cx: unit,
		cy: unit,
		/** As a share of the card's longer side. */
		r: num(0.05, 2),
		stops,
	}),
	z.object({
		kind: z.literal("image"),
		...crop,
		tint: z
			.object({ color: hex, opacity: num(0, 0.95) })
			.nullable()
			.default(null),
	}),
	z.object({
		kind: z.literal("pattern"),
		pattern: z.enum(["dots", "stripes", "confetti"]),
		color: hex,
		colors: z.array(hex).min(1).max(5),
		scale: num(0.3, 4).default(1),
		angle: num(0, 180).default(0),
		seed: z
			.number()
			.int()
			.min(0)
			.max(2 ** 31)
			.default(1),
	}),
]);

/** The guest page around the card. Every After Dark token derives from it. */
export const theme = z.object({
	bg: hex,
	panel: hex,
	text: hex,
	/** Yes and the main action; lime on After Dark. */
	accent: hex,
	/** Maybe and "send"; pink on After Dark. */
	accent2: hex,
	headingFont: z.enum(FONT_IDS),
	bodyFont: z.enum(FONT_IDS),
});

const designObject = z.object({
	v: z.literal(1),
	format: z.enum(FORMAT_IDS),
	/** Print with a print shop's bleed and crop marks. */
	bleed: z.boolean().default(false),
	background,
	theme,
	elements: z.array(element).max(LIMITS.elements),
});

export const design = designObject.superRefine((d, ctx) => {
	const seen = new Set<string>();
	d.elements.forEach((el, i) => {
		if (seen.has(el.id)) {
			ctx.addIssue({
				code: "custom",
				message: "Element ids must be unique",
				path: ["elements", i, "id"],
			});
		}
		seen.add(el.id);
		if (el.type === "text" && !weightOf(el.font, el.weight)) {
			ctx.addIssue({
				code: "custom",
				message: `${FONTS[el.font].label} has no weight ${el.weight}`,
				path: ["elements", i, "weight"],
			});
		}
		if (
			el.type === "qr" &&
			(Math.abs(el.w - el.h) > 0.5 || el.show !== "paper")
		) {
			ctx.addIssue({
				code: "custom",
				message: "A QR code is square and printed only",
				path: ["elements", i],
			});
		}
	});
	if (new Set(refsOf(d)).size > LIMITS.images) {
		ctx.addIssue({
			code: "custom",
			message: `At most ${LIMITS.images} images`,
			path: ["elements"],
		});
	}
});

function weightOf(font: FontId, weight: number): boolean {
	return (FONTS[font].weights as readonly number[]).includes(weight);
}

export type Design = z.output<typeof design>;
export type DesignInput = z.input<typeof design>;
export type Element = z.output<typeof element>;
export type ElementInput = z.input<typeof element>;
export type TextElement = z.output<typeof textElement>;
export type ImageElement = z.output<typeof imageElement>;
export type Background = z.output<typeof background>;
export type DesignTheme = z.output<typeof theme>;
export type Stop = z.output<typeof stop>;

/** Every uploaded image a design uses, background included. */
export function refsOf(d: {
	background: { kind: string; ref?: string };
	elements: readonly { type: string; ref?: string }[];
}): string[] {
	const refs: string[] = [];
	if (d.background.kind === "image" && d.background.ref)
		refs.push(d.background.ref);
	for (const el of d.elements) {
		if (el.type === "image" && el.ref) refs.push(el.ref);
	}
	return refs;
}

export function designPrefix(eventId: string): string {
	return `designs/${eventId}/`;
}

/** Whether every image the design uses is one uploaded to this event. */
export function refsBelongTo(d: Design, eventId: string): boolean {
	const prefix = designPrefix(eventId);
	return refsOf(d).every(
		(r) => r.startsWith(prefix) && !r.slice(prefix.length).startsWith("card-"),
	);
}

export type ParseResult =
	| { ok: true; design: Design }
	| { ok: false; message: string };

/** Parse a stored or submitted document, size limit included. */
export function parseDesign(doc: unknown): ParseResult {
	if (JSON.stringify(doc).length > LIMITS.bytes) {
		return { ok: false, message: "That design is too large to save." };
	}
	const parsed = design.safeParse(doc);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return {
			ok: false,
			message: issue
				? `${issue.path.join(".") || "design"}: ${issue.message}`
				: "That design isn't valid.",
		};
	}
	return { ok: true, design: parsed.data };
}
