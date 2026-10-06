import type { Rendered } from "../brevo";
import { email } from "../render";

type ResetPasswordInput = { name: string; url: string };

/** Better Auth password reset. No list footer: this is not a list email. */
export function resetPasswordEmail(input: ResetPasswordInput): Rendered {
	return email({
		subject: "Reset your password",
		kicker: "Account",
		heading: "Forgot it. Happens.",
		blocks: [
			{
				kind: "text",
				text: `${input.name}, here is your way back in. The link dies in an hour.`,
			},
			{
				kind: "buttons",
				items: [{ label: "Reset my password", href: input.url }],
			},
			{ kind: "pasteLink", url: input.url },
			{
				kind: "muted",
				text: "Didn't ask for this? Ignore it and keep the story to yourself. Your password has not changed.",
			},
		],
	});
}
