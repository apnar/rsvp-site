import { splitName } from "./names";
import { normalizePhone } from "./phone";

/** The form every address is stored and looked up in. */
export function normalizeEmail(raw: string): string {
	return raw.trim().toLowerCase();
}

const ADDRESS = /[^\s<>,;"'()]+@[^\s<>,;"'()]+\.[^\s<>,;"'()]+/g;

// Starts at a digit, a + or an opening bracket and ends at a digit; whether
// it is really a number is `normalizePhone`'s call (7 to 15 digits).
const PHONE = /\+?\(?\d[\d\s().-]{5,}\d/g;

/** One person out of what a host typed. */
export type ParsedGuest = {
	email: string | null;
	firstName: string;
	lastName: string;
	phone: string | null;
};

/**
 * Where a line holding several addresses is cut between two of them: at
 * the last comma or semicolon in the gap that isn't inside quotes, so
 * `"Park, Bo" <bo@x.com>` keeps its comma. Before the cut is the earlier
 * person's (a phone typed after their address), after it the later one's
 * (the name in front of theirs).
 */
function cutIn(gap: string): number {
	let quoted = false;
	let cut = -1;
	for (let i = 0; i < gap.length; i++) {
		const c = gap[i];
		if (c === '"') quoted = !quoted;
		else if (!quoted && (c === "," || c === ";")) cut = i + 1;
	}
	return cut < 0 ? 0 : cut;
}

/** A line as the people in it: one each, unless it holds several addresses. */
function entriesOf(line: string): string[] {
	const found = [...line.matchAll(ADDRESS)];
	if (found.length <= 1) return [line];
	const starts = [0];
	for (let i = 1; i < found.length; i++) {
		const prev = found[i - 1];
		const next = found[i];
		if (!prev || !next) continue;
		const from = (prev.index ?? 0) + prev[0].length;
		starts.push(from + cutIn(line.slice(from, next.index ?? from)));
	}
	return starts.map((s, i) => line.slice(s, starts[i + 1]));
}

/**
 * The name left in an entry once its address and phone are out. A quoted
 * name is taken as it stands, and a quoted "Nguyen, Linh" -- how address
 * books export -- turned round; otherwise the leftover words, with the
 * brackets, separators and "cell:" labels around them dropped.
 */
function nameIn(rest: string): { firstName: string; lastName: string } {
	const quoted = /"([^"]*)"/.exec(rest)?.[1]?.trim();
	if (quoted) {
		const flipped = /^([^,]+),\s*([^,]+)$/.exec(quoted);
		return flipped
			? splitName(`${flipped[2]} ${flipped[1]}`)
			: splitName(quoted);
	}
	const name = rest
		.replace(/\b(?:mailto|e-?mail|cell|mobile|phone|tel)\b\s*:?/gi, " ")
		.replace(/[<>"()[\]{}]/g, " ")
		// Quote marks around a word, not the one in O'Brien.
		.replace(/(^|\s)['‘’]+|['‘’]+(?=\s|$)/g, "$1")
		.replace(/[,;|]/g, " ")
		.replace(/^[\s:–-]+|[\s:–-]+$/g, "");
	return splitName(name);
}

/** One entry's address, phone and name. */
function parseEntry(entry: string): ParsedGuest {
	const address = entry.match(ADDRESS)?.[0] ?? null;
	let rest = address ? entry.replace(address, " ") : entry;
	let phone: string | null = null;
	for (const m of rest.matchAll(PHONE)) {
		phone = normalizePhone(m[0]);
		if (phone) {
			rest = rest.replace(m[0], " ");
			break;
		}
	}
	return {
		email: address ? normalizeEmail(address) : null,
		phone,
		...nameIn(rest),
	};
}

/**
 * People out of whatever a host pasted: one per line, as "Linh Nguyen
 * <linh@x.com> 301-555-1212" or any order of those, or a mail client's
 * `"Linh" <linh@x.com>, "Bo" <bo@x.com>` all on one line. Each address is
 * kept once, at its first mention, lower-cased. A line with a name but no
 * address is somebody known by name alone (only paper events take them);
 * a line with neither -- a stray phone number, a mistyped "nobody@x" --
 * is dropped rather than guessed at.
 */
export function parseGuests(raw: string): ParsedGuest[] {
	const seen = new Set<string>();
	const out: ParsedGuest[] = [];
	for (const line of raw.split(/\r?\n/)) {
		for (const entry of entriesOf(line)) {
			const guest = parseEntry(entry);
			if (guest.email) {
				if (seen.has(guest.email)) continue;
				seen.add(guest.email);
			} else if (!guest.firstName || entry.includes("@")) {
				// A mistyped address is not a name to print on a card.
				continue;
			}
			out.push(guest);
		}
	}
	return out;
}
