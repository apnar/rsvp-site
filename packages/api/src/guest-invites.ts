/**
 * Who may bring whom. Pure, so the invite page and the API apply the same
 * rule.
 *
 * Only somebody the host chose -- typed in, or from one of the host's
 * groups -- may invite others. Whoever they add, and whoever came in on the
 * share link, may not: one level down and no further, so a guest list can
 * grow by friends of the host's guests but never by friends of friends.
 */

export type GuestSource = "host" | "group" | "guest" | "link";

export function canInviteOthers(source: GuestSource): boolean {
	return source === "host" || source === "group";
}

/** How many more a guest may invite. Never negative, even if the cap drops. */
export function invitesLeft(limit: number, used: number): number {
	return Math.max(0, Math.trunc(limit) - used);
}
