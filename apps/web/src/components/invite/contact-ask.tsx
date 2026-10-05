import { Button } from "@rsvp-site/ui/components/button";
import { Input } from "@rsvp-site/ui/components/input";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Field, Switch } from "@/components/controls";
import type { Outputs } from "@/lib/api-types";

/** What the panel sends: whichever blanks the guest filled. */
export type ContactValues = { phone?: string; texts: boolean; email?: string };

type Result = Outputs["contact"]["add"];

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
 * Asked once a guest has answered, while we have no address or no number
 * for them. Like `RsvpForm` it doesn't know how it saves: the signed-in
 * page and the paper card each hand in their own `submit`. An address
 * isn't saved here at all, only sent a link to confirm it.
 */
export function ContactAsk({
	missing,
	submit,
	pending,
	onClose,
}: {
	missing: { email: boolean; phone: boolean };
	submit: (
		values: ContactValues,
		options: { onSuccess: (result: Result) => void },
	) => void;
	pending: boolean;
	onClose: () => void;
}) {
	const [phone, setPhone] = useState("");
	const [texts, setTexts] = useState(false);
	const [email, setEmail] = useState("");
	const [sentTo, setSentTo] = useState<string | null>(null);
	const ref = useRef<HTMLFormElement>(null);

	// It appears under the button they just pressed, likely below the fold.
	useEffect(() => {
		ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, []);

	const askEmail = missing.email && sentTo === null;
	const askPhone = missing.phone;

	return (
		<form
			ref={ref}
			className="flex flex-col gap-4 rounded-[28px] border border-line bg-panel p-[clamp(20px,3vw,32px)]"
			onSubmit={(ev) => {
				ev.preventDefault();
				const values: ContactValues = {
					texts: askPhone && phone.trim() !== "" && texts,
					...(askPhone && phone.trim() ? { phone } : {}),
					...(askEmail && email.trim() ? { email } : {}),
				};
				if (!values.phone && !values.email) {
					onClose();
					return;
				}
				submit(values, {
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
			}}
		>
			<div>
				<span className="kicker text-lime-ink">One more thing</span>
				<h2 className="mt-1.5 mb-0 text-[24px]">How do we reach you?</h2>
			</div>
			{askEmail || askPhone ? (
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
					<div className="flex items-center gap-3">
						<Switch
							label="Text me invitations and reminders too"
							checked={texts}
							disabled={phone.trim() === ""}
							onChange={setTexts}
						/>
						<span className="text-[14px]">
							Text me invitations and reminders too
							{/* Carriers read what people saw when they said yes. */}
							<span className="block text-[12px] text-haze">
								Message and data rates may apply. Reply STOP to stop, HELP for
								help. See our <a href="/terms">terms</a> and{" "}
								<a href="/privacy">privacy policy</a>.
							</span>
						</span>
					</div>
				</>
			) : null}

			<div className="flex flex-wrap gap-2">
				{askEmail || askPhone ? (
					<Button type="submit" disabled={pending}>
						{pending ? "Saving..." : "Save"}
					</Button>
				) : null}
				<Button type="button" variant="ghost" onClick={onClose}>
					{askEmail || askPhone ? "Not now" : "Done"}
				</Button>
			</div>
		</form>
	);
}
