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
