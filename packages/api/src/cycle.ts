/**
 * The RSVP cycle: what the event asks the list, when, and what it does with the
 * answers. This is the only place those facts exist. The job runs off it, the
 * admin write-up page renders it, and the numbers below are interpolated into
 * both -- so the page cannot describe a schedule the code is not keeping.
 *
 * Pure by design: nothing here may import drizzle, the Worker env, or anything
 * that reaches them, because the web app pulls this into the client bundle.
 */

import type { EmailKind } from "@rsvp-site/db/schema/email";

import { CAPACITY } from "./run";

/** Enough yeses to confirm, and the one that gets there confirms early. */
export const CONFIRM_AT = 10;

/** The fewest guests the event goes ahead with. One fewer and it is off. */
export const PLAY_AT = 8;

/**
 * No two cycle emails about the same game land closer than this. A game
 * booked at four on the day itself would otherwise fire four stages in one minute,
 * one of which accuses the reader of ignoring a message they never got.
 */
export const STAGE_COOLDOWN_MINUTES = 90;

export type StageKey = "call" | "nudge" | "confirmed" | "lastCall" | "final";

/** The `game` column that records a stage as resolved. */
export type StageColumn =
	| "callAt"
	| "nudgeAt"
	| "confirmedAt"
	| "lastCallAt"
	| "decidedAt";

export type Stage = {
	key: StageKey;
	/** "01".."05", for the write-up. */
	num: string;
	column: StageColumn;
	kind: EmailKind;
	/** Days from the game's date. -1 is the evening before. */
	dayOffset: number;
	/** HH:MM on the venue's clock, or null when a count fires it, not the clock. */
	at: string | null;
	/* The write-up, rendered by /admin/cycle. Nobody types these twice. */
	when: string;
	who: string;
	title: string;
	says: string;
	aside: string;
};

export const STAGES: readonly Stage[] = [
	{
		key: "call",
		num: "01",
		column: "callAt",
		kind: "rsvp_call",
		dayOffset: -1,
		at: "17:00",
		when: "5:00 PM, the day before",
		who: "Everybody on the list",
		title: "The ask",
		says: "There is an event tomorrow, here is the venue, and here are three buttons: in, out, maybe.",
		aside:
			"Three buttons, because two is never enough hedging for a guest list.",
	},
	{
		key: "nudge",
		num: "02",
		column: "nudgeAt",
		kind: "rsvp_nudge",
		dayOffset: 0,
		at: "14:00",
		when: "2:00 PM on the day",
		who: "Only the people who have not answered",
		title: "The prod",
		says: `Sent only if fewer than ${CONFIRM_AT} are in. Carries the names of everyone who already said yes. Anybody who has answered is left alone.`,
		aside: "Silence is not an answer. It is a slower one.",
	},
	{
		key: "confirmed",
		num: "03",
		column: "confirmedAt",
		kind: "rsvp_confirmed",
		dayOffset: 0,
		at: null,
		when: `the moment the ${CONFIRM_AT}th yes lands`,
		who: "Everyone who said in or maybe",
		title: "It's on",
		says: `The ${CONFIRM_AT}th yes confirms the event, whatever time it arrives. Fires once and never un-fires.`,
		aside: `${CONFIRM_AT} is enough people to go ahead with room to spare.`,
	},
	{
		key: "lastCall",
		num: "04",
		column: "lastCallAt",
		kind: "rsvp_last_call",
		dayOffset: 0,
		at: "18:00",
		when: "6:00 PM on the day",
		who: "The maybes, and the ones who still have not answered",
		title: "Last call",
		says: `Sent only if we are still short of ${CONFIRM_AT}. This is the email that exists to turn a maybe into a number.`,
		aside: "The maybes get one more chance to become a person with an opinion.",
	},
	{
		key: "final",
		num: "05",
		column: "decidedAt",
		kind: "rsvp_final",
		dayOffset: 0,
		at: "19:30",
		when: "7:30 PM on the day",
		who: "Everyone who answered. If it is off, everybody else too.",
		title: "The verdict",
		says: `${PLAY_AT} or more in and the event is on. Fewer and it is off. If it was already on and still is, nothing is sent -- the answer has not changed.`,
		aside: "Late enough to count everyone, early enough to make other plans.",
	},
];

/** The stages a clock fires. Stage 03 is fired by a count, so it is not here. */
export const CLOCK_STAGES: readonly Stage[] = STAGES.filter(
	(s) => s.at !== null,
);

export const STAGE = Object.fromEntries(
	STAGES.map((s) => [s.key, s]),
) as Record<StageKey, Stage>;

/** The numbers, for the write-up. Same constants the job counts with. */
export const CYCLE_NUMBERS = [
	{
		value: CONFIRM_AT,
		label: "Confirm",
		body: `The ${CONFIRM_AT}th yes confirms the event early and stops the reminders.`,
	},
	{
		value: PLAY_AT,
		label: "Minimum",
		body: "Enough people to go ahead. Below that the event is called off.",
	},
	{
		value: CAPACITY,
		label: "Capacity",
		body: "As many as the venue holds. Past that it is a waiting list.",
	},
] as const;
