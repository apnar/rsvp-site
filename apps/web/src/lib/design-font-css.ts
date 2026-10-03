/**
 * @font-face rules for the design fonts a page needs. Only the latin
 * subset is offered -- the glyphs the PDF has -- so a page can't show a
 * character the printed card would lose.
 */
import {
	type FaceKey,
	FONTS,
	type FontId,
	faceKey,
	family,
} from "@rsvp-site/design/fonts";
import { FONT_FILES } from "./design-fonts.gen";

const LATIN =
	"U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

function splitFace(key: FaceKey): { font: FontId; weight: number } {
	const cut = key.lastIndexOf("-");
	return {
		font: key.slice(0, cut) as FontId,
		weight: Number(key.slice(cut + 1)),
	};
}

/** Every weight of a font: a theme's heading and body fonts. */
export function facesOfFont(font: FontId): FaceKey[] {
	return FONTS[font].weights.map((w) => faceKey(font, w));
}

export function fontFaceCss(keys: Iterable<FaceKey>): string {
	return [...new Set(keys)]
		.map((key) => {
			const files = FONT_FILES[key];
			if (!files) return "";
			const { font, weight } = splitFace(key);
			// "block": glyphs are placed one by one for this font's widths, so
			// a fallback face shown meanwhile would overlap itself.
			return `@font-face{font-family:"${family(font)}";font-style:normal;font-weight:${weight};font-display:block;src:url(${files.woff2}) format("woff2");unicode-range:${LATIN}}`;
		})
		.join("");
}
