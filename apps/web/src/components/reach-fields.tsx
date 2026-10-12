import { formatPhone } from "@rsvp-site/db/phone";
import type {
	ContactChannel,
	UnsubscribeReason,
} from "@rsvp-site/db/schema/auth";
import type { SmsBlockReason } from "@rsvp-site/db/schema/sms";
import { useId } from "react";
import { Segmented, SettingRow, Switch } from "@/components/controls";
import { offeredChannels, type Reach, shownChannel } from "@/lib/reach-draft";

const CHANNEL_LABEL: Record<ContactChannel, string> = {
	email: "Email",
	text: "Text",
	both: "Both",
};

const MY_REASON: Record<UnsubscribeReason, string> = {
	self: "You unsubscribed.",
	bounce: "Email to this address bounced, so it stopped.",
	spam: "A message was reported as spam, so email stopped.",
	invalid: "The address couldn't receive mail, so email stopped.",
	admin: "An admin turned it off.",
};
const THEIR_REASON = { ...MY_REASON, self: "They unsubscribed." };

/**
 * The "How we reach you" rows, for the account page (`mine`) and an admin
 * setting them for somebody else. Email and texts are separate permissions
 * (a STOP reply must not touch email, an unsubscribe must not touch texts),
 * and which one carries invitations is a third thing, so each gets its own
 * row. The caller holds the draft and saves it.
 */
export function ReachFields({
	mine,
	saved,
	draft,
	onEdit,
	person,
	isHost,
	textingFrom,
	phoneChanged = false,
}: {
	mine: boolean;
	saved: Reach;
	draft: Reach;
	onEdit: (change: Partial<Reach>) => void;
	person: {
		email: string;
		phone: string | null;
		textablePhone: boolean;
		textBlock: SmsBlockReason | null;
		unsubscribeReason: UnsubscribeReason | null;
	};
	/** Reply alerts are only for hosts. */
	isHost: boolean;
	/** The number to text START to, for the person who sent STOP. */
	textingFrom?: string;
	/** The phone field holds a new number not yet saved. */
	phoneChanged?: boolean;
}) {
	const id = useId();
	const blocked = person.textBlock !== null;
	const whose = mine ? "your" : "their";

	const textsHint = phoneChanged
		? "Save the new number first: texts are agreed to one number at a time."
		: !person.textablePhone
			? mine
				? "Add a US mobile number above to get texts."
				: "Add a US mobile number above to text them."
			: person.textBlock === "stop"
				? mine
					? `You replied STOP from this phone. Text START to ${textingFrom} to turn texts back on.`
					: "They replied STOP from this phone. Only a START from it turns texts back on."
				: blocked
					? "Carriers say this number can't get texts."
					: draft.texts
						? !mine && !saved.texts
							? "On your word that they want texts from this site: only switch it on if they asked."
							: "On. Below says which messages come this way."
						: "Off. Invitations still show up on the site.";
	const reason =
		!saved.email && person.unsubscribeReason
			? (mine ? MY_REASON : THEIR_REASON)[person.unsubscribeReason]
			: "Off.";
	const emailHint = draft.email
		? `Invitations, reminders and changes land in ${whose} inbox.`
		: `${reason} Invitations still show up on the site.`;

	const channels = offeredChannels(draft);

	return (
		<>
			{/* Somebody invited on paper by name alone has no email to switch. */}
			{person.email ? (
				<SettingRow title="Email" hint={emailHint}>
					<Switch
						label="Invitations by email"
						checked={draft.email}
						onChange={(value) => onEdit({ email: value })}
					/>
				</SettingRow>
			) : null}
			<SettingRow
				title={
					person.phone && person.textablePhone && !phoneChanged
						? `Texts to ${formatPhone(person.phone)}`
						: "Texts"
				}
				hint={textsHint}
			>
				<Switch
					label="Invitations by text"
					checked={draft.texts}
					disabled={!person.textablePhone || blocked || phoneChanged}
					onChange={(value) => onEdit({ texts: value })}
				/>
			</SettingRow>
			{channels.length > 1 ? (
				<SettingRow
					title="Invitations and reminders by"
					hint={
						draft.contactBy === null
							? `Our pick for ${mine ? "you" : "them"}, for now.`
							: undefined
					}
				>
					<div className="w-full sm:w-auto sm:min-w-[260px]">
						<Segmented
							legend="Invitations and reminders by"
							name={`${id}-contact-by`}
							options={channels.map((c) => ({
								value: c,
								label: CHANNEL_LABEL[c],
							}))}
							value={shownChannel(draft)}
							onChange={(value) => onEdit({ contactBy: value })}
						/>
					</div>
				</SettingRow>
			) : null}
			{isHost ? (
				<SettingRow
					title="Reply alerts by"
					hint={`When a guest answers an event ${mine ? "you host" : "they host"}. Same follows ${whose} choice above.`}
				>
					<div className="w-full sm:w-auto sm:min-w-[340px]">
						<Segmented
							legend="Reply alerts by"
							name={`${id}-alerts-by`}
							options={[
								{ value: "same", label: "Same" },
								...(["email", "text", "both"] as const).map((c) => ({
									value: c,
									label: CHANNEL_LABEL[c],
								})),
							]}
							value={draft.alertsBy ?? "same"}
							onChange={(value) =>
								onEdit({ alertsBy: value === "same" ? null : value })
							}
						/>
					</div>
				</SettingRow>
			) : null}
		</>
	);
}
