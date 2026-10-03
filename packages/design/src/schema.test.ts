import { describe, expect, it } from "vitest";
import { parseDesign, refsBelongTo } from "./schema";
import { fromTemplate, TEMPLATES } from "./templates/index";

const EVENT = "0b4f7a52-6a3e-4d4b-9a51-2f5e8f1c9d10";
const IMG = `designs/${EVENT}/5d1c6e0a-3b7f-4c2e-8f9a-1b2c3d4e5f60.jpg`;

function doc(elements: unknown[], extra: Record<string, unknown> = {}) {
	return {
		v: 1,
		format: "5x7",
		background: { kind: "solid", color: "#FFFFFF" },
		theme: {
			bg: "#14101f",
			panel: "#1f1930",
			text: "#f5f0ff",
			accent: "#c6ff3d",
			accent2: "#ff4fa3",
			headingFont: "unbounded",
			bodyFont: "manrope",
		},
		elements,
		...extra,
	};
}

const text = (over: Record<string, unknown> = {}) => ({
	id: "t1",
	type: "text",
	x: 0,
	y: 0,
	w: 500,
	h: 100,
	text: "Hello",
	font: "fraunces",
	size: 40,
	color: "#000000",
	...over,
});

describe("parseDesign", () => {
	it("accepts every template, paper or not, with or without a cover", () => {
		for (const t of TEMPLATES) {
			for (const paper of [true, false]) {
				for (const cover of [null, { ref: IMG, iw: 1600, ih: 1000 }]) {
					const d = fromTemplate(t, { cover, paper });
					expect(parseDesign(d).ok).toBe(true);
				}
			}
		}
	});

	it("fills defaults and lowercases colours", () => {
		const r = parseDesign(doc([text()]));
		if (!r.ok) throw new Error(r.message);
		expect(r.design.background).toEqual({ kind: "solid", color: "#ffffff" });
		expect(r.design.elements[0]).toMatchObject({
			rot: 0,
			opacity: 1,
			show: "all",
		});
	});

	it.each([
		["a colour that isn't hex", [text({ color: "red" })]],
		["CSS smuggled into a colour", [text({ color: "#000000;}body{" })]],
		["an unknown font", [text({ font: "comic-sans" })]],
		["a weight the font lacks", [text({ font: "anton", weight: 700 })]],
		["NaN", [text({ x: Number.NaN })]],
		["Infinity", [text({ w: Number.POSITIVE_INFINITY })]],
		["a duplicate id", [text(), text()]],
		["an id that could break an SVG id", [text({ id: "a b" })]],
		[
			"a non-square QR",
			[{ id: "q", type: "qr", x: 0, y: 0, w: 100, h: 120, show: "paper" }],
		],
		[
			"a QR shown on screen",
			[{ id: "q", type: "qr", x: 0, y: 0, w: 100, h: 100 }],
		],
		[
			"an image that isn't an upload",
			[
				{
					id: "i",
					type: "image",
					x: 0,
					y: 0,
					w: 1,
					h: 1,
					ref: "https://evil.example/x.jpg",
					iw: 1,
					ih: 1,
				},
			],
		],
		[
			"a path in an image ref",
			[
				{
					id: "i",
					type: "image",
					x: 0,
					y: 0,
					w: 1,
					h: 1,
					ref: `designs/${EVENT}/../x.jpg`,
					iw: 1,
					ih: 1,
				},
			],
		],
	])("rejects %s", (_, elements) => {
		expect(parseDesign(doc(elements)).ok).toBe(false);
	});

	it("rejects more than 80 elements", () => {
		const many = Array.from({ length: 81 }, (_, i) => text({ id: `t${i}` }));
		expect(parseDesign(doc(many)).ok).toBe(false);
	});

	it("rejects a document over the size limit", () => {
		const r = parseDesign(doc([text()], { padding: "x".repeat(70_000) }));
		expect(r.ok).toBe(false);
	});
});

describe("refsBelongTo", () => {
	const image = (ref: string) => ({
		id: "i",
		type: "image",
		x: 0,
		y: 0,
		w: 1,
		h: 1,
		ref,
		iw: 1,
		ih: 1,
	});

	it("accepts this event's uploads and refuses another event's", () => {
		const mine = parseDesign(doc([image(IMG)]));
		const theirs = parseDesign(
			doc([
				image(
					"designs/11111111-2222-3333-4444-555555555555/5d1c6e0a-3b7f-4c2e-8f9a-1b2c3d4e5f60.jpg",
				),
			]),
		);
		if (!mine.ok || !theirs.ok) throw new Error("parse");
		expect(refsBelongTo(mine.design, EVENT)).toBe(true);
		expect(refsBelongTo(theirs.design, EVENT)).toBe(false);
	});
});
