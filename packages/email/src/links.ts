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
 * A stored picture's public address: a cover photo (`covers/<random>.<ext>`)
 * or a design's card image (`designs/<event id>/card-<random>.jpg`).
 * Deliberately carries no token: images are fetched by mail proxies and
 * pasted around, and anyone holding the URL has seen nothing but a picture.
 */
export function mediaUrl(siteUrl: string, key: string): string {
	return `${siteUrl}/api/${key}`;
}

/**
 * Where a sign-in link may drop someone: somewhere on this site, never off
 * it. The path is resolved the way a browser would resolve it and only kept
 * if it stays on the site, because string checks lose to the URL parser's
 * own quirks: it drops tabs and newlines and reads "\\" as "/", so
 * "/\t/evil.com" is "//evil.com" by the time anything follows it.
 */
export function safeReturnPath(to: unknown): string {
	if (typeof to !== "string" || !to.startsWith("/")) return "/";
	let url: URL;
	try {
		url = new URL(to, HOME);
	} catch {
		return "/";
	}
	if (url.origin !== HOME) return "/";
	// Dot segments collapse during that resolve: "/.//evil.com" comes out
	// as the path "//evil.com", which a browser then reads as another site.
	if (url.pathname.startsWith("//")) return "/";
	return `${url.pathname}${url.search}${url.hash}`;
}

/** A stand-in origin to resolve against; only "is it still this one" matters. */
const HOME = "https://site.invalid";
