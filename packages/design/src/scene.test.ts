import { describe, expect, it } from "vitest";
import { facesOf, loadFaces } from "./faces";
import { linearEnds } from "./paint";
import { confetti } from "./patterns";
import { SAMPLE_VALUES } from "./placeholders";
import { layoutCard, placeImage } from "./scene";
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
