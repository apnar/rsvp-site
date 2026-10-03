import type { Rendered } from "../brevo";
import { email, SITE_LABEL } from "../render";

const INTRO =
	"When a host invites you, the invitation lands here with one-tap answers, and every invite you have is on the site.";

export type WelcomeInput = { name: string | null; url: string };

/**
 * Someone has an account now, or asked for their link again. Their link is their key to the site, so
 * this one carries a concrete URL: no placeholders, no list footer.
 */
export function welcomeEmail(input: WelcomeInput): Rendered {
	const greeting = input.name ? `${input.name}, you` : "You";
	return email({
		subject: `Your ${SITE_LABEL} link`,
		kicker: "Welcome",
		heading: "Your way in.",
		blocks: [
			{
				kind: "text",
				text: `${greeting} have an account on ${SITE_LABEL}. ${INTRO}`,
			},
			{ kind: "buttons", items: [{ label: "Open the site", href: input.url }] },
			{ kind: "pasteLink", url: input.url },
			{
				kind: "muted",
				text: "That link is your key: it signs you in, every time, no password. Which also means don't forward it unless you want somebody else answering as you.",
			},
			{
				kind: "muted",
				text: "Want a password instead? Set one on your account page. The links keep working either way.",
			},
		],
	});
}
