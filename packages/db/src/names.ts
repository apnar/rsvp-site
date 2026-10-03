/** The longest name part kept, so a pasted paragraph can't become a name. */
export const NAME_MAX = 60;

const cap = (s: string) => s.slice(0, NAME_MAX).trim();

/**
 * A typed name, as first and last: the last word is the last name and
 * everything before it the first ("Linh & Marcus Nguyen" is Linh & Marcus,
 * Nguyen). One word is a first name. A household ("The Parks") is all first
 * name, so "Dear {first name}" reads "Dear The Parks", not "Dear The".
 */
export function splitName(raw: string): {
	firstName: string;
	lastName: string;
} {
	const name = raw.replace(/\s+/g, " ").trim();
	const cut = name.lastIndexOf(" ");
	if (cut < 0 || /^the\s/i.test(name)) {
		return { firstName: cap(name), lastName: "" };
	}
	return {
		firstName: cap(name.slice(0, cut)),
		lastName: cap(name.slice(cut + 1)),
	};
}

/** The pair as one name, for `user.name` and everything that reads it. */
export function displayName(firstName: string, lastName: string): string {
	return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

/**
 * What `user.name` holds for a pair: the pair itself, or, for somebody
 * nobody has named, the part of their address before the @.
 */
export function nameFor(
	firstName: string,
	lastName: string,
	email: string,
): string {
	return displayName(firstName, lastName) || email.split("@")[0] || email;
}

/**
 * The first name to put on a card. Somebody nobody has named has only the
 * name made from their address, which beats a blank "Dear ,".
 */
export function firstNameOf(row: { firstName: string; name: string }): string {
	return row.firstName || row.name;
}
