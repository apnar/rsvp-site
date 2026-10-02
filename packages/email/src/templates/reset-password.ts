import type { Rendered } from "../brevo";
import { button, escapeHtml, layout, muted } from "../render";

export type ResetPasswordInput = { name: string; url: string };

/** Better Auth password reset. No list footer: this is not a list email. */
export function resetPasswordEmail(input: ResetPasswordInput): Rendered {
	const html = layout({
		title: "Reset your password",
		kicker: "Account",
		heading: "Forgot it. Happens.",
		bodyHtml: [
			`<p style="margin:0 0 14px; font-size:16px; line-height:1.5;">${escapeHtml(input.name)}, here is your way back in. The link dies in an hour.</p>`,
			button("Reset my password", input.url),
			muted(
				`Or paste this into a browser:<br><a href="${escapeHtml(input.url)}" style="color:#2f5f86; word-break:break-all;">${escapeHtml(input.url)}</a>`,
			),
			muted(
				"Didn't ask for this? Ignore it and keep the story to yourself. Your password has not changed.",
			),
		].join("\n"),
	});
	const text = [
		`${input.name}, here is your way back in. The link dies in an hour.`,
		"",
		input.url,
		"",
		"Didn't ask for this? Ignore it and keep the story to yourself. Your password has not changed.",
	].join("\n");
	return { subject: "Reset your password", html, text };
}
