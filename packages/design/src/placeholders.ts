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
	"details",
	"guest",
	"guest's",
	"first name",
	"first name's",
	"last name",
] as const;

type Placeholder = (typeof PLACEHOLDERS)[number];

export type Values = {
	title: string;
	date: string;
	time: string;
	location: string;
	host: string;
	rsvpBy: string;
	/**
	 * The event's details: the ones that go everywhere, never the extra,
	 * page-only ones, since the card is printed and emailed.
	 */
	details: string;
	/** The addressee on paper, the signed-in guest on the page. */
	guest: string;
	/** The addressee's first name; {guest} stays the full display name. */
	guestFirst: string;
	/** The addressee's last name, empty for a guest with only one name. */
	guestLast: string;
};

/**
 * Which value each placeholder reads; {guest's} and {first name's} are
 * {guest} and {first name}, made possessive.
 */
const KEY: Record<Placeholder, keyof Values> = {
	title: "title",
	date: "date",
	time: "time",
	location: "location",
	host: "host",
	"rsvp by": "rsvpBy",
	details: "details",
	guest: "guest",
	"guest's": "guest",
	"first name": "guestFirst",
	"first name's": "guestFirst",
	"last name": "guestLast",
};

const POSSESSIVE: ReadonlySet<Placeholder> = new Set([
	"guest's",
	"first name's",
]);

// The possessive forms are matched before the plain ones, with a straight
// or curly apostrophe (a phone's keyboard types the curly one).
const PATTERN =
	/\{\s*(title|date|time|location|host|rsvp\s*by|details|guest['’]s|guest|first\s*name['’]s|first\s*name|last\s*name)\s*\}/gi;

function nameOf(raw: string): Placeholder {
	return raw
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace("’", "'") as Placeholder;
}

/**
 * A name made possessive, the way people write it rather than by always
 * adding 's: "Josh’s", "James’s", "Aly & Josh’s" (shared), but "The
 * Nguyens’" for a family, plural and named with "The". A name that is
 * already possessive is left alone, and one in capitals stays in capitals.
 */
export function possessive(name: string): string {
	const n = name.trimEnd();
	if (!n) return "";
	if (/['’]s$/i.test(n) || /s['’]$/i.test(n)) return n;
	const shouting = n === n.toUpperCase() && /[A-Z]/.test(n);
	if (/^the\s/i.test(n) && /s$/i.test(n)) return `${n}’`;
	return `${n}’${shouting ? "S" : "s"}`;
}

/** Fill the placeholders in; anything else in braces is left as typed. */
export function fill(text: string, values: Values): string {
	return text.replace(PATTERN, (_, raw: string) => {
		const name = nameOf(raw);
		const value = values[KEY[name]];
		return POSSESSIVE.has(name) ? possessive(value) : value;
	});
}

/** What a text element says once filled in, capitals applied. */
export function textContent(
	el: { text: string; upper?: boolean },
	values: Values,
): string {
	const content = fill(el.text, values);
	return el.upper ? content.toUpperCase() : content;
}

/** Whether a text reads that value ({guest's} counts as {guest}). */
export function usesPlaceholder(text: string, name: Placeholder): boolean {
	for (const m of text.matchAll(PATTERN)) {
		if (KEY[nameOf(m[1] ?? "")] === KEY[name]) return true;
	}
	return false;
}

/**
 * Whether a text reads anything about the addressee, so it differs per
 * guest: the page hides it in image mode and paper draws it per card.
 */
export function usesGuest(text: string): boolean {
	for (const m of text.matchAll(PATTERN)) {
		const key = KEY[nameOf(m[1] ?? "")];
		if (key === "guest" || key === "guestFirst" || key === "guestLast")
			return true;
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
	details:
		"Bring a blanket and a camp chair. Popcorn bar, then the movie under the stars.",
	guest: "The Nguyens",
	guestFirst: "Linh",
	guestLast: "Nguyen",
};
