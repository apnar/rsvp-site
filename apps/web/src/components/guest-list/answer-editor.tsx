import { Button } from "@rsvp-site/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Stepper } from "@/components/controls";
import { PillTabs } from "@/components/pill-tabs";
import { ANSWER_LABELS } from "@/content/site";
import { orpc } from "@/utils/orpc";
import type { Guest } from "./types";

type EditedAnswer = "yes" | "maybe" | "no" | "none";

const ANSWERS: { value: EditedAnswer; label: string }[] = (
	["yes", "maybe", "no", "none"] as const
).map((value) => ({ value, label: ANSWER_LABELS[value] }));

/**
 * A host recording a guest's answer -- they called, or they told you at the
 * pool. Spans the whole row; the guest's own notes and potluck picks stay
 * theirs.
 */
export function AnswerEditor({
	eventId,
	guest,
	onDone,
}: {
	eventId: string;
	guest: Guest;
	onDone: () => void;
}) {
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
				options={ANSWERS}
			/>
			{coming ? (
				<div className="grid min-w-[300px] flex-1 grid-cols-2 gap-2">
					<Stepper
						label="Adults"
						value={adults}
						min={1}
						max={50}
						onChange={setAdults}
					/>
					<Stepper
						label="Kids"
						value={kids}
						min={0}
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
