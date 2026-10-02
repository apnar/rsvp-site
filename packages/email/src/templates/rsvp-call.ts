import type { Rendered } from "../brevo";
import { baseFacts, type RsvpFacts, render } from "./rsvp";

export type RsvpCallInput = RsvpFacts & {
	/** The event is today, not tomorrow -- a venue booked late. */
	today: boolean;
	/** Ten already said yes before we even asked. It happens. */
	alreadyOn: boolean;
};

/** Stage 01. The evening before: there is an event, say something. */
export function rsvpCallEmail(input: RsvpCallInput): Rendered {
	const day = input.today ? "tonight" : "tomorrow";
	const heading = input.alreadyOn
		? `${input.confirmAt} already. The event is on.`
		: `There is an event ${day}.`;

	return render({
		subject: input.alreadyOn
			? `${input.dateLabel}: the event is on. Say if you're in.`
			: `${input.today ? "Tonight" : "Tomorrow"}, ${input.timeLabel}. In, out, or maybe.`,
		title: heading,
		kicker: input.today ? "Tonight" : "Tomorrow",
		heading,
		lead: input.alreadyOn
			? `${input.confirmAt} of you got there before the email did. It is happening. Say where you stand anyway, so the count means something.`
			: `${input.confirmAt} yeses confirm it. With fewer than ${input.playAt} it is called off. Answer now, not at the last minute from the driveway.`,
		facts: baseFacts(input),
		notes: input.notes,
		answers: ["in", "maybe", "out"],
		tail: `Maybe means maybe. It does not count toward ${input.confirmAt}, and everybody knows it.`,
		facts_: input,
	});
}
