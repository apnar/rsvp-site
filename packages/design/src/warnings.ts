/**
 * What the designer points out before a host saves: things that would
 * print wrong, read badly, or say more than the host meant to.
 */
import { bounds } from "./edit";
import type { Faces } from "./faces";
import { FONTS, faceKey, nearestWeight } from "./fonts";
import { fill, usesPlaceholder, type Values } from "./placeholders";
import {
	bleedUnits,
	CARD_W,
	cardHeight,
	type Design,
	unitsPerInch,
} from "./schema";
import { unsupportedChars } from "./text";
import { contrast } from "./theme";

export type Warning = {
	/** The element it is about, if any, so the designer can select it. */
	id?: string;
	/** "block" stops a save. */
	level: "warn" | "block";
	message: string;
};

export function warningsOf(
	d: Design,
	opts: { paper: boolean; shareLink: boolean; faces: Faces; values: Values },
): Warning[] {
	const out: Warning[] = [];
	const w = CARD_W;
	const h = cardHeight(d.format);
	const inch = unitsPerInch(d.format);
	const qrs = d.elements.filter((el) => el.type === "qr" && !el.hidden);
	if (opts.paper && qrs.length === 0) {
		out.push({
			level: "block",
			message:
				"Guests answer a paper invitation by scanning its QR code. Add one.",
		});
	}
	for (const qr of qrs) {
		if (qr.w < 0.75 * inch) {
			out.push({
				id: qr.id,
				level: "warn",
				message:
					"The QR code is under ¾ inch across; some phones won't read it.",
			});
		}
	}
	const safe = d.bleed ? bleedUnits(d.format) : 0;
	for (const el of d.elements) {
		if (el.hidden) continue;
		const r = bounds(el);
		if (r.x > w || r.y > h || r.x + r.w < 0 || r.y + r.h < 0) {
			out.push({
				id: el.id,
				level: "warn",
				message: `${label(el)} is off the card.`,
			});
			continue;
		}
		if (el.type !== "text") continue;
		const content = fill(el.text, opts.values);
		const face = opts.faces.get(
			faceKey(el.font, nearestWeight(el.font, el.weight)),
		);
		const missing = face
			? unsupportedChars(face, el.upper ? content.toUpperCase() : content)
			: [];
		if (missing.length > 0) {
			out.push({
				id: el.id,
				level: "warn",
				message: `${missing.join(" ")} won't print in ${FONTS[el.font].label}. Try a sticker instead.`,
			});
		}
		if (
			safe &&
			(r.x < safe || r.y < safe || r.x + r.w > w - safe || r.y + r.h > h - safe)
		) {
			out.push({
				id: el.id,
				level: "warn",
				message: `${label(el)} is close enough to the edge to be trimmed.`,
			});
		}
		if (opts.shareLink && usesPlaceholder(el.text, "location")) {
			out.push({
				id: el.id,
				level: "warn",
				message:
					"The share link is on, and anyone with it sees this card, address included.",
			});
		}
	}
	const t = d.theme;
	if (contrast(t.text, t.bg) < 4.5 || contrast(t.text, t.panel) < 4.5) {
		out.push({
			level: "warn",
			message:
				"The page's text colour is hard to read on its background or panels.",
		});
	}
	return out;
}

function label(el: Design["elements"][number]): string {
	if (el.name) return `“${el.name}”`;
	if (el.type === "text") {
		const s = el.text.replace(/\s+/g, " ").trim();
		return s ? `“${s.length > 24 ? `${s.slice(0, 24)}…` : s}”` : "A text box";
	}
	return {
		image: "An image",
		rect: "A rectangle",
		ellipse: "An ellipse",
		line: "A line",
		sticker: "A sticker",
		qr: "The QR code",
	}[el.type];
}
