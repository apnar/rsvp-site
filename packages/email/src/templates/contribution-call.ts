import type { Rendered } from "../brevo";
import { type ContributionFacts, render } from "./contribution";

export type ContributionCallInput = ContributionFacts & {
	subject: string;
	body: string;
};

const TAIL =
	"You are getting this because you are on the list. Everybody on it got the same one.";

/** The ask, sent to everybody on the guest list. */
export function contributionCallEmail(input: ContributionCallInput): Rendered {
	return render({
		...input,
		heading: input.subject,
		tail: TAIL,
	});
}

/**
 * What an admin sees in the box before they touch it. Standing copy, not a
 * template: it is prefilled and editable, so a call that wants different
 * words gets them. The amount is deliberately absent from the prose -- the
 * facts table carries the number, and one place for it means the two cannot
 * disagree after an edit.
 */
export function contributionCallDefaults(_amount: number): {
	subject: string;
	body: string;
} {
	return {
		subject: "Chipping in.",
		body: [
			"The host has covered the costs. This is everybody's share of them.",
			"Everybody on the list owes the same amount, whether you made every event or only some of them. The costs were the same either way.",
			"How to pay is below. Once it lands the host marks you paid and you hear no more about it.",
		].join("\n\n"),
	};
}
