/**
 * The sizes a paper invitation can be printed at. On its own so the guest
 * list can offer the choice without loading the PDF library.
 */

export type PaperSize = "card" | "letter" | "half";

export const PAPER_SIZES: { value: PaperSize; label: string }[] = [
	{ value: "card", label: "5x7 card" },
	{ value: "letter", label: "Letter page" },
	{ value: "half", label: "Half letter, 2 per sheet" },
];

/**
 * How a designed card goes onto paper. Its size is the design's own;
 * what's left to choose is the sheet: the card's exact size (a print shop,
 * or card stock cut to size), or two to a letter sheet, or one centred on
 * letter, with marks to cut along.
 */
export type PrintLayout = "exact" | "two-up" | "on-letter";

export type CardFormat = "5x7" | "5x7l" | "square" | "half" | "letter";

export function layoutsFor(
	format: CardFormat,
): { value: PrintLayout; label: string }[] {
	switch (format) {
		case "5x7":
		case "5x7l":
			return [
				{ value: "two-up", label: "Two per letter sheet" },
				{ value: "exact", label: "5x7 pages" },
			];
		case "square":
			return [
				{ value: "on-letter", label: "On letter, with cut marks" },
				{ value: "exact", label: "5.5x5.5 pages" },
			];
		case "half":
			return [
				{ value: "two-up", label: "Two per letter sheet" },
				{ value: "exact", label: "Half-letter pages" },
			];
		case "letter":
			return [{ value: "exact", label: "Letter pages" }];
	}
}
