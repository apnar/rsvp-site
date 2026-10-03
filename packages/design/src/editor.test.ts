import { describe, expect, it } from "vitest";
import {
	alignEls,
	COALESCE_MS,
	cloneEls,
	duplicateEls,
	type EditorState,
	initialState,
	newId,
	newImage,
	newQr,
	newShape,
	newText,
	patchEl,
	reducer,
	removeEls,
	removeUnlocked,
	reshape,
	restack,
	switchBackground,
} from "./editor";
import { type Design, design, type Element } from "./schema";
import { AFTER_DARK_THEME } from "./theme";

function el(id: string, over: Record<string, unknown> = {}): Element {
	return design.parse({
		v: 1,
		format: "square",
		background: { kind: "solid", color: "#ffffff" },
		theme: AFTER_DARK_THEME,
		elements: [
			{
				id,
				type: "rect",
				x: 0,
				y: 0,
				w: 100,
				h: 100,
				fill: "#000000",
				...over,
			},
		],
	}).elements[0] as Element;
}

function docOf(...els: Element[]): Design {
	return design.parse({
		v: 1,
		format: "square",
		background: { kind: "solid", color: "#ffffff" },
		theme: AFTER_DARK_THEME,
		elements: els,
	});
}

const REF =
	"designs/0b4f7a52-6a3e-4d4b-9a51-2f5e8f1c9d10/5d1c6e0a-3b7f-4c2e-8f9a-1b2c3d4e5f60.jpg";

/** A fixed sequence, so ids are the same on every run. */
function seq() {
	let n = 0;
	return () => (++n * 0.1234567) % 1;
}

describe("reducer: history", () => {
	const a = docOf(el("a"));
	const b = patchEl(a, "a", { x: 10 });
	const c = patchEl(b, "a", { x: 20 });

	it("makes one undo step per edit, and clears redo", () => {
		let s = initialState(a);
		s = reducer(s, { t: "set", doc: b, at: 0 });
		s = reducer(s, { t: "set", doc: c, at: 5000 });
		expect(s.past).toEqual([a, b]);
		s = reducer(s, { t: "undo" });
		expect(s.doc).toBe(b);
		expect(s.future).toEqual([c]);
		s = reducer(s, { t: "set", doc: a, at: 9000 });
		expect(s.future).toEqual([]);
	});

	it("coalesces edits with one key inside the window, and only those", () => {
		let s = initialState(a);
		s = reducer(s, { t: "set", doc: b, key: "x", at: 1000 });
		s = reducer(s, { t: "set", doc: c, key: "x", at: 1000 + COALESCE_MS - 1 });
		expect(s.past).toEqual([a]);
		s = reducer(s, { t: "set", doc: a, key: "x", at: 1000 + 3 * COALESCE_MS });
		expect(s.past).toHaveLength(2);
		s = reducer(s, {
			t: "set",
			doc: b,
			key: "y",
			at: 1000 + 3 * COALESCE_MS + 1,
		});
		expect(s.past).toHaveLength(3);
	});

	it("never coalesces edits without a key", () => {
		let s = initialState(a);
		s = reducer(s, { t: "set", doc: b, at: 1 });
		s = reducer(s, { t: "set", doc: c, at: 2 });
		expect(s.past).toHaveLength(2);
	});

	it("shows a drag live and commits it as one step back to where it began", () => {
		let s = initialState(a);
		s = reducer(s, { t: "live", doc: b });
		s = reducer(s, { t: "live", doc: c });
		expect(s.past).toEqual([]);
		s = reducer(s, { t: "commit", before: a });
		expect(s.past).toEqual([a]);
		expect(reducer(s, { t: "undo" }).doc).toBe(a);
	});

	it("ignores a commit when nothing moved", () => {
		const s = initialState(a);
		expect(reducer(s, { t: "commit", before: a })).toBe(s);
	});

	it("keeps 100 steps", () => {
		let s = initialState(a);
		for (let i = 0; i < 130; i++) {
			s = reducer(s, {
				t: "set",
				doc: patchEl(a, "a", { x: i }),
				at: i * 1000,
			});
		}
		expect(s.past).toHaveLength(100);
	});

	it("redoes what was undone", () => {
		let s: EditorState = initialState(a);
		s = reducer(s, { t: "set", doc: b, at: 0 });
		s = reducer(reducer(s, { t: "undo" }), { t: "redo" });
		expect(s.doc).toBe(b);
		expect(s.future).toEqual([]);
	});

	it("does nothing to undo or redo with nothing there", () => {
		const s = initialState(a);
		expect(reducer(s, { t: "undo" })).toBe(s);
		expect(reducer(s, { t: "redo" })).toBe(s);
	});

	it("answers the same for the same actions (no clock inside)", () => {
		const run = () =>
			reducer(initialState(a), { t: "set", doc: b, key: "k", at: 42 });
		expect(run()).toEqual(run());
	});
});

describe("reducer: selection", () => {
	it("selects only elements that exist", () => {
		const s = reducer(initialState(docOf(el("a"), el("b"))), {
			t: "select",
			ids: ["a", "gone"],
		});
		expect(s.selected).toEqual(["a"]);
	});

	it("drops a selection the edit, undo or redo removed", () => {
		const two = docOf(el("a"), el("b"));
		let s = reducer(initialState(two), { t: "select", ids: ["a", "b"] });
		s = reducer(s, { t: "set", doc: removeEls(two, ["b"]), at: 0 });
		expect(s.selected).toEqual(["a"]);
		s = reducer(s, { t: "undo" });
		expect(s.selected).toEqual(["a"]);
		s = reducer(s, { t: "redo" });
		expect(s.selected).toEqual(["a"]);
	});

	it("starts over on load", () => {
		const s = reducer(initialState(docOf(el("a"))), {
			t: "load",
			doc: docOf(),
		});
		expect(s).toEqual(initialState(docOf()));
	});
});

describe("cloneEls", () => {
	it("gives copies new ids, nudges them and drops their names", () => {
		const doc = docOf(el("a", { name: "Frame", x: 10, y: 20 }));
		const r = cloneEls(doc, doc.elements, seq());
		expect(r.doc.elements).toHaveLength(2);
		const copy = r.doc.elements[1];
		expect(copy?.id).toBe(r.ids[0]);
		expect(copy?.id).not.toBe("a");
		expect(copy).toMatchObject({ x: 34, y: 44 });
		expect(copy?.name).toBeUndefined();
	});

	it("serves a paste from another document the same way", () => {
		const from = docOf(el("a", { name: "Frame" }));
		const into = docOf(el("a"));
		const r = cloneEls(into, from.elements, seq());
		expect(r.ids).toHaveLength(1);
		expect(new Set(r.doc.elements.map((e) => e.id)).size).toBe(2);
		expect(r.doc.elements[1]?.name).toBeUndefined();
	});

	it("is what duplicate does, for the ids given", () => {
		const doc = docOf(el("a"), el("b"));
		const r = duplicateEls(doc, ["b"], seq());
		expect(r.doc.elements.map((e) => e.type)).toHaveLength(3);
		expect(r.ids).toHaveLength(1);
	});
});

describe("newId", () => {
	it("never repeats an id in the document", () => {
		const doc = docOf(el("4fb7r6gr"));
		const draws = ["0.4fb7r6gr", "0.123456789"];
		const id = newId(doc, () => Number(draws.shift()));
		expect(id).not.toBe("4fb7r6gr");
	});
});

describe("removeUnlocked", () => {
	it("deletes the selection except what is locked", () => {
		const doc = docOf(el("a"), el("b", { locked: true }), el("c"));
		expect(removeUnlocked(doc, ["a", "b"]).elements.map((e) => e.id)).toEqual([
			"b",
			"c",
		]);
	});
});

describe("restack", () => {
	const doc = docOf(el("a"), el("b"), el("c"));
	const order = (d: Design) => d.elements.map((e) => e.id).join("");
	it("moves one step or all the way, staying in range", () => {
		expect(order(restack(doc, "a", "up"))).toBe("bac");
		expect(order(restack(doc, "a", "top"))).toBe("bca");
		expect(order(restack(doc, "c", "down"))).toBe("acb");
		expect(order(restack(doc, "c", "bottom"))).toBe("cab");
		expect(order(restack(doc, "c", "up"))).toBe("abc");
		expect(order(restack(doc, "a", "down"))).toBe("abc");
	});
	it("leaves an unknown id alone", () => {
		expect(restack(doc, "zz", "top")).toBe(doc);
	});
});

describe("alignEls", () => {
	const doc = docOf(
		el("a", { x: 100, y: 100, w: 50, h: 50 }),
		el("b", { x: 300, y: 400, w: 100, h: 100 }),
		el("c", { x: 900, y: 900, w: 10, h: 10, locked: true }),
	);
	const at = (d: Design, id: string) => d.elements.find((e) => e.id === id);

	it("lines up to the box around the unlocked ones", () => {
		const left = alignEls(doc, ["a", "b", "c"], "left");
		expect(at(left, "b")?.x).toBe(100);
		expect(at(left, "c")?.x).toBe(900);
		const right = alignEls(doc, ["a", "b"], "right");
		expect(at(right, "a")?.x).toBe(350);
		const bottom = alignEls(doc, ["a", "b"], "bottom");
		expect(at(bottom, "a")?.y).toBe(450);
	});

	it("centres on the middle of the group", () => {
		const centre = alignEls(doc, ["a", "b"], "centre");
		expect(at(centre, "a")?.x).toBe(225);
		expect(at(centre, "b")?.x).toBe(200);
		const middle = alignEls(doc, ["a", "b"], "middle");
		expect(at(middle, "a")?.y).toBe(275);
	});

	it("uses a turned element's upright bounds, as the card shows it", () => {
		const turned = docOf(
			el("a", { x: 0, y: 0, w: 200, h: 100, rot: 90 }),
			el("b", { x: 500, y: 500, w: 10, h: 10 }),
		);
		// Turned a quarter, a 200x100 box at the origin spans x 50..150.
		const out = alignEls(turned, ["a", "b"], "left");
		expect(at(out, "b")?.x).toBeCloseTo(50);
		expect(at(out, "a")?.x).toBeCloseTo(0);
	});

	it("does nothing when everything is locked", () => {
		expect(alignEls(doc, ["c"], "left")).toBe(doc);
	});
});

describe("reshape", () => {
	it("keeps each element's place relative to the card's height", () => {
		const doc = docOf(el("a", { y: 400, h: 200 }));
		const wide = reshape(doc, "5x7l");
		expect(wide.format).toBe("5x7l");
		// square (1000 high) to 5x7l (714.28 high): the middle stays the middle.
		const a = wide.elements[0];
		expect(((a?.y ?? 0) + 100) / 714.2857).toBeCloseTo(0.5, 3);
	});
	it("returns the same document for the same height", () => {
		const doc = docOf(el("a"));
		expect(reshape(doc, "square")).toBe(doc);
	});
});

describe("switchBackground", () => {
	const doc = docOf();
	it("starts each kind from the colours in play", () => {
		expect(switchBackground(doc, "solid")).toEqual({
			kind: "solid",
			color: "#ffffff",
		});
		const fade = switchBackground(doc, "linear");
		expect(fade).toMatchObject({ kind: "linear" });
		expect(fade?.kind === "linear" && fade.stops[1]?.color).toBe(
			AFTER_DARK_THEME.accent2,
		);
		expect(switchBackground(doc, "pattern")).toMatchObject({
			kind: "pattern",
			color: "#ffffff",
		});
	});
	it("takes the theme's colour when leaving a photo, and has no photo to offer", () => {
		const photo: Design = {
			...doc,
			background: {
				kind: "image",
				ref: "designs/0b4f7a52-6a3e-4d4b-9a51-2f5e8f1c9d10/5d1c6e0a-3b7f-4c2e-8f9a-1b2c3d4e5f60.jpg",
				iw: 10,
				ih: 10,
				fx: 0.5,
				fy: 0.5,
				zoom: 1,
				tint: null,
			},
		};
		expect(switchBackground(photo, "solid")).toEqual({
			kind: "solid",
			color: doc.theme.bg,
		});
		expect(switchBackground(doc, "image")).toBeNull();
	});
});

describe("new elements", () => {
	const doc = docOf();
	it("come out of the schema with its defaults, centred", () => {
		const t = newText(doc);
		expect(t).toMatchObject({ type: "text", opacity: 1, locked: false });
		expect(t.x + t.w / 2).toBeCloseTo(500);
		expect(t.y + t.h / 2).toBeCloseTo(500);
		expect(newShape(doc, "line")).toMatchObject({
			type: "line",
			strokeWidth: 6,
		});
		expect(newShape(doc, "ellipse")).toMatchObject({
			fill: AFTER_DARK_THEME.accent2,
		});
	});
	it("make a text that shows on a light or dark card", () => {
		const dark = newText(doc);
		const light = newText({
			...doc,
			background: { kind: "solid", color: "#101010" },
		});
		expect(dark.type === "text" && dark.color).toBe("#14101f");
		expect(light.type === "text" && light.color).toBe("#ffffff");
	});
	it("fit an image to the card, whatever its shape", () => {
		const img = newImage(doc, REF, 4000, 1000);
		expect(img.w / img.h).toBeCloseTo(4);
		expect(img.w).toBeLessThanOrEqual(700 + 1e-9);
	});
	it("put the QR code at the corner, printed only", () => {
		expect(newQr(doc)).toMatchObject({
			type: "qr",
			show: "paper",
			w: 300,
			h: 300,
		});
	});
});
