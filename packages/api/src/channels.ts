import type { ContactChannel } from "@rsvp-site/db/schema/auth";

/** What decides how one person hears from us. */
export type Reach = {
	/** `mailableWhere`: active, subscribed, a real address. */
	mailable: boolean;
	/** `textableWhere`: active, consent on record, texts on, number not blocked. */
	textable: boolean;
	contactBy: ContactChannel | null;
	alertsBy: ContactChannel | null;
};

/** Guest mail (invitations, reminders, changes) or a host's reply alerts. */
export type Purpose = "guest" | "alerts";

type Channels = { email: boolean; text: boolean };

/**
 * Which channels one message goes by. The person's choice first, then the
 * default: email when they can get it, a text when they can't. A channel
 * they can't be reached on falls back to the other, so "text me" from
 * somebody whose phone later says STOP still gets the email -- but never
 * to a channel they switched off, which `mailable` and `textable` already
 * leave out.
 */
export function channelsFor(p: Reach, purpose: Purpose): Channels {
	const choice =
		purpose === "alerts" ? (p.alertsBy ?? p.contactBy) : p.contactBy;
	if (choice === "both") return { email: p.mailable, text: p.textable };
	if (choice === "text" && p.textable) return { email: false, text: true };
	if (p.mailable) return { email: true, text: false };
	return { email: false, text: p.textable };
}

export type Via = "email" | "text" | "both";

/** The channels, as `event_guest.invited_via` records them. */
export function viaOf(c: Channels): Via | null {
	if (c.email && c.text) return "both";
	if (c.email) return "email";
	if (c.text) return "text";
	return null;
}
