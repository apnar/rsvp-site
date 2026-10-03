import type { Rendered } from "../brevo";
import { button, layout, muted, para, pasteLink } from "../render";

export type ResetPasswordInput = { name: string; url: string };

/** Better Auth password reset. No list footer: this is not a list email. */
export function resetPasswordEmail(input: ResetPasswordInput): Rendered {
	const html = layout({
		title: "Reset your password",
		kicker: "Account",
		heading: "Forgot it. Happens.",
		bodyHtml: [
			para(
				`${input.name}, here is your way back in. The link dies in an hour.`,
			),
			button("Reset my password", input.url),
			pasteLink(input.url),
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
