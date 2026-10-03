import { templateAssetUrl } from "@rsvp-site/design/templates/index";
/**
 * Small display helpers. Every date is formatted on the site's clock, never
 * the browser's, so the server render and the hydrated page agree.
 */

import { SITE_TIMEZONE } from "@rsvp-site/api/time";

/** "JL" from "Josh Lukens", "J" from "josh". */
export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const first = parts[0]?.[0] ?? "?";
	const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
	return (first + last).toUpperCase();
}

/** "12m", "3h", "2d", against a clock seeded from the server. */
export function since(when: Date | string, nowMs: number): string {
	const ms = nowMs - new Date(when).getTime();
	const minutes = Math.max(0, Math.floor(ms / 60_000));
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
}

/** "12 min ago", "3 hours ago", "just now". */
export function ago(when: Date | string, nowMs: number): string {
	const minutes = Math.max(
		0,
		Math.floor((nowMs - new Date(when).getTime()) / 60_000),
	);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
	const days = Math.floor(hours / 24);
	return days === 1 ? "yesterday" : `${days} days ago`;
}

/** "Friday, Oct 2" for the dashboard kicker. */
export function longDay(nowIso: string): string {
	return new Date(nowIso).toLocaleDateString("en-US", {
		weekday: "long",
		month: "short",
		day: "numeric",
		timeZone: SITE_TIMEZONE,
	});
}

/** "Sep 30" for an invitation stamp. */
export function shortDate(when: Date | string): string {
	return new Date(when).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: SITE_TIMEZONE,
	});
}

/** "In 22 days", "Tomorrow", "Today", "3 days ago" between YYYY-MM-DD dates. */
export function inDays(days: number): string {
	if (days === 0) return "Today";
	if (days === 1) return "Tomorrow";
	if (days === -1) return "Yesterday";
	return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** The public address of a cover photo, token-free. */
export function coverSrc(coverKey: string): string {
	return `/api/${coverKey}`;
}

/**
 * The public address of a design image or card (designs/<id>/<name>), or,
 * for a template not yet picked, of the picture it ships with.
 */
export function designSrc(ref: string): string {
	return templateAssetUrl(ref) ?? `/api/${ref}`;
}
