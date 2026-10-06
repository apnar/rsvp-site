/**
 * Whether the text has a phone number on a line, and whether some line has
 * only one (no "@"). The server is the judge of what parses; this only
 * decides when to ask the host for their word about texts, so a loose
 * "ten or more digits" test is enough.
 */
export function phoneLines(emails: string) {
	const phones = emails
		.split(/\r?\n|[;,]/)
		.filter((l) => (l.match(/\d/g) ?? []).length >= 10);
	return {
		any: phones.length > 0,
		phoneOnly: phones.some((l) => !l.includes("@")),
	};
}
