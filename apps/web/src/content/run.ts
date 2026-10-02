/**
 * Copy and standing data for the site. Edit here; the pages read from it.
 */

export const SITE_NAME = "RSVP";

/**
 * Prefilled start time (24-hour) when an admin books an event. Not earlier
 * than 8: the cycle in packages/api/src/cycle.ts still calls the verdict at
 * a fixed 7:30, and a verdict due after the start is resolved silently.
 */
export const DEFAULT_START_TIME = "20:00";

/** Prefilled end time (24-hour) when an admin books an event. */
export const DEFAULT_END_TIME = "23:00";

export const conditions = [
	{
		num: "01",
		prop: "Date",
		val: "On the invitation",
		rem: "Every event has its own. The schedule lists what is booked.",
	},
	{
		num: "02",
		prop: "Start",
		val: "7:00 - 10:00 PM",
		rem: "Unless the invitation says otherwise. Fashionably late is fine.",
	},
	{
		num: "03",
		prop: "Venue",
		val: "Named on the invitation",
		rem: "Address, parking and which door, sent to the guest list.",
	},
	{
		num: "04",
		prop: "RSVP",
		val: "In · out · maybe",
		rem: "One click from the email. Change it any time before the final call.",
	},
	{
		num: "05",
		prop: "Plus-ones",
		val: "On the sheet",
		rem: "Add them by name so the host can count chairs.",
	},
] as const;

/**
 * The house rules, in the order they matter. Numbered where they are
 * rendered, not here, so adding one at the top does not mean retyping the
 * numbers on all the rest.
 */
export const rules = [
	{
		title: "Answer the invite",
		body: "In, out or maybe, one click from the email. A maybe beats silence: silence is how a host ends up with forty sandwiches and six guests.",
	},
	{
		title: "Be a good guest",
		body: "Covers the arguing, the phone on speaker, and whatever you were about to do that is not on this list.",
	},
	{
		title: "Plans change, so change the sheet",
		body: "Something came up? Switch to out. The count is only useful if it is honest, and the host plans around it.",
	},
	{
		title: "Plus-ones go on the sheet",
		body: "Add them by name before the day. Nobody minds a plus-one; everybody minds a surprise.",
	},
	{
		title: "The host's place, the host's rules",
		body: "If the host says shoes off, shoes come off. If the host says it is time to go, it is time to go.",
	},
	{
		title: "Leave it the way you found it",
		body: "Or better. Glasses to the kitchen, coats off the bed, and nobody leaves the venue a mess.",
	},
	{
		title: "Don't forward your email",
		body: "The links in it sign you in as you. Want a friend to come? Ask the host to add them.",
	},
] as const;
