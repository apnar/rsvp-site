/**
 * Links in list emails sign the reader in. Every one of them carries that
 * person's `link_token`, which Brevo substitutes per recipient, so the URL
 * built here is a template until it leaves the building.
 */

import { PARAM } from "./render";

/**
 * A sign-in link back to the site. `path` is where they land afterwards.
 * Never use this for the permit PDF: that one gets shown to venue staff.
 */
export function emailLink(siteUrl: string, path: string): string {
	return `${siteUrl}/api/auth/link?k=${PARAM.key}&to=${encodeURIComponent(path)}`;
}

/** The three answers a cycle email offers. */
export type RsvpAnswer = "in" | "maybe" | "out";

/**
 * A button in a cycle email. Signs the reader in and lands them on a page
 * that asks the question again, because mail clients fetch these links
 * unprompted -- the same reason the unsubscribe footer stopped acting on a
 * GET. Nothing is recorded until a human taps the page.
 */
export function rsvpLink(
	siteUrl: string,
	gameId: string,
	answer: RsvpAnswer,
): string {
	return emailLink(siteUrl, `/rsvp/${gameId}?a=${answer}`);
}

/**
 * Where a sign-in link may drop someone: somewhere on this site, never off
 * it. Anything clever ("//evil.com", "https://evil.com", a smuggled newline)
 * lands on the home page instead.
 */
export function safeReturnPath(to: unknown): string {
	if (typeof to !== "string") return "/";
	if (!to.startsWith("/")) return "/";
	if (to.startsWith("//") || to.startsWith("/\\")) return "/";
	if (to.includes("://") || to.includes("\n") || to.includes("\r")) return "/";
	return to;
}
