import type { Rendered } from "../brevo";
import { escapeHtml, muted } from "../render";
import { baseFacts, nameList, type RsvpFacts, render } from "./rsvp";

export type RsvpConfirmedInput = RsvpFacts & { permitUrl: string | null };

/** Stage 03. The tenth yes landed. Fires once, never un-fires. */
export function rsvpConfirmedEmail(input: RsvpConfirmedInput): Rendered {
	const facts = baseFacts(input);
	if (input.maybeNames.length > 0) {
		facts.push({ label: "Maybe", value: nameList(input.maybeNames) });
	}
	return render({
		subject: `It's on. ${input.dateLabel}, ${input.timeLabel}.`,
		title: `It's on: ${input.dateLabel}`,
		kicker: "Confirmed",
		heading: `${input.confirmAt}. It is happening.`,
		lead: `${input.inCount} yeses. That is enough to go ahead. Maybes: you have until 7:30 to make up your mind.`,
		facts,
		notes: input.notes,
		bodyExtra: input.permitUrl
			? muted(
					`Venue staff want proof? The permit is at <a href="${escapeHtml(input.permitUrl)}" style="color:#2f5f86;">${escapeHtml(input.permitUrl)}</a>.`,
				)
			: "",
		// No Maybe button: everyone reading this already said in or maybe, and
		// the button a maybe needs is the one that resolves it.
		answers: ["in", "out"],
		tail: "Show up. Bring a plus-one if you put one on the sheet.",
		facts_: input,
		textExtra: input.permitUrl ? ["", `Permit: ${input.permitUrl}`] : [],
	});
}
