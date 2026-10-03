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

const ALLOWED = new Set<string>(Object.values(PARAM));
const TEMPLATE_TAG = /\{\{ params\.\w+ \}\}|\{[{%#]/g;

/**
 * Brevo runs its template language over the subject and both bodies, so a
 * title or a guest's note containing "{{" or "{%" would be read as code: at
 * best garbled, at worst a template error that fails the whole batch. Only
 * the placeholders this package writes may open a tag; any other brace that
 * would is written so the engine doesn't see one (an entity in HTML, a space
 * in plain text and the subject).
 */
export function guardTemplateSyntax(value: string, html: boolean): string {
	return value.replace(TEMPLATE_TAG, (tag) =>
		ALLOWED.has(tag) ? tag : `${html ? "&#123;" : "{ "}${tag.slice(1)}`,
	);
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
export type Palette = {
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

export const AFTER_DARK: Palette = {
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
export function paletteOf(look?: EmailLook | null): Palette {
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
export function para(text: string): string {
	return paraHtml(escapeHtml(text));
}

/** A paragraph of HTML the caller has already made safe. */
export function paraHtml(html: string): string {
	return `<p style="${styles.p}">${html}</p>`;
}

/** Escaped paragraphs from a block of plain text (blank line = new paragraph). */
export function paragraphs(text: string): string {
	return text
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter(Boolean)
		.map((block) => para(block).replaceAll("\n", "<br>"))
		.join("\n");
}

/** A small label/value table, escaped. */
export function factsTable(facts: Fact[], pal: Palette = AFTER_DARK): string {
	const rows = facts
		.map(
			(f) =>
				`<tr><td style="${factLabel(pal)}">${escapeHtml(f.label)}</td><td style="${styles.factValue}">${escapeHtml(f.value)}</td></tr>`,
		)
		.join("");
	return `<table role="presentation" style="${styles.facts}">${rows}</table>`;
}

export type ButtonTone = "lime" | "pink" | "outline";

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

/** A call-to-action link styled as a button. `href` must already be safe. */
export function button(
	label: string,
	href: string,
	tone: ButtonTone = "lime",
	pal: Palette = AFTER_DARK,
): string {
	return `<p style="${styles.buttonRow}">${buttonLink(label, href, tone, pal)}</p>`;
}

/** Several buttons on one line, wrapping on a phone. */
export function buttons(
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
export function pasteLink(url: string, pal: Palette = AFTER_DARK): string {
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
export function listFooter(pal: Palette = AFTER_DARK): string {
	return `<p style="${footerStyle(pal)}">You got this because you're on ${escapeHtml(SITE_LABEL)}. Links in this email sign you in, so don't forward it. Rather not get these? <a href="${PARAM.unsubscribeUrl}" style="color:${pal.link};">Unsubscribe</a>.</p>`;
}

export function listFooterText(): string {
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
