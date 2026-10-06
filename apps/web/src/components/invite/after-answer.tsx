import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Field, Switch } from "@/components/controls";
import { DietFields, DietSummaryRow, PersonLabel } from "@/components/diet";
import { TextsDisclosure } from "@/components/texts-copy";
import type { Outputs } from "@/lib/api-types";
import type { DietPerson, DietSave } from "@/lib/diet-people";
import { type DietValue, NO_DIET, sameDiet } from "@/lib/diet-value";

/** What the panel sends: whichever blanks the guest filled. */
export type ContactValues = { phone?: string; texts: boolean; email?: string };

type ContactResult = Outputs["contact"]["add"];

function askLine(missing: { email: boolean; phone: boolean }): string {
	if (missing.email && missing.phone) {
		return "We have no email or phone for you. Give us either and invitations, reminders and changes can find you.";
	}
	if (missing.email) {
		return "We only have your phone. Add your email and invitations land in your inbox too.";
	}
	return "Add your mobile number so the hosts can reach you.";
}

/**
 * Asked once a guest has answered: whether their diets (and those of the
 * relatives they answered for) are still right, and any address or number
 * we lack. Diets live on the person, so this is where they stay current;
 * "Looks right" saves them unchanged, which is what makes the next ask a
 * one-line check rather than the full boxes. Like `RsvpForm` it doesn't
 * know how it saves: the signed-in page and the paper card each hand in
 * their own. An address isn't saved here at all, only sent a link.
 */
export function AfterAnswer({
	missing,
	people,
	saveDiets,
	submitContact,
	pending,
	onClose,
}: {
	missing: { email: boolean; phone: boolean };
	people: DietPerson[];
	saveDiets: (people: DietSave, options: { onSuccess: () => void }) => void;
	submitContact: (
		values: ContactValues,
		options: { onSuccess: (result: ContactResult) => void },
	) => void;
	pending: boolean;
	onClose: () => void;
}) {
	const [diets, setDiets] = useState<Record<string, DietValue>>(() =>
		Object.fromEntries(
			people.map((p) => [p.userId, { diets: p.diet.diets, note: p.diet.note }]),
		),
	);
	// Somebody confirmed before gets the one-line check; "Change" opens it.
	const [open, setOpen] = useState<Record<string, boolean>>(() =>
		Object.fromEntries(people.map((p) => [p.userId, !p.diet.confirmed])),
	);
	const [dietsDone, setDietsDone] = useState(false);
	const [phone, setPhone] = useState("");
	const [texts, setTexts] = useState(false);
	const [email, setEmail] = useState("");
	const [sentTo, setSentTo] = useState<string | null>(null);
	const ref = useRef<HTMLFormElement>(null);

	// It appears under the button they just pressed, likely below the fold.
	useEffect(() => {
		ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, []);

	const askDiets = people.length > 0 && !dietsDone;
	const askEmail = missing.email && sentTo === null;
	const askPhone = missing.phone;
	const askContact = askEmail || askPhone;
	if (!askDiets && !askContact && sentTo === null) return null;

	const contactValues = (): ContactValues => ({
		texts: askPhone && phone.trim() !== "" && texts,
		...(askPhone && phone.trim() ? { phone } : {}),
		...(askEmail && email.trim() ? { email } : {}),
	});
	const typedContact = () => {
		const v = contactValues();
		return Boolean(v.phone || v.email);
	};
	const dietEdited = people.some((p) => {
		const now = diets[p.userId];
		return now !== undefined && !sameDiet(now, p.diet);
	});
	const allConfirmed = people.every((p) => p.diet.confirmed);

	const sendContact = () => {
		const values = contactValues();
		if (!values.phone && !values.email) {
			toast.success("Saved. Thanks.");
			onClose();
			return;
		}
		submitContact(values, {
			onSuccess: (result) => {
				if (result.emailTo) {
					setSentTo(result.emailTo);
					setEmail("");
					if (result.phone) toast.success("Number saved.");
				} else {
					toast.success("Saved. Thanks.");
					onClose();
				}
			},
		});
	};

	const heading = askDiets
		? askContact
			? "Food, and how to reach you"
			: allConfirmed
				? "Still right on food?"
				: "Any dietary needs?"
		: "How do we reach you?";

	return (
		<form
			ref={ref}
			className="flex flex-col gap-4 rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,32px)]"
			onSubmit={(ev) => {
				ev.preventDefault();
				if (askDiets) {
					saveDiets(
						people.map((p) => {
							const d = diets[p.userId] ?? NO_DIET;
							return { userId: p.userId, diets: d.diets, note: d.note.trim() };
						}),
						{
							onSuccess: () => {
								setDietsDone(true);
								sendContact();
							},
						},
					);
					return;
				}
				if (!typedContact()) {
					onClose();
					return;
				}
				sendContact();
			}}
		>
			<div>
				<span className="kicker text-lime-ink">One more thing</span>
				<h2 className="mt-1.5 mb-0 text-[24px]">{heading}</h2>
			</div>

			{askDiets ? (
				<div className="flex flex-col gap-4">
					<p className="m-0 text-[15px] text-soft">
						{allConfirmed
							? "Here's what the hosts will see. Change anything that's not right."
							: "Tick anything the hosts should plan for. It's kept for next time, so you only say it once."}
					</p>
					{people.map((p) => {
						const value = diets[p.userId] ?? NO_DIET;
						return open[p.userId] ? (
							<div key={p.userId} className="flex flex-col gap-2">
								{people.length > 1 || !p.you ? (
									<PersonLabel name={p.name} child={p.child} />
								) : null}
								<DietFields
									idPrefix={`after-${p.userId}`}
									value={value}
									onChange={(v) => setDiets((d) => ({ ...d, [p.userId]: v }))}
								/>
							</div>
						) : (
							<DietSummaryRow
								key={p.userId}
								name={p.name}
								child={p.child}
								value={value}
								onChange={() => setOpen((o) => ({ ...o, [p.userId]: true }))}
							/>
						);
					})}
				</div>
			) : null}

			{askDiets && askContact ? (
				<span className="kicker mt-2 text-soft">How to reach you</span>
			) : null}
			{askContact ? (
				<p className="m-0 text-[15px] text-soft">{askLine(missing)}</p>
			) : null}
			{sentTo ? (
				<p className="m-0 font-bold text-[15px]">
					Check {sentTo}: press the button in the email we just sent, and it's
					added.
				</p>
			) : null}

			{askEmail ? (
				<Field label="Email" htmlFor="contact-email">
					<Input
						id="contact-email"
						type="email"
						autoComplete="email"
						maxLength={254}
						value={email}
						onChange={(ev) => setEmail(ev.target.value)}
					/>
				</Field>
			) : null}

			{askPhone ? (
				<>
					<Field label="Mobile number" htmlFor="contact-phone">
						<Input
							id="contact-phone"
							type="tel"
							autoComplete="tel"
							maxLength={40}
							value={phone}
							onChange={(ev) => setPhone(ev.target.value)}
						/>
					</Field>
					<div className="flex flex-col gap-1">
						<Switch
							checked={texts}
							disabled={phone.trim() === ""}
							onChange={setTexts}
							className="w-fit text-[14px]"
						>
							Text me invitations and reminders too
						</Switch>
						{/* Carriers read what people saw when they said yes. Kept out of
						    the switch's label so it isn't the switch's name. */}
						<span className="pl-[62px] text-[12px] text-haze">
							<TextsDisclosure />
						</span>
					</div>
				</>
			) : null}

			<div className="flex flex-wrap gap-2">
				{askDiets || askContact ? (
					<Button type="submit" disabled={pending}>
						{pending
							? "Saving..."
							: askDiets && !dietEdited && !typedContact()
								? "Looks right"
								: "Save"}
					</Button>
				) : null}
				<Button type="button" variant="ghost" onClick={onClose}>
					{askDiets || askContact ? "Not now" : "Done"}
				</Button>
			</div>
		</form>
	);
}
