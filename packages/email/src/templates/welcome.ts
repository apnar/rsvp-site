import type { Rendered } from "../brevo";
import { button, escapeHtml, layout, muted } from "../render";

export type WelcomeInput = { name: string | null; url: string };

/**
 * Someone was added to the list. Their link is their key to the site, so
 * this one carries a concrete URL: no placeholders, no list footer.
 */
export function welcomeEmail(input: WelcomeInput): Rendered {
	const greeting = input.name ? `${input.name}, you` : "You";
	const html = layout({
		title: "You're on the list",
		kicker: "You're in",
		heading: "You're on the list.",
		bodyHtml: [
			`<p style="margin:0 0 14px; font-size:16px; line-height:1.5;">${escapeHtml(greeting)} are on the guest list. The evening before an event you get one email asking if you are in, out or maybe. Answer it and the rest sorts itself out.</p>`,
			button("Open the site", input.url),
			muted(
				`Or paste this into a browser:<br><a href="${escapeHtml(input.url)}" style="color:#2f5f86; word-break:break-all;">${escapeHtml(input.url)}</a>`,
			),
			muted(
				"That link is your key: it signs you in, every time, no password. Which also means don't forward it unless you want somebody else on the sheet under your name.",
			),
			muted(
				"Want a password instead? Set one on the dashboard. The links keep working either way.",
			),
		].join("\n"),
	});
	const text = [
		`${greeting} are on the guest list. The evening before an event you get one email asking if you are in, out or maybe. Answer it and the rest sorts itself out.`,
		"",
		input.url,
		"",
		"That link is your key: it signs you in, every time, no password. Which also means don't forward it unless you want somebody else on the sheet under your name.",
		"",
		"Want a password instead? Set one on the dashboard. The links keep working either way.",
	].join("\n");
	return { subject: "You're on the list.", html, text };
}
