/**
 * The designer's document state: the design, what is selected, and undo.
 *
 * A drag updates the document live without touching history and commits
 * one step when it ends; inspector edits to the same field within a
 * moment coalesce into one step, so undo goes back a whole change rather
 * than a keystroke.
 */
import { nearestWeight } from "@rsvp-site/design/fonts";
import {
	CARD_W,
	cardHeight,
	type Design,
	type Element,
	design as schema,
} from "@rsvp-site/design/schema";
import type { StickerId } from "@rsvp-site/design/stickers";
import { isLight } from "@rsvp-site/design/theme";

const HISTORY = 100;
const COALESCE_MS = 600;

export type EditorState = {
	doc: Design;
	past: Design[];
	future: Design[];
	selected: string[];
	lastKey: string | null;
	lastAt: number;
};

export type EditorAction =
	/** An edit. Edits with the same key in quick succession are one step. */
	| { t: "set"; doc: Design; key?: string }
	/** A drag in progress: shown, not yet in history. */
	| { t: "live"; doc: Design }
	/** A drag ended: one step back to where it started. */
	| { t: "commit"; before: Design }
	| { t: "select"; ids: string[] }
	| { t: "undo" }
	| { t: "redo" }
	| { t: "load"; doc: Design };

export function initialState(doc: Design): EditorState {
	return { doc, past: [], future: [], selected: [], lastKey: null, lastAt: 0 };
}

function existing(ids: string[], doc: Design): string[] {
	return ids.filter((id) => doc.elements.some((e) => e.id === id));
}

export function reducer(s: EditorState, a: EditorAction): EditorState {
	switch (a.t) {
		case "set": {
			const now = Date.now();
			const coalesce =
				a.key !== undefined &&
				a.key === s.lastKey &&
				now - s.lastAt < COALESCE_MS;
			return {
				...s,
				doc: a.doc,
				past: coalesce ? s.past : [...s.past, s.doc].slice(-HISTORY),
				future: [],
				selected: existing(s.selected, a.doc),
				lastKey: a.key ?? null,
				lastAt: now,
			};
		}
		case "live":
			return { ...s, doc: a.doc };
		case "commit":
			if (a.before === s.doc) return s;
			return {
				...s,
				past: [...s.past, a.before].slice(-HISTORY),
				future: [],
				lastKey: null,
			};
		case "select":
			return { ...s, selected: existing(a.ids, s.doc) };
		case "undo": {
			const prev = s.past[s.past.length - 1];
			if (!prev) return s;
			return {
				...s,
				doc: prev,
				past: s.past.slice(0, -1),
				future: [s.doc, ...s.future],
				selected: existing(s.selected, prev),
				lastKey: null,
			};
		}
		case "redo": {
			const next = s.future[0];
			if (!next) return s;
			return {
				...s,
				doc: next,
				past: [...s.past, s.doc],
				future: s.future.slice(1),
				selected: existing(s.selected, next),
				lastKey: null,
			};
		}
		case "load":
			return initialState(a.doc);
	}
}

export function newId(doc: Design): string {
	for (;;) {
		const id = Math.random().toString(36).slice(2, 10);
		if (!doc.elements.some((e) => e.id === id)) return id;
	}
}

/** Apply a change to some elements. */
export function updateEls(
	doc: Design,
	ids: readonly string[],
	fn: (el: Element) => Element,
): Design {
	return {
		...doc,
		elements: doc.elements.map((e) => (ids.includes(e.id) ? fn(e) : e)),
	};
}

export function patchEl<E extends Element>(
	doc: Design,
	id: string,
	patch: Partial<E>,
): Design {
	return updateEls(doc, [id], (e) => ({ ...e, ...patch }) as Element);
}

export function removeEls(doc: Design, ids: readonly string[]): Design {
	return { ...doc, elements: doc.elements.filter((e) => !ids.includes(e.id)) };
}

export function addEl(doc: Design, el: Element): Design {
	return { ...doc, elements: [...doc.elements, el] };
}

export function duplicateEls(
	doc: Design,
	ids: readonly string[],
): { doc: Design; ids: string[] } {
	let next = doc;
	const made: string[] = [];
	for (const el of doc.elements.filter((e) => ids.includes(e.id))) {
		const id = newId(next);
		next = addEl(next, {
			...el,
			id,
			x: el.x + 24,
			y: el.y + 24,
			name: undefined,
		});
		made.push(id);
	}
	return { doc: next, ids: made };
}

/** Raise or lower in the stack: one step, or all the way. */
export function restack(
	doc: Design,
	id: string,
	to: "up" | "down" | "top" | "bottom",
): Design {
	const els = [...doc.elements];
	const i = els.findIndex((e) => e.id === id);
	const el = els[i];
	if (!el) return doc;
	els.splice(i, 1);
	const j =
		to === "top"
			? els.length
			: to === "bottom"
				? 0
				: to === "up"
					? Math.min(els.length, i + 1)
					: Math.max(0, i - 1);
	els.splice(j, 0, el);
	return { ...doc, elements: els };
}

/** Whether new things on the card should be dark or light to show up. */
export function cardIsLight(doc: Design): boolean {
	const bg = doc.background;
	switch (bg.kind) {
		case "solid":
		case "pattern":
			return isLight(bg.color);
		case "linear":
		case "radial":
			return isLight(bg.stops[0]?.color ?? "#000000");
		case "image":
			return false;
	}
}

function centred(doc: Design, w: number, h: number) {
	return { x: (CARD_W - w) / 2, y: (cardHeight(doc.format) - h) / 2, w, h };
}

/** Parse a new element so its defaults are filled the way a saved one's are. */
function made(input: unknown): Element {
	const parsed = schema.parse({
		v: 1,
		format: "square",
		background: { kind: "solid", color: "#ffffff" },
		theme: {
			bg: "#000000",
			panel: "#000000",
			text: "#ffffff",
			accent: "#ffffff",
			accent2: "#ffffff",
			headingFont: "manrope",
			bodyFont: "manrope",
		},
		elements: [input],
	});
	const el = parsed.elements[0];
	if (!el) throw new Error("No element");
	return el;
}

export function newText(doc: Design): Element {
	const font = doc.theme.headingFont;
	return made({
		id: newId(doc),
		type: "text",
		...centred(doc, 700, 120),
		text: "Your words here",
		font,
		weight: nearestWeight(font, 700),
		size: 64,
		align: "center",
		valign: "middle",
		color: cardIsLight(doc) ? "#14101f" : "#ffffff",
	});
}

export function newShape(
	doc: Design,
	type: "rect" | "ellipse" | "line",
): Element {
	if (type === "line") {
		return made({
			id: newId(doc),
			type,
			...centred(doc, 600, 24),
			stroke: cardIsLight(doc) ? "#14101f" : "#ffffff",
			strokeWidth: 6,
		});
	}
	return made({
		id: newId(doc),
		type,
		...centred(doc, 360, 360),
		fill: type === "rect" ? doc.theme.accent : doc.theme.accent2,
	});
}

export function newSticker(doc: Design, sticker: StickerId): Element {
	return made({
		id: newId(doc),
		type: "sticker",
		...centred(doc, 220, 220),
		sticker,
		color: doc.theme.accent2,
	});
}

export function newImage(
	doc: Design,
	ref: string,
	iw: number,
	ih: number,
): Element {
	const w = Math.min(700, CARD_W * 0.7);
	const h = Math.min(cardHeight(doc.format) * 0.7, (w * ih) / iw);
	return made({
		id: newId(doc),
		type: "image",
		...centred(doc, (h * iw) / ih, h),
		ref,
		iw,
		ih,
	});
}

export function newQr(doc: Design): Element {
	const size = 300;
	return made({
		id: newId(doc),
		type: "qr",
		x: CARD_W - size - 60,
		y: cardHeight(doc.format) - size - 60,
		w: size,
		h: size,
		show: "paper",
	});
}

export function elementLabel(el: Element): string {
	if (el.name) return el.name;
	switch (el.type) {
		case "text": {
			const s = el.text.replace(/\s+/g, " ").trim();
			return s ? (s.length > 28 ? `${s.slice(0, 28)}…` : s) : "Empty text";
		}
		case "image":
			return "Image";
		case "rect":
			return "Rectangle";
		case "ellipse":
			return "Ellipse";
		case "line":
			return "Line";
		case "sticker":
			return `Sticker: ${el.sticker.replace(/-/g, " ")}`;
		case "qr":
			return "QR code";
	}
}
