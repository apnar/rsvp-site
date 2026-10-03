/**
 * Who may bring whom. Pure, so the invite page and the API apply the same
 * rule.
 *
 * Only somebody the host chose -- typed in, or from one of the host's
 * groups -- may invite others. Whoever they add, and whoever came in on the
 * share link, may not: one level down and no further, so a guest list can
 * grow by friends of the host's guests but never by friends of friends.
 */

import type { GuestSource } from "@rsvp-site/db/schema/event";

import { emailsHeld, openRefusal } from "./event-rules";
import type { EventRow } from "./events";

export type { GuestSource };

export function canInviteOthers(source: GuestSource): boolean {
	return source === "host" || source === "group";
}

/** How many more a guest may invite. Never negative, even if the cap drops. */
export function invitesLeft(limit: number, used: number): number {
	return Math.max(0, Math.trunc(limit) - used);
}

export type InviteRefusal = {
	code: "FORBIDDEN" | "BAD_REQUEST";
	message: string;
};

/**
 * Why this guest cannot invite a friend to this event right now, or null.
 * The API refuses with it and the invite page hides the form on it, so the
 * form shows only when the API would take it.
 */
export function inviteRefusal(
	row: Pick<
		EventRow,
		| "status"
		| "date"
		| "startTime"
		| "guestInvites"
		| "paper"
		| "emailsReleasedAt"
	>,
	guest: { source: GuestSource } | null,
	now: number = Date.now(),
): InviteRefusal | null {
	if (!guest || !canInviteOthers(guest.source)) {
		return {
			code: "FORBIDDEN",
			message: "Only guests the hosts invited can invite others.",
		};
	}
	if (!row.guestInvites) {
		return {
			code: "FORBIDDEN",
			message: "The hosts aren't taking extra guests for this one.",
		};
	}
	// The friend's invitation goes out by email at once; a paper event holds
	// all guest email until the hosts release it.
	if (emailsHeld(row)) {
		return {
			code: "BAD_REQUEST",
			message: "Invitations for this one aren't going out by email yet.",
		};
	}
	const closed = openRefusal(row, now);
	return closed ? { code: "BAD_REQUEST", message: closed } : null;
}
