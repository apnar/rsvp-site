/**
 * The fonts a design may use. Each one is self-hosted from @fontsource so
 * the page, the card image and the printed PDF draw from the same files,
 * which is what keeps their line breaks identical. A family name here is
 * ours ("rsvpd-..."), never a string a host typed, so it can go into CSS.
 */

type FontCategory = "sans" | "serif" | "display" | "script" | "hand";

export type FontInfo = {
	label: string;
	category: FontCategory;
	weights: readonly number[];
	/** Weights that also come in italic, when the font has any. */
	italics?: readonly number[];
};

export const FONTS = {
	unbounded: {
		label: "Unbounded",
		category: "display",
		weights: [400, 700, 900],
	},
	manrope: { label: "Manrope", category: "sans", weights: [400, 600, 800] },
	fraunces: { label: "Fraunces", category: "serif", weights: [400, 700, 900] },
	"playfair-display": {
		label: "Playfair Display",
		category: "serif",
		weights: [400, 700, 900],
	},
	"dm-serif-display": {
		label: "DM Serif Display",
		category: "serif",
		weights: [400],
	},
	lora: { label: "Lora", category: "serif", weights: [400, 700] },
	merriweather: {
		label: "Merriweather",
		category: "serif",
		weights: [400, 700],
		italics: [400, 700],
	},
	"cormorant-garamond": {
		label: "Cormorant Garamond",
		category: "serif",
		weights: [400, 600, 700],
	},
	"abril-fatface": {
		label: "Abril Fatface",
		category: "display",
		weights: [400],
	},
	"bebas-neue": { label: "Bebas Neue", category: "display", weights: [400] },
	anton: { label: "Anton", category: "display", weights: [400] },
	"archivo-black": {
		label: "Archivo Black",
		category: "display",
		weights: [400],
	},
	"space-grotesk": {
		label: "Space Grotesk",
		category: "sans",
		weights: [400, 700],
	},
	poppins: { label: "Poppins", category: "sans", weights: [400, 600, 800] },
	fredoka: { label: "Fredoka", category: "sans", weights: [400, 600] },
	"baloo-2": { label: "Baloo 2", category: "display", weights: [500, 800] },
	pacifico: { label: "Pacifico", category: "script", weights: [400] },
	shrikhand: { label: "Shrikhand", category: "display", weights: [400] },
	righteous: { label: "Righteous", category: "display", weights: [400] },
	caveat: { label: "Caveat", category: "hand", weights: [400, 700] },
	"permanent-marker": {
		label: "Permanent Marker",
		category: "hand",
		weights: [400],
	},
	"dancing-script": {
		label: "Dancing Script",
		category: "script",
		weights: [400, 700],
	},
} as const satisfies Record<string, FontInfo>;

export type FontId = keyof typeof FONTS;

export const FONT_IDS = Object.keys(FONTS) as [FontId, ...FontId[]];

/** Every face the registry ships, as "<id>-<weight>", with "i" for italic. */
export type FaceKey = `${FontId}-${number}` | `${FontId}-${number}i`;

function italicsOf(font: FontId): readonly number[] {
	const info: FontInfo = FONTS[font];
	return info.italics ?? [];
}

export function hasItalic(font: FontId): boolean {
	return italicsOf(font).length > 0;
}

export const FACES: FaceKey[] = FONT_IDS.flatMap((id) => [
	...FONTS[id].weights.map((w) => faceKey(id, w)),
	...italicsOf(id).map((w) => faceKey(id, w, true)),
]);

export function faceKey(font: FontId, weight: number, italic = false): FaceKey {
	return italic ? `${font}-${weight}i` : `${font}-${weight}`;
}

/** The font, weight and style a face key names. */
export function parseFace(key: FaceKey): {
	font: FontId;
	weight: number;
	italic: boolean;
} {
	const italic = key.endsWith("i");
	const bare = italic ? key.slice(0, -1) : key;
	const cut = bare.lastIndexOf("-");
	return {
		font: bare.slice(0, cut) as FontId,
		weight: Number(bare.slice(cut + 1)),
		italic,
	};
}

export function family(font: FontId): string {
	return `rsvpd-${font}`;
}

/** What a mail client or a page without our fonts falls back to. */
const STACKS: Record<FontCategory, string> = {
	sans: '"Helvetica Neue", Arial, sans-serif',
	serif: 'Georgia, "Times New Roman", serif',
	display: '"Arial Black", Impact, sans-serif',
	script: '"Brush Script MT", "Segoe Script", cursive',
	hand: '"Bradley Hand", "Comic Sans MS", cursive',
};

export function fallbackStack(font: FontId): string {
	return STACKS[FONTS[font].category];
}

export function fontStack(font: FontId): string {
	return `"${family(font)}", ${fallbackStack(font)}`;
}

/** The registry weight nearest to the one asked for, in that style. */
export function nearestWeight(
	font: FontId,
	weight: number,
	italic = false,
): number {
	const weights: readonly number[] =
		italic && hasItalic(font) ? italicsOf(font) : FONTS[font].weights;
	let best = weights[0] ?? 400;
	for (const w of weights) {
		if (Math.abs(w - weight) < Math.abs(best - weight)) best = w;
	}
	return best;
}

/**
 * The face a text element draws with: italic only where the font has it,
 * and the registry weight nearest to the one asked for. The one place
 * this is decided, so layout, loading and warnings name the same face.
 */
export function faceFor(
	font: FontId,
	weight: number,
	italic = false,
): { key: FaceKey; weight: number; italic: boolean } {
	const it = italic && hasItalic(font);
	const w = nearestWeight(font, weight, it);
	return { key: faceKey(font, w, it), weight: w, italic: it };
}
