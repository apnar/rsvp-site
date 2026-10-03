import { bounds } from "./edit";
import { CARD_W, cardHeight, type Design } from "./schema";

/**
 * The QR codes a paper card will really print: not hidden (renderers skip
 * those), not invisible, and at least partly on the card -- the same
 * off-card test warningsOf applies. A code that fails any of these leaves
 * guests with nothing to scan.
 */
export function printableQrs(
	d: Pick<Design, "format" | "elements">,
): Design["elements"] {
	const w = CARD_W;
	const h = cardHeight(d.format);
	return d.elements.filter((el) => {
		if (el.type !== "qr" || el.hidden || el.opacity <= 0) return false;
		const r = bounds(el);
		return !(r.x > w || r.y > h || r.x + r.w < 0 || r.y + r.h < 0);
	});
}

export function hasPrintableQr(
	d: Pick<Design, "format" | "elements">,
): boolean {
	return printableQrs(d).length > 0;
}
