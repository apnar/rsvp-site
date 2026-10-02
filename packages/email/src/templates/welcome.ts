import type { Rendered } from "../brevo";
import { button, escapeHtml, layout, muted } from "../render";

export type WelcomeInput = { name: string | null; url: string };

/**
 * Someone has an account now, or asked for their link again. Their link is their key to the site, so
 * this one carries a concrete URL: no placeholders, no list footer.
 */
export function welcomeEmail(input: WelcomeInput): Rendered {
	const greeting = input.name ? `${input.name}, you` : "You";
	const html = layout({
		title: "Welcome to Botch RSVP",
		kicker: "Welcome",
		heading: "Your way in.",
		bodyHtml: [
			`<p style="margin:0 0 14px; font-size:16px; line-height:1.5;">${escapeHtml(greeting)} have an account on Botch RSVP. When a host invites you, the invitation lands here with one-tap answers, and every invite you have is on the site.</p>`,
			button("Open the site", input.url),
			muted(
				`Or paste this into a browser:<br><a href="${escapeHtml(input.url)}" style="color:#B0236C; word-break:break-all;">${escapeHtml(input.url)}</a>`,
			),
			muted(
				"That link is your key: it signs you in, every time, no password. Which also means don't forward it unless you want somebody else answering as you.",
			),
			muted(
				"Want a password instead? Set one on your account page. The links keep working either way.",
			),
		].join("\n"),
	});
	const text = [
		`${greeting} have an account on Botch RSVP. When a host invites you, the invitation lands here with one-tap answers, and every invite you have is on the site.`,
		"",
		input.url,
		"",
		"That link is your key: it signs you in, every time, no password. Which also means don't forward it unless you want somebody else answering as you.",
		"",
		"Want a password instead? Set one on your account page. The links keep working either way.",
	].join("\n");
	return { subject: "Your Botch RSVP link", html, text };
}
