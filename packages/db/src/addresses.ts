/** The form every address is stored and looked up in. */
export function normalizeEmail(raw: string): string {
	return raw.trim().toLowerCase();
}

const ADDRESS = /[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+/g;

/**
 * Pull addresses out of whatever a host pasted: commas, semicolons, new
 * lines, "Name <a@b.c>". Lower-cased and deduplicated, in the order given.
 * Anything without an @ and a dot after it is dropped rather than guessed at.
 * The name a mail client puts in front of an address is kept --
 * `"Linh Nguyen" <linh@x.com>` or `Linh Nguyen <linh@x.com>` -- so a pasted
 * list makes accounts with real names rather than the part before the @.
 */
export function parseAddresses(
	raw: string,
): { email: string; name: string | null }[] {
	const seen = new Set<string>();
	const out: { email: string; name: string | null }[] = [];
	let last = 0;
	for (const match of raw.matchAll(ADDRESS)) {
		const start = match.index ?? 0;
		// Whatever sits between the previous address and this one, after the
		// last separator, is this one's name -- if it is in angle brackets.
		const before = raw.slice(last, start);
		last = start + match[0].length;
		const email = normalizeEmail(match[0]);
		if (seen.has(email)) continue;
		seen.add(email);
		const bracketed = before.trimEnd().endsWith("<");
		const name = bracketed
			? (before.split(/[,;\n]/).at(-1) ?? "").replace(/[<>"']/g, "").trim()
			: "";
		out.push({ email, name: name && name.length <= 60 ? name : null });
	}
	return out;
}

/**
 * Split what a host pasted for a paper event into addresses and bare names:
 * a line with an address is the address (and the name in front of it);
 * a line without one is somebody to invite by name alone.
 */
export function parseGuestLines(raw: string): {
	addresses: { email: string; name: string | null }[];
	names: string[];
} {
	const addresses: { email: string; name: string | null }[] = [];
	const names: string[] = [];
	for (const line of raw.split(/\n+/)) {
		const found = parseAddresses(line);
		if (found.length > 0) addresses.push(...found);
		else {
			const name = line.replace(/[,;]+$/, "").trim();
			if (name) names.push(name.slice(0, 60));
		}
	}
	return { addresses, names };
}
