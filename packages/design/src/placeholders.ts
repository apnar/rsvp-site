/**
 * The event facts a host can type into any text box: "Join us {date} at
 * {time}". The card follows the event, so changing the date in the event
 * editor changes the card without anybody reopening the designer.
 */

export const PLACEHOLDERS = [
	"title",
	"date",
	"time",
	"location",
	"host",
	"rsvp by",
	"guest",
] as const;

export type Placeholder = (typeof PLACEHOLDERS)[number];

export type Values = {
	title: string;
	date: string;
	time: string;
	location: string;
	host: string;
	rsvpBy: string;
	/** The addressee on paper, the signed-in guest on the page. */
	guest: string;
};

const KEY: Record<Placeholder, keyof Values> = {
	title: "title",
	date: "date",
	time: "time",
	location: "location",
	host: "host",
	"rsvp by": "rsvpBy",
	guest: "guest",
};

const PATTERN = /\{\s*(title|date|time|location|host|rsvp\s*by|guest)\s*\}/gi;

function keyOf(raw: string): keyof Values {
	return KEY[raw.toLowerCase().replace(/\s+/g, " ") as Placeholder];
}

/** Fill the placeholders in; anything else in braces is left as typed. */
export function fill(text: string, values: Values): string {
	return text.replace(PATTERN, (_, name: string) => values[keyOf(name)]);
}

export function usesPlaceholder(text: string, name: Placeholder): boolean {
	for (const m of text.matchAll(PATTERN)) {
		if (keyOf(m[1] ?? "") === KEY[name]) return true;
	}
	return false;
}

/** Stand-ins for the designer and the template picker. */
export const SAMPLE_VALUES: Values = {
	title: "Ava turns nine",
	date: "Saturday, October 24",
	time: "5:00 – 8:00 PM",
	location: "12 Linden Street",
	host: "The Parkers",
	rsvpBy: "Oct 17",
	guest: "The Nguyens",
};

export const BLANK_VALUES: Values = {
	title: "",
	date: "",
	time: "",
	location: "",
	host: "",
	rsvpBy: "",
	guest: "",
};
