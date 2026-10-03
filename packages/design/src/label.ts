/**
 * What the layers list, the warnings and the save errors call an element:
 * its name, else what it says, else what it is.
 */

/** The fields a label reads; a parsed Element has them all. */
export type Labelled = {
	type: string;
	name?: string | undefined;
	text?: string;
	sticker?: string;
};

const KINDS: Record<string, string> = {
	image: "Image",
	rect: "Rectangle",
	ellipse: "Ellipse",
	line: "Line",
	qr: "QR code",
};

export function elementLabel(el: Labelled): string {
	if (el.name) return el.name;
	if (el.type === "text") {
		const s = (el.text ?? "").replace(/\s+/g, " ").trim();
		return s ? (s.length > 28 ? `${s.slice(0, 28)}…` : s) : "Empty text";
	}
	if (el.type === "sticker") {
		return `Sticker: ${(el.sticker ?? "").replace(/-/g, " ")}`;
	}
	return KINDS[el.type] ?? "Element";
}
