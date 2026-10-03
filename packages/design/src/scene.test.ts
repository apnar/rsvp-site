import { describe, expect, it } from "vitest";
import { facesOf, loadFaces } from "./faces";
import { linearEnds } from "./paint";
import { confetti } from "./patterns";
import { SAMPLE_VALUES } from "./placeholders";
import { dashOf, glyphsOf, layoutCard, placeImage } from "./scene";
import { fromTemplate, TEMPLATES } from "./templates/index";

const afterDark = TEMPLATES[0];
if (!afterDark) throw new Error("no templates");
const design = fromTemplate(afterDark, { cover: null, paper: true });

describe("layoutCard", async () => {
	const faces = await loadFaces(facesOf(design));

	it("keeps the QR code and the guest's name for paper, as per-guest nodes", () => {
		const scene = layoutCard(design, {
			values: SAMPLE_VALUES,
			mode: "paper",
			faces,
		});
		const qr = scene.nodes.find((n) => n.k === "qr");
		const greeting = scene.nodes.find((n) => n.id === "greeting");
		expect(qr?.dynamic).toBe(true);
		expect(greeting?.dynamic).toBe(true);
		expect(scene.nodes.find((n) => n.id === "title")?.dynamic).toBe(false);
	});

	it("leaves print-only things off the page", () => {
		const scene = layoutCard(design, {
			values: SAMPLE_VALUES,
			mode: "web",
			faces,
		});
		const ids = scene.nodes.map((n) => n.id);
		expect(ids).not.toContain("qr");
		expect(ids).not.toContain("scan");
		expect(ids).toContain("greeting");
	});

	it("leaves the guest's name out of the shared image", () => {
		const scene = layoutCard(design, {
			values: SAMPLE_VALUES,
			mode: "image",
			faces,
		});
		expect(scene.nodes.map((n) => n.id)).not.toContain("greeting");
	});

	it("treats {first name} like {guest}: per card on paper, off the shared image", () => {
		const first = {
			...design,
			elements: design.elements.map((el) =>
				el.type === "text" && el.id === "greeting"
					? { ...el, text: "Hi {first name}" }
					: el,
			),
		};
		const paper = layoutCard(first, {
			values: SAMPLE_VALUES,
			mode: "paper",
			faces,
		});
		expect(paper.nodes.find((n) => n.id === "greeting")?.dynamic).toBe(true);
		const image = layoutCard(first, {
			values: SAMPLE_VALUES,
			mode: "image",
			faces,
		});
		expect(image.nodes.map((n) => n.id)).not.toContain("greeting");
	});

	it("reaches into the bleed only on paper that asks for it", () => {
		const web = layoutCard(design, {
			values: SAMPLE_VALUES,
			mode: "web",
			faces,
			bleed: true,
		});
		const print = layoutCard(design, {
			values: SAMPLE_VALUES,
			mode: "paper",
			faces,
			bleed: true,
		});
		expect(web.area).toEqual({ x: 0, y: 0, w: 1000, h: 1400 });
		// The band sits flush with the top and sides, so it runs into the bleed.
		const band = print.nodes.find((n) => n.id === "band");
		expect(band?.box.x).toBeCloseTo(-25);
		expect(band?.box.w).toBeCloseTo(1050);
		expect(band?.box.y).toBeCloseTo(-25);
		expect(web.nodes.find((n) => n.id === "band")?.box.x).toBe(0);
		expect(print.area.x).toBeCloseTo(-25);
		expect(print.area.w).toBeCloseTo(1050);
	});

	it("fills placeholders and lays the title out the same way every time", () => {
		const a = layoutCard(design, { values: SAMPLE_VALUES, mode: "web", faces });
		const b = layoutCard(design, { values: SAMPLE_VALUES, mode: "web", faces });
		const title = a.nodes.find((n) => n.id === "title");
		if (title?.k !== "text") throw new Error("no title");
		expect(title.content).toBe("Ava turns nine");
		expect(title.lines.map((l) => l.chars.join(""))).toMatchSnapshot();
		expect(a).toEqual(b);
	});
});

describe("placeImage", () => {
	it("covers the box and centres on the focal point", () => {
		const p = placeImage("r", 2000, 1000, 0.5, 0.5, 1, 100, 100);
		expect(p.src).toEqual({ x: 500, y: 0, w: 1000, h: 1000 });
		expect(p.img).toEqual({ x: -50, y: -0, w: 200, h: 100 });
	});

	it("never crops past the image's edge", () => {
		const p = placeImage("r", 2000, 1000, 0, 0.5, 1, 100, 100);
		expect(p.src.x).toBe(0);
	});
});

describe("geometry", () => {
	it("runs a 90° gradient across and a 0° one up", () => {
		const across = linearEnds(90, 1000, 1400);
		expect(across.x1).toBeCloseTo(0);
		expect(across.x2).toBeCloseTo(1000);
		expect(across.y1).toBeCloseTo(700);
		const up = linearEnds(0, 1000, 1400);
		expect(up.y1).toBeCloseTo(1400);
		expect(up.y2).toBeCloseTo(0);
	});

	it("scatters the same confetti for the same seed", () => {
		const spec = {
			pattern: "confetti" as const,
			color: "#ffffff",
			colors: ["#ff0000", "#00ff00"],
			scale: 1,
			angle: 0,
			seed: 7,
		};
		expect(confetti(spec, 1000, 1400)).toEqual(confetti(spec, 1000, 1400));
		expect(confetti({ ...spec, seed: 8 }, 1000, 1400)).not.toEqual(
			confetti(spec, 1000, 1400),
		);
	});
});

describe("glyphsOf", async () => {
	const faces = await loadFaces(facesOf(design));
	const scene = layoutCard(design, {
		values: SAMPLE_VALUES,
		mode: "web",
		faces,
	});
	const title = scene.nodes.find((n) => n.id === "title");
	if (title?.k !== "text") throw new Error("no title");

	it("leaves out spaces and keeps each glyph's own x and baseline", () => {
		const { lines } = glyphsOf(title);
		const drawn = lines.map((l) => l.map((g) => g.c).join(""));
		const written = title.lines.map((l) =>
			l.chars.join("").replaceAll(" ", ""),
		);
		expect(drawn).toEqual(written.filter(Boolean));
		for (const line of lines) {
			expect(new Set(line.map((g) => g.y)).size).toBe(1);
			expect(line.map((g) => g.x)).toEqual(
				[...line.map((g) => g.x)].sort((a, b) => a - b),
			);
		}
	});

	it("draws the shadow first, under the text", () => {
		expect(glyphsOf(title).passes).toEqual([
			{ dx: 0, dy: 0, color: title.color },
		]);
		const shadowed = { ...title, shadow: { color: "#000000", dx: 2, dy: 3 } };
		expect(glyphsOf(shadowed).passes).toEqual([
			{ color: "#000000", dx: 2, dy: 3 },
			{ dx: 0, dy: 0, color: title.color },
		]);
	});
});

describe("dashOf", () => {
	it("scales the pattern with the stroke, and is null when solid", () => {
		expect(dashOf({ dash: true, sw: 4 })).toEqual([12, 8]);
		expect(dashOf({ dash: false, sw: 4 })).toBeNull();
	});
});

describe("layoutCard with a text cache", async () => {
	const faces = await loadFaces(facesOf(design));
	const opts = { values: SAMPLE_VALUES, mode: "paper", faces } as const;

	it("draws exactly what it draws without one, however the card is edited", () => {
		const textCache = new Map();
		const moved = {
			...design,
			elements: design.elements.map((el, i) =>
				i % 2 ? { ...el, x: el.x + 7, rot: 3 } : { ...el, w: el.w + 20 },
			),
		};
		for (const d of [design, moved, design]) {
			expect(layoutCard(d, { ...opts, textCache })).toEqual(
				layoutCard(d, opts),
			);
		}
	});

	it("reuses a text's lines while only its place changes", () => {
		const textCache = new Map();
		const first = layoutCard(design, { ...opts, textCache });
		const text = design.elements.find((el) => el.type === "text");
		if (!text) throw new Error("no text");
		const shifted = {
			...design,
			elements: design.elements.map((el) =>
				el.id === text.id ? { ...el, x: el.x + 5, y: el.y + 5 } : el,
			),
		};
		const second = layoutCard(shifted, { ...opts, textCache });
		const a = first.nodes.find((n) => n.id === text.id);
		const b = second.nodes.find((n) => n.id === text.id);
		if (a?.k !== "text" || b?.k !== "text") throw new Error("not text");
		expect(b.lines).toBe(a.lines);
	});
});
