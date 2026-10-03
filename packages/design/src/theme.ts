/**
 * The guest page around a designed card. A theme is five colours and two
 * fonts; every After Dark token is derived from them here, in TypeScript,
 * so the page, the emails and the card image share one answer and no
 * browser needs color-mix to get it.
 */
import { FONTS, fallbackStack, fontStack } from "./fonts";
import { mix, rgb } from "./paint";
import type { DesignTheme } from "./schema";

const DARK = "#14101f";
const WHITE = "#ffffff";

/** WCAG relative luminance. */
export function luminance(hex: string): number {
	const [r, g, b] = rgb(hex).map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Dark or white, whichever reads better on a fill. */
export function onColor(fill: string): string {
	return contrast(fill, DARK) >= contrast(fill, WHITE) ? DARK : WHITE;
}

/**
 * A colour used as text on a ground: itself if it reads, otherwise
 * stepped toward `toward` until it does (WCAG AA for body text).
 */
export function readable(
	color: string,
	ground: string,
	toward: string,
): string {
	for (let t = 0; t <= 1.0001; t += 0.1) {
		const c = mix(color, toward, t);
		if (contrast(c, ground) >= 4.5) return c;
	}
	return toward;
}

export function isLight(hex: string): boolean {
	return luminance(hex) > 0.4;
}

/** The After Dark tokens (globals.css), as this theme sets them. */
export function themeTokens(t: DesignTheme): Record<string, string> {
	return {
		"--color-night": t.bg,
		"--color-panel": t.panel,
		"--color-panel-2": mix(t.panel, t.text, 0.08),
		"--color-panel-dim": mix(t.panel, t.bg, 0.5),
		"--color-line": mix(t.panel, t.text, 0.14),
		"--color-line-strong": mix(t.panel, t.text, 0.24),
		"--color-ink": t.text,
		"--color-soft": mix(t.text, t.bg, 0.15),
		"--color-haze": readable(mix(t.text, t.bg, 0.32), t.bg, t.text),
		"--color-lime": t.accent,
		"--color-lime-soft": mix(t.accent, t.text, 0.3),
		"--color-pink": t.accent2,
		"--color-pink-soft": mix(t.accent2, t.text, 0.3),
		"--color-on-lime": onColor(t.accent),
		"--color-on-pink": onColor(t.accent2),
		"--color-lime-ink": readable(t.accent, t.panel, t.text),
		"--color-pink-ink": readable(t.accent2, t.panel, t.text),
		"--page-scheme": isLight(t.bg) ? "light" : "dark",
		"--font-heading": fontStack(t.headingFont),
		"--font-sans": fontStack(t.bodyFont),
	};
}

/**
 * A :root rule overriding the tokens. Only parsed values go in (hex
 * colours and registry font names), which is why this may be put
 * straight into a <style>.
 */
export function themeCss(t: DesignTheme): string {
	const body = Object.entries(themeTokens(t))
		.map(([k, v]) => `${k}:${v}`)
		.join(";");
	return `:root{${body}}`;
}

export const AFTER_DARK_THEME: DesignTheme = {
	bg: "#14101f",
	panel: "#1f1930",
	text: "#f5f0ff",
	accent: "#c6ff3d",
	accent2: "#ff4fa3",
	headingFont: "unbounded",
	bodyFont: "manrope",
};

/** What packages/email's EmailLook needs (that package stays independent). */
export type DesignEmailLook = {
	cardUrl: string | null;
	cardAlt: string;
	band: string;
	ground: string;
	text: string;
	accent: string;
	onAccent: string;
	link: string;
	headingStack: string;
};

/**
 * Email keeps a light body, because mail clients' dark modes mangle a
 * dark one; the design shows through the card, the ground and the buttons.
 */
export function emailLook(
	t: DesignTheme,
	cardUrl: string | null,
	cardAlt: string,
): DesignEmailLook {
	const accent = t.accent;
	return {
		cardUrl,
		cardAlt,
		band: t.bg,
		ground: mix(t.bg, WHITE, isLight(t.bg) ? 0.3 : 0.88),
		text: isLight(t.text) ? "#1f1930" : t.text,
		accent,
		onAccent: onColor(accent),
		link: readable(t.accent2, WHITE, "#000000"),
		headingStack: `"${FONTS[t.headingFont].label}", ${fallbackStack(t.headingFont)}`,
	};
}
