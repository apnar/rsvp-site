/**
 * The copy that describes where an RSVP drive stands. One place, because it
 * is read on the board, on the confirm page a cycle email lands on, and in
 * the emails themselves -- and three copies of a joke drift into three
 * different jokes.
 */

import type { Headcount } from "@rsvp-site/api/routers/rsvp";

export type RsvpAnswer = "in" | "maybe" | "out";

export const ANSWERS: readonly RsvpAnswer[] = ["in", "maybe", "out"];

export type Counts = Headcount["counts"];

/** The one line at the top. First match wins. */
export function headline(
	counts: Counts,
	limits: { confirmAt: number; playAt: number; capacity: number },
	status: "scheduled" | "confirmed" | "canceled",
	decided: boolean,
): string {
	if (status === "canceled") {
		return "Called off. Not enough people this time.";
	}
	if (status === "confirmed") {
		return decided
			? "It's on. See you there."
			: `It's on. ${limits.confirmAt} said yes.`;
	}
	if (counts.in >= limits.capacity) return "The sheet is full.";
	if (counts.in >= limits.confirmAt) return "It's on. Barely.";
	if (counts.in >= limits.playAt)
		return "Enough to go ahead. Not enough to relax.";
	if (counts.in >= 5) return "Getting there. A few more would do it.";
	return "Not on yet. Right now it's a small dinner.";
}

/**
 * The next threshold, in words, always with a number in it.
 *
 * The sheet holds more than the number that confirms an event, so "five spots
 * left" and "three more to go" are both true at once and together they are
 * gibberish. Lead with the number that decides whether it happens at all,
 * and only mention spots once there is one.
 */
export function subline(
	counts: Counts,
	limits: { confirmAt: number; playAt: number; capacity: number },
	status: "scheduled" | "confirmed" | "canceled",
): string {
	const plural = (n: number, one: string, many: string) =>
		n === 1 ? one : many;

	if (status === "canceled") {
		return `${counts.in} in at the final call. ${limits.playAt} was the number. Next time, then.`;
	}
	if (status === "confirmed") {
		const spare = counts.in - limits.playAt + 1;
		if (counts.in >= limits.capacity) {
			return "Full house. Anybody else is on the waiting list.";
		}
		return `It stays on unless ${spare} of you ${plural(spare, "gets", "get")} cute before 7:30.`;
	}
	if (counts.in >= limits.playAt) {
		const need = limits.confirmAt - counts.in;
		const maybes = counts.maybe
			? ` ${counts.maybe} ${plural(counts.maybe, "maybe does", "maybes do")} not count; a maybe is a mailing list.`
			: "";
		return `${need} more ${plural(need, "yes", "yeses")} and it locks.${maybes}`;
	}
	const short = limits.playAt - counts.in;
	const quiet = counts.silent
		? ` ${counts.silent} ${plural(counts.silent, "person has", "people have")} not said a word.`
		: " Everybody answered. Put it in the trophy case.";
	return `${short} short of the minimum.${quiet}`;
}

/** What the viewer's own answer means for them, under the picker. */
export function yourLine(answer: RsvpAnswer | null, locked: boolean): string {
	if (locked) return "Called at 7:31. Nothing you tap now changes it.";
	switch (answer) {
		case "in":
			return "In. Changing this after 6 PM is public record.";
		case "maybe":
			return "Maybe does not count toward the total. It keeps you on the emails, and that is the whole job.";
		case "out":
			return "Out. Noted, filed, read aloud.";
		default:
			return "Nothing from you yet. The list notices.";
	}
}

/**
 * How keen the event is on you bringing somebody.
 *
 * Guests are a remedy for being short, not a feature: the list gets asked five
 * times over two days and usually fills itself, and a box that reads the same
 * at five o'clock as it does at seven quietly suggests every event needs
 * padding. Nothing here stops anybody -- you can always put a name in, and the
 * night you already promised your brother-in-law is not the night to argue
 * with a form. Only the tone moves.
 */
export function guestLine(
	counts: Counts,
	limits: { confirmAt: number; playAt: number; capacity: number },
	lastCallPassed: boolean,
	locked: boolean,
): string {
	if (locked) {
		return "The count is closed. Whoever you were bringing, tell them yourself.";
	}
	if (counts.in >= limits.confirmAt) {
		return `${counts.in} in. The list handled it, so anybody you bring now is a bonus, not a rescue.`;
	}
	if (!lastCallPassed) {
		return "The list has until six to sort itself out, and it usually does. Put a name in now and you are guessing.";
	}
	const short = limits.confirmAt - counts.in;
	return `Six has come and gone and we are ${short} short. Now is the time to bring somebody.`;
}
