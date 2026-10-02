/**
 * Building blocks for the HTML and text parts of every email. Inline styles
 * only, one column, no images: this has to look right in whatever mail app
 * a phone happens to open.
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

const styles = {
	body: `margin:0; padding:0; background:#f4f3ef; ${FONT} color:#1a1a1a;`,
	wrap: "max-width:560px; margin:0 auto; padding:24px 16px;",
	card: "background:#ffffff; border:1px solid #d9d6cc; padding:28px 24px;",
	kicker:
		"margin:0 0 8px; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#4a6d8c;",
	h1: "margin:0 0 16px; font-size:26px; line-height:1.15; font-weight:700; text-transform:uppercase; letter-spacing:0.01em;",
	p: "margin:0 0 14px; font-size:16px; line-height:1.5;",
	facts:
		"margin:0 0 18px; padding:0; border-collapse:collapse; font-size:16px; line-height:1.5;",
	factLabel:
		"padding:4px 12px 4px 0; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#4a6d8c; vertical-align:baseline; white-space:nowrap;",
	factValue: "padding:4px 0; font-weight:600; vertical-align:baseline;",
	button:
		"display:inline-block; padding:12px 20px; background:#2f5f86; color:#ffffff !important; text-decoration:none; font-weight:700; font-size:15px;",
	muted: "color:#5f5f5f; font-size:14px; line-height:1.5;",
	footer:
		"margin:16px 0 0; padding:0 4px; color:#6b6b6b; font-size:12px; line-height:1.5;",
	link: "color:#2f5f86;",
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

/** A call-to-action link styled as a button. `href` must already be safe. */
export function button(label: string, href: string): string {
	return `<p style="margin:20px 0 6px;"><a href="${escapeHtml(href)}" style="${styles.button}">${escapeHtml(label)}</a></p>`;
}

export function muted(html: string): string {
	return `<p style="${styles.p} ${styles.muted}">${html}</p>`;
}

/**
 * Footer for list emails: who this is and how to step away. There is no
 * unsubscribe-and-stay-on-the-list any more -- email is how this group
 * talks, so leaving the email means leaving the events for a while. The
 * link opens a form that asks for how long and why. Uses raw placeholders.
 */
export function listFooter(): string {
	return `<p style="${styles.footer}">You get these because you are on the guest list. Links in this email sign you in, so don't forward it. Away, busy, or just need a pause? <a href="${PARAM.unsubscribeUrl}" style="${styles.link}">Take a break</a> and we will hold your spot.</p>`;
}

export function listFooterText(): string {
	return `You get these because you are on the guest list.\nLinks in this email sign you in, so don't forward it.\nAway, busy, or just need a pause? Take a break: ${PARAM.unsubscribeUrl}`;
}

export function layout(input: {
	title: string;
	kicker?: string;
	heading: string;
	bodyHtml: string;
	footerHtml?: string;
}): string {
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
