import { describe, expect, it } from "vitest";
import { facesOf, loadFaces } from "./faces";
import { SAMPLE_VALUES } from "./placeholders";
import { design } from "./schema";
import { fromTemplate, TEMPLATES } from "./templates/index";
import { warningsOf } from "./warnings";

const first = TEMPLATES[0];
if (!first) throw new Error("no templates");
const base = fromTemplate(first, { cover: null, paper: true });

describe("warningsOf", async () => {
	const faces = await loadFaces(facesOf(base));
	const opts = { paper: true, shareLink: false, faces, values: SAMPLE_VALUES };

	it("has nothing to say about any template as it comes", async () => {
		const cover = {
			ref: "designs/0b4f7a52-6a3e-4d4b-9a51-2f5e8f1c9d10/5d1c6e0a-3b7f-4c2e-8f9a-1b2c3d4e5f60.jpg",
			iw: 1600,
			ih: 1000,
		};
		for (const t of TEMPLATES) {
			for (const paper of [true, false]) {
				for (const c of [null, cover]) {
					const d = fromTemplate(t, { cover: c, paper });
					const all = await loadFaces(facesOf(d));
					expect(
						warningsOf(d, { ...opts, paper, faces: all }),
						`${t.id} ${paper} ${!!c}`,
					).toEqual([]);
				}
			}
		}
	});

	it("blocks a paper card without a QR code", () => {
		const d = {
			...base,
			elements: base.elements.filter((e) => e.type !== "qr"),
		};
		expect(warningsOf(d, opts).some((w) => w.level === "block")).toBe(true);
		expect(warningsOf(d, { ...opts, paper: false })).toEqual([]);
	});

	it("names characters the font can't print", async () => {
		const d = design.parse({
			...base,
			elements: [
				{
					id: "t",
					type: "text",
					x: 10,
					y: 10,
					w: 300,
					h: 50,
					text: "Party 🎉",
					font: "unbounded",
					size: 30,
					color: "#000000",
				},
			],
		});
		const w = warningsOf(d, {
			...opts,
			paper: false,
			faces: await loadFaces(facesOf(d)),
		});
		expect(w[0]?.message).toContain("🎉");
	});

	it("warns that a public card shows the address", () => {
		const w = warningsOf(base, { ...opts, shareLink: true });
		expect(w.some((x) => x.id === "wherev")).toBe(true);
	});

	it("notices an element off the card and text in the trim zone", () => {
		const d = design.parse({
			...base,
			bleed: true,
			elements: [
				...base.elements,
				{
					id: "gone",
					type: "rect",
					x: 1200,
					y: 10,
					w: 50,
					h: 50,
					fill: "#000000",
				},
				{
					id: "edge",
					type: "text",
					x: 2,
					y: 400,
					w: 300,
					h: 50,
					text: "Hi",
					font: "manrope",
					size: 30,
					color: "#000000",
				},
			],
		});
		const ids = warningsOf(d, opts).map((w) => w.id);
		expect(ids).toContain("gone");
		expect(ids).toContain("edge");
	});
});
