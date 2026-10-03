import { describe, expect, it } from "vitest";
import { hasPrintableQr } from "./qr";
import type { Design } from "./schema";
import { fromTemplate, TEMPLATES } from "./templates/index";

const first = TEMPLATES[0];
if (!first) throw new Error("no templates");
const base = fromTemplate(first, { cover: null, paper: true });

function withQr(patch: Record<string, unknown>): Design {
	const qr = base.elements.find((e) => e.type === "qr");
	if (!qr) throw new Error("template has no qr");
	return {
		...base,
		elements: base.elements.map((e) => (e === qr ? { ...e, ...patch } : e)),
	};
}

describe("hasPrintableQr", () => {
	it("counts a visible code on the card", () => {
		expect(hasPrintableQr(base)).toBe(true);
	});
	it("does not count a hidden or invisible one", () => {
		expect(hasPrintableQr(withQr({ hidden: true }))).toBe(false);
		expect(hasPrintableQr(withQr({ opacity: 0 }))).toBe(false);
	});
	it("does not count one off the card", () => {
		expect(hasPrintableQr(withQr({ x: 100_000 }))).toBe(false);
	});
	it("does not count a card without one", () => {
		const d = {
			...base,
			elements: base.elements.filter((e) => e.type !== "qr"),
		};
		expect(hasPrintableQr(d)).toBe(false);
	});
});
