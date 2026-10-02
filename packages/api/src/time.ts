/**
 * The site's clock. Pure: no drizzle, no Worker env, so the web app bundles
 * it too. Every event date is a YYYY-MM-DD and every time an HH:MM on this
 * clock; compare with these helpers, never with `Date`.
 */

/** The one timezone the site runs on. Event dates are calendar days here. */
export const SITE_TIMEZONE = "America/New_York";

/** Today's date on the site's clock as YYYY-MM-DD. */
export function todayOnSite(now: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: SITE_TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(now);
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Current wall-clock time on the site's clock as HH:MM (24-hour). */
export function timeOnSite(now: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: SITE_TIMEZONE,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(now);
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value ?? "00";
	return `${get("hour")}:${get("minute")}`;
}

/**
 * How far the site's wall clock is ahead of UTC at a given instant, in ms.
 * Reading the zone's own rendering of the instant is the only way to ask
 * without a date library, and there is no date library here.
 */
function offsetAt(ts: number): number {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: SITE_TIMEZONE,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(new Date(ts));
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((p) => p.type === type)?.value ?? 0);
	return (
		Date.UTC(
			get("year"),
			get("month") - 1,
			get("day"),
			get("hour"),
			get("minute"),
			get("second"),
		) - ts
	);
}

/**
 * The instant a YYYY-MM-DD plus an HH:MM on the site's wall clock actually
 * happens. Two passes: guess the offset by reading the wall clock as if it
 * were UTC, then re-read it at the corrected instant. The second pass is the
 * whole point -- it is what gets the week after a daylight-saving switch
 * right, when the offset differs between a reminder and the event itself.
 *
 * The twice-yearly oddities resolve the boring way: an ambiguous time (the
 * repeated 1:30 AM in November) lands on the first of the two, an impossible
 * one (2:30 AM in March) lands an hour on. No scheduled email goes out
 * anywhere near 2 AM, so neither comes up.
 */
export function siteInstant(date: string, time: string): Date {
	const [y = 0, mo = 1, d = 1] = date.split("-").map(Number);
	const [h = 0, mi = 0] = time.split(":").map(Number);
	const wall = Date.UTC(y, mo - 1, d, h, mi);
	const guess = wall - offsetAt(wall);
	return new Date(wall - offsetAt(guess));
}

/**
 * `n` days from a YYYY-MM-DD, as a YYYY-MM-DD. The arithmetic is done in UTC
 * on a date-only value on purpose: a day is 24 hours there, always, so a
 * daylight-saving Sunday cannot turn "the day before" into the same day.
 */
export function addDays(date: string, n: number): string {
	const [y = 0, mo = 1, d = 1] = date.split("-").map(Number);
	return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

/** "Mon, Sep 14" for a YYYY-MM-DD date. */
export function formatDate(date: string): string {
	return new Intl.DateTimeFormat("en-US", {
		timeZone: "UTC",
		weekday: "short",
		month: "short",
		day: "numeric",
	}).format(new Date(`${date}T12:00:00Z`));
}

/** "9:00 PM" for an HH:MM 24-hour time. */
export function formatTime(time: string): string {
	const [h = 0, m = 0] = time.split(":").map(Number);
	const suffix = h >= 12 ? "PM" : "AM";
	const hour12 = h % 12 === 0 ? 12 : h % 12;
	return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "5:00 PM - 10:00 PM", "5:00 PM", or null when there is no start. */
export function formatTimeRange(
	start: string | null,
	end: string | null,
): string | null {
	if (!start) return null;
	return end ? `${formatTime(start)} - ${formatTime(end)}` : formatTime(start);
}

/**
 * Whole calendar days from one YYYY-MM-DD to another (negative if `to` is
 * earlier). Same UTC date-only trick as `addDays`, for the same reason.
 */
export function daysBetween(from: string, to: string): number {
	const at = (d: string) => {
		const [y = 0, mo = 1, day = 1] = d.split("-").map(Number);
		return Date.UTC(y, mo - 1, day);
	};
	return Math.round((at(to) - at(from)) / 86_400_000);
}
