import { type AnswerSet, offered } from "@rsvp-site/api/answer-words";
import { type Answer, extraPeople } from "@rsvp-site/api/headcount";
import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { Textarea } from "@rsvp-site/ui/components/textarea";
import { useState } from "react";
import { toast } from "sonner";

import { AnswerPicker, Field, Stepper } from "@/components/controls";
import { Tag } from "@/components/tag";
import type { Outputs } from "@/lib/api-types";
import { PotluckClaims } from "./potluck-claims";
import type { Invite } from "./types";

/** What the form sends: one answer, with its party and picks. */
export type RsvpValues = {
	response: Answer;
	adults: number;
	kids: number;
	partyDiet: string;
	note: string;
	claims: string[];
	family: { guestId: string; response: Answer }[];
};

/** Where the form starts: what is saved, or what an email button carried. */
type RsvpInitial = {
	answer: Answer | null;
	adults: number;
	kids: number;
	partyDiet: string;
	note: string;
	claims: string[];
};

export function initialRsvp(
	me: NonNullable<Invite["me"]>,
	answers: AnswerSet,
	preselected: Answer | null,
): RsvpInitial {
	// An old email's maybe button, after the host took maybe away.
	const carried =
		preselected && offered(answers, me.response).includes(preselected)
			? preselected
			: null;
	return {
		answer: carried ?? me.response,
		// A child's own row is 0 adults and 1 kid; the steppers are for a
		// grown-up's party, and clampParty would count that kid twice.
		adults: me.adults < 1 ? 1 : me.adults,
		kids: me.adults < 1 ? 0 : me.kids,
		partyDiet: me.partyDiet,
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
	const answers = data.answers;
	const saved = me?.response ?? null;
	const [answer, setAnswer] = useState<Answer | null>(initial.answer);
	const [adults, setAdults] = useState(initial.adults);
	const [kids, setKids] = useState(initial.kids);
	const [partyDiet, setPartyDiet] = useState(initial.partyDiet);
	const [note, setNote] = useState(initial.note);
	const [claims, setClaims] = useState<string[]>(initial.claims);
	// Relatives the guest has answered in this form. Until then an unanswered
	// relative follows the guest's own pick, so one tap answers for a household.
	const [touched, setTouched] = useState<Record<string, Answer>>({});

	if (!me) return null;
	const family = me.family.map((r) => ({
		...r,
		shown: touched[r.guestId] ?? r.response ?? answer,
	}));
	const pending = answer !== null && answer !== saved;
	const coming = answer === "yes" || answer === "maybe";

	return (
		<form
			className="flex flex-col gap-[22px] rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,32px)]"
			onSubmit={(ev) => {
				ev.preventDefault();
				if (!answer) {
					toast.error("Pick an answer first.");
					return;
				}
				submit(
					{
						response: answer,
						adults,
						kids,
						partyDiet,
						note,
						claims,
						// Only answers this form changes: re-sending a relative's own
						// answer would stamp it as given by this guest.
						family: family.flatMap((r) =>
							r.shown && r.shown !== r.response
								? [{ guestId: r.guestId, response: r.shown }]
								: [],
						),
					},
					{
						onSuccess: (result) => {
							if (result.full.length > 0) {
								setClaims((c) => c.filter((id) => !result.full.includes(id)));
								toast.warning(
									"Saved, but someone beat you to a potluck slot. Pick another?",
								);
							} else {
								toast.success(
									answer === "no" ? "Got it. They'll miss you." : "Saved.",
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
			<AnswerPicker
				answers={answers}
				saved={saved}
				value={answer}
				onChange={setAnswer}
				pending={pending}
			/>

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
			{coming && e.maxPlusOnes > 0 && family.length > 0 ? (
				<span className="-mt-3 text-[13px] text-haze">
					Family on the list is answered for below, so don't count them as
					plus-ones.
				</span>
			) : null}

			{family.length > 0 ? (
				<div className="flex flex-col gap-3">
					<span className="kicker text-soft">Your family</span>
					{family.map((r) => (
						<div key={r.guestId} className="flex flex-col gap-1.5">
							<span className="font-bold text-[15px]">
								{r.name}
								{r.child ? <Tag>kid</Tag> : null}
								{r.answeredByName ? (
									<span className="ml-2 font-normal text-[13px] text-haze">
										answered by {r.answeredByName}
									</span>
								) : null}
							</span>
							<AnswerPicker
								answers={answers}
								saved={r.response}
								size="sm"
								name={`family-${r.guestId}`}
								legend={`Is ${r.name} coming?`}
								value={r.shown}
								onChange={(a) => setTouched((t) => ({ ...t, [r.guestId]: a }))}
							/>
						</div>
					))}
				</div>
			) : null}

			{/* Each invited person's own diet is on their profile, checked
			    after answering; this is for the people they bring. */}
			{coming && e.askDietary && extraPeople({ adults, kids }) > 0 ? (
				<Field label="Diets of the others you're bringing" htmlFor="party-diet">
					<Input
						id="party-diet"
						value={partyDiet}
						maxLength={300}
						placeholder="Allergies, vegetarians, anything the hosts should know"
						onChange={(ev) => setPartyDiet(ev.target.value)}
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
						: answers.words.submit}
			</Button>
		</form>
	);
}
