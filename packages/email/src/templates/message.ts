import type { Rendered } from "../brevo";
import { emailLink } from "../links";
import {
	button,
	layout,
	listFooter,
	listFooterText,
	paragraphs,
} from "../render";

export type MessageInput = {
	subject: string;
	body: string;
	siteUrl: string;
};

/** Whatever an admin typed, sent to the whole list. */
export function messageEmail(input: MessageInput): Rendered {
	const siteLink = emailLink(input.siteUrl, "/");
	const html = layout({
		title: input.subject,
		kicker: "From Botch RSVP",
		heading: input.subject,
		bodyHtml: [paragraphs(input.body), button("Open the site", siteLink)].join(
			"\n",
		),
		footerHtml: listFooter(),
	});
	const text = [
		input.body.trim(),
		"",
		`Open the site: ${siteLink}`,
		"",
		listFooterText(),
	].join("\n");
	return { subject: input.subject, html, text };
}
