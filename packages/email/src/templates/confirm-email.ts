import type { Rendered } from "../brevo";
import { email, SITE_LABEL } from "../render";

type ConfirmEmailInput = { url: string };

/**
 * Somebody answering an invitation gave this address. It would become
 * their way in -- every email after it signs its reader in as them -- so
 * it is added only when this inbox's owner presses the button the link
 * leads to. Nobody's name is in it: if the address was a typo, its owner
 * learns nothing about the person who made it.
 */
export function confirmEmailEmail(input: ConfirmEmailInput): Rendered {
	return email({
		subject: `Confirm your address for ${SITE_LABEL}`,
		kicker: "One more thing",
		heading: "Is this you?",
		blocks: [
			{
				kind: "text",
				text: `Somebody answering an invitation on ${SITE_LABEL} asked for their invitations to come to this address. If that was you, confirm it.`,
			},
			{
				kind: "buttons",
				items: [{ label: "Yes, that's me", href: input.url }],
			},
			{ kind: "pasteLink", url: input.url },
			{
				kind: "muted",
				text: "Not you? Ignore this and nothing changes. The link works for three days.",
			},
		],
	});
}
