/**
 * The countdown's arithmetic, apart from the clock and the React that ticks
 * it, so it can be tested without either.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The first tile: days, hours or minutes to go, or "Now" once it started. */
export function countdownTile(remainingMs: number): {
	value: string;
	label: string;
} {
	if (remainingMs <= 0) return { value: "Now", label: "party on" };
	if (remainingMs >= DAY) {
		const days = Math.floor(remainingMs / DAY);
		return { value: String(days), label: days === 1 ? "day" : "days" };
	}
	if (remainingMs >= HOUR) {
		const hours = Math.floor(remainingMs / HOUR);
		return { value: String(hours), label: hours === 1 ? "hour" : "hours" };
	}
	return {
		value: String(Math.max(1, Math.floor(remainingMs / MINUTE))),
		label: "minutes",
	};
}

/**
 * How long until a tile could next change, or null once the party has
 * started. Minutes are the finest unit shown, so the clock steps on the
 * whole minute of the *target* (every other unit changes on one too)
 * instead of ticking each second for nothing.
 */
export function nextTickDelay(remainingMs: number): number | null {
	if (remainingMs <= 0) return null;
	// A timer can fire a hair early; the extra 25ms keeps it from landing
	// just short of the boundary and showing the old minute for another one.
	return (remainingMs % MINUTE || MINUTE) + 25;
}
