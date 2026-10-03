import { describe, expect, it } from "vitest";
import { contrast, onColor, readable, themeCss, themeTokens } from "./theme";

const light = {
	bg: "#fdf6ec",
	panel: "#ffffff",
	text: "#2a2118",
	accent: "#ffd84d",
	accent2: "#e05a8a",
	headingFont: "playfair-display" as const,
	bodyFont: "lora" as const,
};

describe("theme", () => {
	it("puts dark text on a pale accent and white on a deep one", () => {
		expect(onColor("#c6ff3d")).toBe("#14101f");
		expect(onColor("#1d2b6b")).toBe("#ffffff");
	});

	it("steps an accent used as text until it reads on its panel", () => {
		const ink = readable(light.accent, light.panel, light.text);
		expect(contrast(ink, light.panel)).toBeGreaterThanOrEqual(4.5);
		expect(readable("#000000", "#ffffff", "#ffffff")).toBe("#000000");
	});

	it("marks a light page light", () => {
		expect(themeTokens(light)["--page-scheme"]).toBe("light");
	});

	it("writes nothing but hex colours and our own font names", () => {
		const css = themeCss(light);
		const values = css
			.slice(":root{".length, -1)
			.split(";")
			.map((d) => d.split(":")[1]);
		for (const v of values) {
			expect(v).toMatch(
				/^(#[0-9a-f]{6}|light|dark|"rsvpd-[a-z0-9-]+", [^;{}<>]+)$/,
			);
		}
	});
});
