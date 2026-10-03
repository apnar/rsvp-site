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

/** "Oct 2, 3:15 PM" for a moment such as when something was sent. */
export function when(value: Date | string): string {
	return new Date(value).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
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

/** "Josh" from "Josh Lukens". */
export function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] ?? name;
}

/** "In" from "in". */
export function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Whether a typed search finds somebody. Addresses are stored lowercase, so
 * only the query needs folding.
 */
export function matchesPerson(
	p: { name: string; email: string },
	query: string,
): boolean {
	const q = query.trim().toLowerCase();
	return !q || p.name.toLowerCase().includes(q) || p.email.includes(q);
}

/** "The Nguyens, Priya S., the Okafors, Coach Dana and 38 more" */
export function crowdLine(names: string[], shown = 4): string {
	if (names.length === 0) return "";
	if (names.length <= shown) {
		return names.length === 1
			? (names[0] ?? "")
			: `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
	}
	return `${names.slice(0, shown).join(", ")} and ${names.length - shown} more`;
}

/** End with a period, unless a name already did ("Marcus T."). */
export function sentence(text: string): string {
	return /[.!?]$/.test(text) ? text : `${text}.`;
}
