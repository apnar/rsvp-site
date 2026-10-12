import type { ContactChannel } from "@rsvp-site/db/schema/auth";

/** "How we reach you" as a form holds it: two switches and two choices. */
export type Reach = {
	email: boolean;
	texts: boolean;
	contactBy: ContactChannel | null;
	alertsBy: ContactChannel | null;
};

/**
 * Where somebody stands, as switches: email is on only with a real address
 * and no unsubscribe, texts only with consent and no block on the number.
 */
export function savedReach(p: {
	email: string;
	unsubscribedAt: Date | null;
	textsOn: boolean;
	textBlock: string | null;
	contactBy: ContactChannel | null;
	alertsBy: ContactChannel | null;
}): Reach {
	return {
		email: Boolean(p.email) && p.unsubscribedAt === null,
		texts: p.textsOn && p.textBlock === null,
		contactBy: p.contactBy,
		alertsBy: p.alertsBy,
	};
}

/**
 * Only the touched fields that differ from what is saved, so a Save writes
 * nothing it wasn't asked to and an untouched form has nothing to save.
 */
export function reachPatch(
	saved: Reach,
	edits: Partial<Reach>,
): Partial<Reach> {
	return Object.fromEntries(
		Object.entries(edits).filter(([k, v]) => saved[k as keyof Reach] !== v),
	) as Partial<Reach>;
}

/** The channel invitations go by: the choice made, or the site's pick. */
export function shownChannel(draft: Reach): ContactChannel {
	return draft.contactBy ?? (draft.email ? "email" : "text");
}

/**
 * The channels worth offering: those that can work with the switches as
 * they stand, plus the one already chosen, so the picker never shows
 * nothing selected.
 */
export function offeredChannels(draft: Reach): ContactChannel[] {
	const chosen = shownChannel(draft);
	return (["email", "text", "both"] as const).filter((c) =>
		c === chosen
			? true
			: c === "email"
				? draft.email
				: c === "text"
					? draft.texts
					: draft.email && draft.texts,
	);
}
