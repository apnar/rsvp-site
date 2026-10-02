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
} from "../render";
import { baseFacts, nameList, para, type RsvpFacts } from "./rsvp";

export type RsvpFinalInput = RsvpFacts & {
	decision: "on" | "off";
	permitUrl: string | null;
};

/**
 * Stage 05. Half past seven, the count is what it is.
 *
 * The only email in the cycle with no answer buttons: the question is closed.
 * When the answer is "off" it also goes wider than the rest -- to the people
 * who never answered, and to whoever typed in a guest -- because whoever
 * ignored five emails is exactly the guest who drives to a locked venue out of
 * habit, and a guest has no inbox at all.
 */
export function rsvpFinalEmail(input: RsvpFinalInput): Rendered {
	const on = input.decision === "on";
	const heading = on ? "It is happening." : "Not tonight.";
	const kicker = on ? "Confirmed" : "Called off";
	const lead = on
		? `${input.inCount} in. ${input.inCount >= input.confirmAt ? "That is plenty." : `${input.confirmAt} would have been nicer, but ${input.playAt} is enough to go ahead and we cleared it.`} See you there.`
		: `${input.inCount}. That is not enough people to go ahead, so the host is calling it off. There will be another one.`;

	const facts = baseFacts(input);
	if (!on && input.maybeNames.length > 0) {
		facts.push({ label: "Maybe", value: nameList(input.maybeNames) });
	}

	const sponsorNote = muted(
		escapeHtml(
			on
				? "Put somebody down who is not on the list? They are expecting you to tell them. Tell them."
				: "Put somebody down who is not on the list? They do not get these. Go tell them before they drive over.",
		),
	);

	const html = layout({
		title: on
			? `It's on: ${input.dateLabel}`
			: `Called off: ${input.dateLabel}`,
		kicker,
		heading,
		bodyHtml: [
			para(lead),
			factsTable(facts),
			input.notes && on ? para(input.notes) : "",
			on && input.permitUrl
				? muted(
						`Venue staff want proof? The permit is at <a href="${escapeHtml(input.permitUrl)}" style="color:#2f5f86;">${escapeHtml(input.permitUrl)}</a>.`,
					)
				: "",
			button(
				on ? "See who is in" : "The schedule",
				emailLink(input.siteUrl, on ? "/#rsvp" : "/schedule"),
			),
			sponsorNote,
		]
			.filter(Boolean)
			.join("\n"),
		footerHtml: listFooter(),
	});

	const text = [
		heading,
		"",
		lead,
		"",
		...facts.map((f) => `${f.label}: ${f.value}`),
		...(input.notes && on ? ["", input.notes] : []),
		...(on && input.permitUrl ? ["", `Permit: ${input.permitUrl}`] : []),
		"",
		emailLink(input.siteUrl, on ? "/#rsvp" : "/schedule"),
		"",
		on
			? "Put somebody down who is not on the list? They are expecting you to tell them. Tell them."
			: "Put somebody down who is not on the list? They do not get these. Go tell them before they drive over.",
		"",
		listFooterText(),
	].join("\n");

	return {
		subject: on
			? `It's on. ${input.inCount} in.`
			: `Called off tonight. ${input.inCount} in.`,
		html,
		text,
	};
}
