/**
 * Building blocks for the HTML and text parts of every email. Inline styles
 * only, one column: this has to look right in whatever mail app a phone
 * happens to open.
 *
 * The site is After Dark -- plum night, lime and pink -- but the email body
 * stays light. Gmail and Outlook rewrite dark backgrounds in their own dark
 * modes and the result is unreadable, so the brand lives in the header band
 * and the buttons, and the text sits on white.
 */

import { SENDER } from "./sender";

export function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/**
 * Brevo replaces these in both bodies and headers when the request carries
 * `params` (or per-recipient `messageVersions[].params`). Only list emails
 * use them; never run escapeHtml over the output of this helper.
 */
export const PARAM = {
	name: "{{ params.name }}",
	unsubscribeUrl: "{{ params.unsubscribeUrl }}",
	/** The reader's sign-in token, in every link back to the site. */
	key: "{{ params.key }}",
} as const;

const FONT =
	"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;";

/** After Dark, as far as email allows. */
export const COLORS = {
	night: "#14101F",
	ink: "#1F1930",
	lime: "#C6FF3D",
	pink: "#FF4FA3",
	/** Pink deep enough to read as text on white. */
	pinkText: "#B0236C",
	muted: "#5E5577",
	line: "#E4DEF0",
	ground: "#F3F0F8",
} as const;

const styles = {
	body: `margin:0; padding:0; background:${COLORS.ground}; ${FONT} color:${COLORS.ink};`,
	wrap: "max-width:560px; margin:0 auto; padding:24px 16px;",
	band: `background:${COLORS.night}; padding:18px 24px; border-radius:20px 20px 0 0;`,
	wordmark:
		"margin:0; font-size:18px; font-weight:900; letter-spacing:-0.02em; color:#F5F0FF;",
	cover: "display:block; width:100%; height:auto; border:0;",
	card: `background:#ffffff; padding:28px 24px; border-radius:0 0 20px 20px; border:1px solid ${COLORS.line}; border-top:0;`,
	kicker: `margin:0 0 8px; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; font-weight:700; color:${COLORS.pinkText};`,
	h1: "margin:0 0 16px; font-size:28px; line-height:1.1; font-weight:900; letter-spacing:-0.03em;",
	p: "margin:0 0 14px; font-size:16px; line-height:1.5;",
	facts:
		"margin:0 0 18px; padding:0; border-collapse:collapse; font-size:16px; line-height:1.5;",
	factLabel: `padding:4px 14px 4px 0; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; font-weight:700; color:${COLORS.muted}; vertical-align:baseline; white-space:nowrap;`,
	factValue: "padding:4px 0; font-weight:600; vertical-align:baseline;",
	buttonRow: "margin:22px 0 8px;",
	button: `display:inline-block; margin:0 6px 8px 0; padding:13px 22px; border-radius:999px; background:${COLORS.lime}; color:${COLORS.night} !important; text-decoration:none; font-weight:800; font-size:15px;`,
	buttonPink: `display:inline-block; margin:0 6px 8px 0; padding:13px 22px; border-radius:999px; background:${COLORS.pink}; color:${COLORS.night} !important; text-decoration:none; font-weight:800; font-size:15px;`,
	buttonOutline: `display:inline-block; margin:0 6px 8px 0; padding:12px 21px; border-radius:999px; border:1px solid ${COLORS.ink}; color:${COLORS.ink} !important; text-decoration:none; font-weight:800; font-size:15px;`,
	muted: `color:${COLORS.muted}; font-size:14px; line-height:1.5;`,
	footer: `margin:16px 0 0; padding:0 4px; color:${COLORS.muted}; font-size:12px; line-height:1.5;`,
	link: `color:${COLORS.pinkText};`,
} as const;

export type Fact = { label: string; value: string };

/** Escaped paragraphs from a block of plain text (blank line = new paragraph). */
export function paragraphs(text: string): string {
	return text
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter(Boolean)
		.map(
			(block) =>
				`<p style="${styles.p}">${escapeHtml(block).replaceAll("\n", "<br>")}</p>`,
		)
		.join("\n");
}

/** A small label/value table, escaped. */
export function factsTable(facts: Fact[]): string {
	const rows = facts
		.map(
			(f) =>
				`<tr><td style="${styles.factLabel}">${escapeHtml(f.label)}</td><td style="${styles.factValue}">${escapeHtml(f.value)}</td></tr>`,
		)
		.join("");
	return `<table role="presentation" style="${styles.facts}">${rows}</table>`;
}

export type ButtonTone = "lime" | "pink" | "outline";

function buttonLink(label: string, href: string, tone: ButtonTone): string {
	const style =
		tone === "pink"
			? styles.buttonPink
			: tone === "outline"
				? styles.buttonOutline
				: styles.button;
	return `<a href="${escapeHtml(href)}" style="${style}">${escapeHtml(label)}</a>`;
}

/** A call-to-action link styled as a button. `href` must already be safe. */
export function button(
	label: string,
	href: string,
	tone: ButtonTone = "lime",
): string {
	return `<p style="${styles.buttonRow}">${buttonLink(label, href, tone)}</p>`;
}

/** Several buttons on one line, wrapping on a phone. */
export function buttons(
	items: { label: string; href: string; tone?: ButtonTone }[],
): string {
	return `<p style="${styles.buttonRow}">${items
		.map((b) => buttonLink(b.label, b.href, b.tone ?? "lime"))
		.join(" ")}</p>`;
}

export function muted(html: string): string {
	return `<p style="${styles.p} ${styles.muted}">${html}</p>`;
}

/**
 * Footer for list emails: why they got it, and the way out. The link opens a
 * page with a button rather than acting on the GET, because mail clients
 * fetch links unprompted. Uses raw placeholders.
 */
export function listFooter(): string {
	return `<p style="${styles.footer}">You got this because you're on ${escapeHtml(SITE_LABEL)}. Links in this email sign you in, so don't forward it. Rather not get these? <a href="${PARAM.unsubscribeUrl}" style="${styles.link}">Unsubscribe</a>.</p>`;
}

export function listFooterText(): string {
	return `You got this because you're on ${SITE_LABEL}.\nLinks in this email sign you in, so don't forward it.\nRather not get these? Unsubscribe: ${PARAM.unsubscribeUrl}`;
}

/** How the site names itself in running text. */
export const SITE_LABEL = "Botch RSVP";

export function layout(input: {
	title: string;
	kicker?: string;
	heading: string;
	bodyHtml: string;
	footerHtml?: string;
	/** An absolute, token-free image URL shown full width under the band. */
	coverUrl?: string | null;
}): string {
	const cover = input.coverUrl
		? `<img src="${escapeHtml(input.coverUrl)}" alt="" width="560" style="${styles.cover}">`
		: "";
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="${styles.body}">
<div style="${styles.wrap}">
<div style="${styles.band}"><p style="${styles.wordmark}">botch<span style="color:${COLORS.lime};">&bull;</span>rsvp</p></div>
${cover}
<div style="${styles.card}">
<p style="${styles.kicker}">${escapeHtml(input.kicker ?? SENDER.name)}</p>
<h1 style="${styles.h1}">${escapeHtml(input.heading)}</h1>
${input.bodyHtml}
</div>
${input.footerHtml ?? ""}
</div>
</body>
</html>`;
}
