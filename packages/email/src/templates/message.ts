import type { Rendered } from "../brevo";
import { emailLink } from "../links";
import { email, SITE_LABEL } from "../render";

type MessageInput = {
	subject: string;
	body: string;
	siteUrl: string;
};

/** Whatever an admin typed, sent to the whole list. */
export function messageEmail(input: MessageInput): Rendered {
	return email({
		subject: input.subject,
		kicker: `From ${SITE_LABEL}`,
		heading: input.subject,
		list: true,
		blocks: [
			{ kind: "typed", text: input.body },
			{
				kind: "buttons",
				items: [
					{ label: "Open the site", href: emailLink(input.siteUrl, "/") },
				],
			},
		],
	});
}
