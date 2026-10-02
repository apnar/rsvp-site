import type { Rendered } from "../brevo";
import { baseFacts, type RsvpFacts, render } from "./rsvp";

export type RsvpLastCallInput = RsvpFacts & {
	needed: number;
	/** We already said it was on, and then people remembered things. */
	wasConfirmed: boolean;
};

/** Stage 04. Six o'clock, still short. The email that converts a maybe. */
export function rsvpLastCallEmail(input: RsvpLastCallInput): Rendered {
	return render({
		subject: `Last call: ${input.inCount} in, ${input.needed} short by 7:30.`,
		title: "Last call",
		kicker: "Last call",
		heading: `${input.needed} more or it is off.`,
		lead: input.wasConfirmed
			? `We said it was on. Then some of you remembered a thing. We are back under ${input.confirmAt}, and at 7:30 we count for the last time: ${input.playAt} or more and it happens, fewer and it is called off.`
			: `${input.inCount} is not ${input.confirmAt}. At 7:30 we count for the last time: ${input.playAt} or more and it happens, fewer and it is called off.`,
		facts: [...baseFacts(input), { label: "Deciding at", value: "7:30 PM" }],
		notes: input.notes,
		// No Maybe. This email exists to convert maybes, and handing one back
		// the button that made the problem is how you get to 7:30 with six ins
		// and five maybes.
		answers: ["in", "out"],
		tail: "A maybe counts toward nothing at 7:30. Pick a side.",
		facts_: input,
	});
}
