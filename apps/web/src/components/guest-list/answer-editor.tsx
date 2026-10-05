import { type AnswerSet, offered, pickWord } from "@rsvp-site/api/answer-words";
import { Button } from "@rsvp-site/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Stepper } from "@/components/controls";
import { PillTabs } from "@/components/pill-tabs";
import { orpc } from "@/utils/orpc";
import type { Guest } from "./types";

type EditedAnswer = "yes" | "maybe" | "no" | "none";

/**
 * A host recording a guest's answer -- they called, or they told you at the
 * pool. Spans the whole row; the guest's own notes and potluck picks stay
 * theirs.
 */
export function AnswerEditor({
	eventId,
	guest,
	answers,
	onDone,
}: {
	eventId: string;
	guest: Guest;
	answers: AnswerSet;
	onDone: () => void;
}) {
	// The guest's own choices, and putting it back to no reply.
	const options: { value: EditedAnswer; label: string }[] = [
		...offered(answers, guest.response),
		"none" as const,
	].map((value) => ({
		value,
		label: pickWord(answers.words, value === "none" ? null : value),
	}));
	const [answer, setAnswer] = useState<EditedAnswer>(guest.response ?? "none");
	const [adults, setAdults] = useState(guest.adults);
	const [kids, setKids] = useState(guest.kids);
	const save = useMutation(
		orpc.guests.setAnswer.mutationOptions({
			onSuccess: () => {
				toast.success(`Saved ${guest.name}'s answer.`);
				onDone();
			},
		}),
	);
	const coming = answer === "yes" || answer === "maybe";
	return (
		<form
			className="col-span-full flex basis-full flex-wrap items-end gap-3 border-line border-t pt-3"
			onSubmit={(ev) => {
				ev.preventDefault();
				save.mutate({
					eventId,
					guestId: guest.id,
					response: answer === "none" ? null : answer,
					adults,
					kids,
				});
			}}
		>
			<PillTabs
				label={`${guest.name}'s answer`}
				value={answer}
				onChange={setAnswer}
				options={options}
			/>
			{coming ? (
				<div className="grid min-w-[300px] flex-1 grid-cols-2 gap-2">
					<Stepper
						label="Adults"
						value={adults}
						// A child a relative answered for is 0 adults and 1 kid.
						min={kids >= 1 ? 0 : 1}
						max={50}
						onChange={setAdults}
					/>
					<Stepper
						label="Kids"
						value={kids}
						min={adults === 0 ? 1 : 0}
						max={50}
						onChange={setKids}
					/>
				</div>
			) : null}
			<div className="flex gap-2">
				<Button type="submit" size="sm" disabled={save.isPending}>
					Save
				</Button>
				<Button variant="ghost" size="sm" onClick={onDone}>
					Cancel
				</Button>
			</div>
		</form>
	);
}
