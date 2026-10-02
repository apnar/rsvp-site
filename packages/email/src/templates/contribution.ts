/**
 * The two contribution emails. They are the same email twice -- an amount, how
 * to get it to the host, and a link back to the row that says whether you have --
 * differing only in who is reading it and how patient it sounds, so the parts
 * they share live here rather than in both files.
 */

import type { Rendered } from "../brevo";
import { emailLink } from "../links";
import {
	button,
	escapeHtml,
	factsTable,
	layout,
	listFooter,
	listFooterText,
	muted,
	paragraphs,
} from "../render";

export type ContributionFacts = {
	/** Whole dollars, the same number for everybody on the list. */
	amount: number;
	/** One line of the admin's own words: "Venmo @host, or cash at the door". */
	instructions: string;
	siteUrl: string;
};

/**
 * Whole dollars with the comma a four-figure venue rental earns. Grouped by
 * hand rather than through `toLocaleString`, because the same string has to
 * come out of a Worker, a test runner and whatever ICU each of them shipped
 * with.
 */
export function dollars(amount: number): string {
	const whole = Math.round(amount);
	return `$${whole.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

const CTA = "See where you stand";

/**
 * Both emails land on `/dashboard`: it shows the reader their own row and
 * writes nothing. There is no "mark me paid" link and there never can be --
 * mail clients fetch these before a human sees them.
 */
export function render(
	input: ContributionFacts & {
		subject: string;
		heading: string;
		body: string;
		tail: string;
	},
): Rendered {
	const link = emailLink(input.siteUrl, "/dashboard");
	const facts = [
		{ label: "Amount", value: dollars(input.amount) },
		{ label: "How to pay", value: input.instructions },
	];

	const html = layout({
		title: input.subject,
		kicker: "Contributions",
		heading: input.heading,
		bodyHtml: [
			paragraphs(input.body),
			factsTable(facts),
			button(CTA, link),
			muted(escapeHtml(input.tail)),
		].join("\n"),
		footerHtml: listFooter(),
	});

	const text = [
		input.body.trim(),
		"",
		...facts.map((f) => `${f.label}: ${f.value}`),
		"",
		`${CTA}: ${link}`,
		"",
		input.tail,
		"",
		listFooterText(),
	].join("\n");

	return { subject: input.subject, html, text };
}
