/**
 * The five emails of the RSVP cycle. They share a shape -- the same facts
 * about the same game, differing in what they are nagging you about -- so
 * they share a type and a few builders rather than repeating eleven fields
 * five times.
 */

import type { Rendered } from "../brevo";
import { type RsvpAnswer, rsvpLink } from "../links";
import {
	button,
	escapeHtml,
	type Fact,
	factsTable,
	layout,
	listFooter,
	listFooterText,
	muted,
} from "../render";

export type RsvpFacts = {
	gameId: string;
	dateLabel: string;
	timeLabel: string;
	location: string;
	notes: string | null;
	siteUrl: string;
	inNames: string[];
	maybeNames: string[];
	inCount: number;
	confirmAt: number;
	playAt: number;
	capacity: number;
};

const P = "margin:0 0 14px; font-size:16px; line-height:1.5;";

export function para(text: string): string {
	return `<p style="${P}">${escapeHtml(text)}</p>`;
}

const LABEL: Record<RsvpAnswer, string> = {
	in: "I'm in",
	maybe: "Maybe",
	out: "I'm out",
};

/** The answer buttons, in the order they should be tapped least regrettably. */
export function answerButtons(
	facts: RsvpFacts,
	answers: readonly RsvpAnswer[],
): string {
	return answers
		.map((a) => button(LABEL[a], rsvpLink(facts.siteUrl, facts.gameId, a)))
		.join("\n");
}

export function answerLines(
	facts: RsvpFacts,
	answers: readonly RsvpAnswer[],
): string[] {
	return answers.map(
		(a) => `${LABEL[a]}: ${rsvpLink(facts.siteUrl, facts.gameId, a)}`,
	);
}

export function nameList(names: string[]): string {
	return names.length > 0 ? names.join(", ") : "Nobody. Yet.";
}

/** When / Where, and who is in. Every cycle email leads with these. */
export function baseFacts(facts: RsvpFacts): Fact[] {
	return [
		{ label: "When", value: `${facts.dateLabel}, ${facts.timeLabel}` },
		{ label: "Where", value: facts.location },
		{ label: "In", value: nameList(facts.inNames) },
	];
}

export function render(input: {
	subject: string;
	title: string;
	kicker: string;
	heading: string;
	lead: string;
	facts: Fact[];
	notes: string | null;
	bodyExtra?: string;
	answers: readonly RsvpAnswer[];
	tail: string;
	facts_: RsvpFacts;
	textExtra?: string[];
}): Rendered {
	const html = layout({
		title: input.title,
		kicker: input.kicker,
		heading: input.heading,
		bodyHtml: [
			para(input.lead),
			factsTable(input.facts),
			input.notes ? para(input.notes) : "",
			input.bodyExtra ?? "",
			answerButtons(input.facts_, input.answers),
			muted(escapeHtml(input.tail)),
		]
			.filter(Boolean)
			.join("\n"),
		footerHtml: listFooter(),
	});

	const text = [
		input.heading,
		"",
		input.lead,
		"",
		...input.facts.map((f) => `${f.label}: ${f.value}`),
		...(input.notes ? ["", input.notes] : []),
		...(input.textExtra ?? []),
		"",
		...answerLines(input.facts_, input.answers),
		"",
		input.tail,
		"",
		listFooterText(),
	].join("\n");

	return { subject: input.subject, html, text };
}
