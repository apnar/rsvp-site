/**
 * Facts about the event that the API needs. Copy lives in apps/web/src/content.
 */

/**
 * How many names the sheet takes, guests included: the most the venue can
 * comfortably hold before the sheet becomes a waiting list.
 */
export const CAPACITY = 15;

/** The venue's timezone. Game dates are calendar days here. */
export const RUN_TIMEZONE = "America/New_York";

/** Today's date in the venue's timezone as YYYY-MM-DD. */
export function todayInRunTimezone(now: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: RUN_TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(now);
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value ?? "";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Current wall-clock time in the venue's timezone as HH:MM (24-hour). */
export function timeInRunTimezone(now: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: RUN_TIMEZONE,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(now);
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value ?? "00";
	return `${get("hour")}:${get("minute")}`;
}

/**
 * How far the venue's wall clock is ahead of UTC at a given instant, in ms.
 * Reading the zone's own rendering of the instant is the only way to ask
 * without a date library, and there is no date library here.
 */
function offsetAt(ts: number): number {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: RUN_TIMEZONE,
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
 * The instant a YYYY-MM-DD plus an HH:MM on the venue's wall clock actually
 * happens. Two passes: guess the offset by reading the wall clock as if it
 * were UTC, then re-read it at the corrected instant. The second pass is the
 * whole point -- it is what gets the week after a daylight-saving switch
 * right, when the offset differs between the evening before a game and the
 * game itself.
 *
 * The twice-yearly oddities resolve the boring way: an ambiguous time (the
 * repeated 1:30 AM in November) lands on the first of the two, an impossible
 * one (2:30 AM in March) lands an hour on. Nothing in the cycle runs anywhere
 * near 2 AM, so neither has ever come up.
 */
export function runInstant(date: string, time: string): Date {
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
export function formatGameDate(date: string): string {
	return new Intl.DateTimeFormat("en-US", {
		timeZone: "UTC",
		weekday: "short",
		month: "short",
		day: "numeric",
	}).format(new Date(`${date}T12:00:00Z`));
}

/** "9:00 PM" for an HH:MM 24-hour time. */
export function formatGameTime(time: string): string {
	const [h = 0, m = 0] = time.split(":").map(Number);
	const suffix = h >= 12 ? "PM" : "AM";
	const hour12 = h % 12 === 0 ? 12 : h % 12;
	return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Normalises a typed name for the uniqueness key. */
export function nameKeyOf(name: string): string {
	return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Whether a session user may manage games, permits and roles. */
export function isAdmin(
	user: { role?: string | null } | null | undefined,
): boolean {
	return user?.role === "admin";
}
