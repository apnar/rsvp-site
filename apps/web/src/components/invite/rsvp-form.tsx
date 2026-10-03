import type { Answer } from "@rsvp-site/api/headcount";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { useState } from "react";
import { toast } from "sonner";

import { AnswerPicker, Field, Stepper } from "@/components/controls";
import type { Outputs } from "@/lib/api-types";
import { PotluckClaims } from "./potluck-claims";
import type { Invite } from "./types";

/** What the form sends: one answer, with its party and picks. */
export type RsvpValues = {
	response: Answer;
	adults: number;
	kids: number;
	dietary: string;
	note: string;
	claims: string[];
};

/** Where the form starts: what is saved, or what an email button carried. */
export type RsvpInitial = {
	answer: Answer | null;
	adults: number;
	kids: number;
	dietary: string;
	note: string;
	claims: string[];
};

export function initialRsvp(
	me: NonNullable<Invite["me"]>,
	preselected: Answer | null,
): RsvpInitial {
	return {
		answer: preselected ?? me.response,
		adults: me.adults,
		kids: me.kids,
		dietary: me.dietary,
		note: me.note,
		claims: me.claims,
	};
}

/**
 * The answer form. It does not know how an answer is saved: the page hands
 * in `submit` (shaped like a mutation's `mutate`, so the page's own
 * mutation drives `pending` and the error toast) and where the form
 * starts, which is what lets a paper invitation reuse it.
 */
export function RsvpForm({
	data,
	initial,
	submit,
	pending: saving,
}: {
	data: Invite;
	initial: RsvpInitial;
	submit: (
		values: RsvpValues,
		options: { onSuccess: (result: Outputs["guests"]["respond"]) => void },
	) => void;
	pending: boolean;
}) {
	const e = data.event;
	const me = data.me;
	const saved = me?.response ?? null;
	const [answer, setAnswer] = useState<Answer | null>(initial.answer);
	const [adults, setAdults] = useState(initial.adults);
	const [kids, setKids] = useState(initial.kids);
	const [dietary, setDietary] = useState(initial.dietary);
	const [note, setNote] = useState(initial.note);
	const [claims, setClaims] = useState<string[]>(initial.claims);

	if (!me) return null;
	const pending = answer !== null && answer !== saved;
	const coming = answer === "yes" || answer === "maybe";

	return (
		<form
			className="flex flex-col gap-[22px] rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,32px)]"
			onSubmit={(ev) => {
				ev.preventDefault();
				if (!answer) {
					toast.error("Yes, maybe or can't?");
					return;
				}
				submit(
					{ response: answer, adults, kids, dietary, note, claims },
					{
						onSuccess: (result) => {
							if (result.full.length > 0) {
								setClaims((c) => c.filter((id) => !result.full.includes(id)));
								toast.warning(
									"Saved, but someone beat you to a potluck slot. Pick another?",
								);
							} else {
								toast.success(
									answer === "no" ? "Got it. They'll miss you." : "Locked in.",
								);
							}
						},
					},
				);
			}}
		>
			<div>
				{e.deadlineLabel ? (
					<span className="kicker text-lime-ink">
						RSVP by {e.deadlineLabel}
					</span>
				) : null}
				<h2 className="mt-1.5 mb-0 text-[30px]">You coming, {me.firstName}?</h2>
			</div>
			<AnswerPicker value={answer} onChange={setAnswer} pending={pending} />

			{coming && (e.maxPlusOnes > 0 || e.askKids) ? (
				<div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
					{e.maxPlusOnes > 0 ? (
						<Stepper
							label="Adults"
							value={adults}
							min={1}
							max={1 + e.maxPlusOnes}
							onChange={setAdults}
						/>
					) : null}
					{e.askKids ? (
						<Stepper
							label="Kids"
							value={kids}
							min={0}
							max={20}
							onChange={setKids}
						/>
					) : null}
				</div>
			) : null}

			{coming && e.askDietary ? (
				<Field label="Dietary notes" htmlFor="dietary">
					<Input
						id="dietary"
						value={dietary}
						maxLength={300}
						placeholder="Allergies, vegetarians, anything the hosts should know"
						onChange={(ev) => setDietary(ev.target.value)}
					/>
				</Field>
			) : null}

			{coming && e.potluckEnabled && data.potluck.length > 0 ? (
				<PotluckClaims
					items={data.potluck}
					claims={claims}
					onChange={setClaims}
				/>
			) : null}

			{e.askNote ? (
				<Field label="Note for the hosts" htmlFor="note">
					<Textarea
						id="note"
						value={note}
						maxLength={1000}
						onChange={(ev) => setNote(ev.target.value)}
					/>
				</Field>
			) : null}

			<Button type="submit" variant="send" size="lg" disabled={saving}>
				{saving
					? "Saving..."
					: saved && !pending
						? "Update my answer"
						: "Lock it in"}
			</Button>
		</form>
	);
}
