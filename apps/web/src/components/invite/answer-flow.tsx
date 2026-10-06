import { type ReactNode, useState } from "react";
import type { Outputs } from "@/lib/api-types";

import { type DietSave, dietPeople } from "@/lib/diet-people";
import { AfterAnswer, type ContactValues } from "./after-answer";
import { initialRsvp, RsvpForm, type RsvpValues } from "./rsvp-form";
import type { Invite } from "./types";

type Mutate<V, R> = (v: V, options: { onSuccess: (result: R) => void }) => void;

/**
 * The answer form and the panel that follows it, wired together. The
 * signed-in page and the paper card answer, save diets and add contact
 * details through different procedures, so each hands in its own as
 * adapters and this owns the part that must agree: an answer opens the
 * after-answer check, built from what was just sent, and closes it again.
 */
export function AnswerFlow({
	data,
	preselect,
	respond,
	saveDiets,
	addContact,
	pending,
	children,
}: {
	/** An invitation with a guest to answer for (a preview one counts). */
	data: Invite & { me: NonNullable<Invite["me"]> };
	/** The answer an email button carried: shown picked, never saved. */
	preselect: "yes" | "maybe" | "no" | null;
	respond: Mutate<RsvpValues, Outputs["guests"]["respond"]>;
	saveDiets: (people: DietSave, options: { onSuccess: () => void }) => void;
	addContact: Mutate<ContactValues, Outputs["contact"]["add"]>;
	/** The answer in flight, and the panel's saves in flight. */
	pending: { respond: boolean; after: boolean };
	/** Whatever the page keeps under the form. */
	children?: ReactNode;
}) {
	// Opened by an answer: the answer it was, which decides whose diets to check.
	const [asking, setAsking] = useState<RsvpValues | null>(null);
	const me = data.me;
	return (
		<div className="flex flex-col gap-5">
			<RsvpForm
				data={data}
				initial={initialRsvp(me, data.answers, preselect)}
				submit={(values, options) =>
					respond(values, {
						onSuccess: (result) => {
							options.onSuccess(result);
							setAsking(values);
						},
					})
				}
				pending={pending.respond}
			/>
			{asking ? (
				<AfterAnswer
					// A fresh answer is a fresh check.
					key={JSON.stringify(asking)}
					missing={me.missing}
					people={dietPeople(me, data.event.askDietary, asking)}
					saveDiets={saveDiets}
					submitContact={addContact}
					pending={pending.after}
					onClose={() => setAsking(null)}
				/>
			) : null}
			{children}
		</div>
	);
}
