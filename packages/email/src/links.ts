/**
 * Links in list emails sign the reader in. Every one of them carries that
 * person's `link_token`, which Brevo substitutes per recipient, so the URL
 * built here is a template until it leaves the building.
 */

import { PARAM } from "./render";

/**
 * A sign-in link back to the site. `path` is where they land afterwards.
 * Never use it for a cover photo: those get fetched and shared.
 */
export function emailLink(siteUrl: string, path: string): string {
	return `${siteUrl}/api/auth/link?k=${PARAM.key}&to=${encodeURIComponent(path)}`;
}

/** The three answers an invitation offers. */
export type RsvpAnswer = "yes" | "maybe" | "no";

/** An event's own page, signing the reader in on the way. */
export function eventLink(siteUrl: string, eventId: string): string {
	return emailLink(siteUrl, `/e/${eventId}`);
}

/**
 * An answer button in an invitation. Signs the reader in and lands them on
 * the event page with that answer picked but not saved, because mail
 * clients fetch these links unprompted -- the same reason the unsubscribe
 * footer does not act on a GET. Nothing is recorded until a human taps.
 */
export function rsvpLink(
	siteUrl: string,
	eventId: string,
	answer: RsvpAnswer,
): string {
	return emailLink(siteUrl, `/e/${eventId}?a=${answer}`);
}

/**
 * A cover photo's public address. Deliberately carries no token: images are
 * fetched by mail proxies and pasted around, and anyone holding the URL has
 * seen nothing but a picture.
 */
export function coverUrl(siteUrl: string, coverKey: string): string {
	// Keys are `covers/<random>.<ext>`, so this is /api/covers/<random>.<ext>.
	return `${siteUrl}/api/${coverKey}`;
}

/** A design's card image, public for the same reasons as a cover. */
export function cardUrl(siteUrl: string, cardKey: string): string {
	// Keys are `designs/<event id>/card-<random>.jpg`.
	return `${siteUrl}/api/${cardKey}`;
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
