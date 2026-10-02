import type { Rendered } from "../brevo";
import { button, escapeHtml, layout, muted } from "../render";

export type VerifyEmailInput = { name: string; url: string };

/** Better Auth email verification. No list footer: this is not a list email. */
export function verifyEmail(input: VerifyEmailInput): Rendered {
	const html = layout({
		title: "Prove you're real",
		kicker: "Account",
		heading: "Prove you're real.",
		bodyHtml: [
			`<p style="margin:0 0 14px; font-size:16px; line-height:1.5;">${escapeHtml(input.name)}, click this so we know the address works. Nothing else to it.</p>`,
			button("Verify my email", input.url),
			muted(
				`If the button is being difficult, paste this into a browser:<br><a href="${escapeHtml(input.url)}" style="color:#B0236C; word-break:break-all;">${escapeHtml(input.url)}</a>`,
			),
			muted("Didn't sign up? Ignore this and nothing happens."),
		].join("\n"),
	});
	const text = [
		`${input.name}, click this so we know the address works. Nothing else to it.`,
		"",
		input.url,
		"",
		"Didn't sign up? Ignore this and nothing happens.",
	].join("\n");
	return { subject: "Prove you're real", html, text };
}
