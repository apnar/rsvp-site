import type { Rendered } from "../brevo";
import { type ContributionFacts, dollars, render } from "./contribution";

export type ContributionReminderInput = ContributionFacts & { body: string };

const TAIL =
	"This one only went to the people who have not paid. It is a short list and you are on it.";

/**
 * The second ask, sent by hand to whoever is still on the unpaid side of the
 * ledger. The subject is fixed here rather than left to the admin: the number
 * is the whole point of the email, and it should be readable without opening
 * it.
 */
export function contributionReminderEmail(
	input: ContributionReminderInput,
): Rendered {
	return render({
		...input,
		subject: `Still owed: ${dollars(input.amount)} toward the costs.`,
		heading: "You have not paid.",
		tail: TAIL,
	});
}

/** Prefilled in the reminder box, and editable there. */
export const CONTRIBUTION_REMINDER_BODY = [
	"The call for contributions went out a while ago. Yours has not landed. The host already covered the costs, so this is the host asking, nobody else.",
	"Send it the way below and this is the last you hear of it.",
].join("\n\n");
