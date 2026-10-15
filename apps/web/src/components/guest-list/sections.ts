import type { AnswerWords } from "@rsvp-site/api/answer-words";
import { seenNoReply } from "@rsvp-site/api/headcount";
import type { Guest } from "./types";

const SECTION_KEYS = ["yes", "maybe", "no", "viewed", "unseen"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

/**
 * "No reply" inside a sentence: "Viewed, no reply". Only a word in
 * sentence case is lowered, so a host's "RSVP pending" keeps its capitals.
 */
export function midSentence(word: string): string {
	return /^\p{Lu}\p{Ll}/u.test(word)
		? word.charAt(0).toLocaleLowerCase() + word.slice(1)
		: word;
}

/** Opened the invitation and said nothing: "Viewed, no reply". */
export function viewedLabel(words: AnswerWords): string {
	return `Viewed, ${midSentence(words.none.pick)}`;
}

function labels(words: AnswerWords): Record<SectionKey, string> {
	return {
		yes: words.yes.pick,
		maybe: words.maybe.pick,
		no: words.no.pick,
		viewed: viewedLabel(words),
		unseen: "Not viewed",
	};
}

type Sortable = Pick<
	Guest,
	| "id"
	| "name"
	| "firstName"
	| "lastName"
	| "response"
	| "viewedAt"
	| "familyId"
	| "child"
>;

function sectionOf(g: Sortable): SectionKey {
	if (g.response !== null) return g.response;
	return seenNoReply(g) ? "viewed" : "unseen";
}

const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

type Named = Pick<Guest, "name" | "firstName" | "lastName">;

/**
 * Last name, then first, the way a host scans a list of households.
 * Somebody with no last name (one word, "The Parks", a name made from an
 * address) files under the name they go by.
 */
function compareNames(a: Named, b: Named): number {
	return (
		byName.compare(a.lastName || a.name, b.lastName || b.name) ||
		byName.compare(a.firstName, b.firstName) ||
		byName.compare(a.name, b.name)
	);
}

/** A family's adults before its children, by name within each. */
function adultsFirst(a: Sortable, b: Sortable): number {
	return (
		Number(a.child === true) - Number(b.child === true) || compareNames(a, b)
	);
}

export type GuestGroup<T> = {
	key: string;
	/** `indent` is a child under an adult of their family. */
	rows: { guest: T; indent: boolean }[];
};

/**
 * One section's guests as households: relatives who gave the same answer
 * sit together, adults first, and a household files under its first
 * adult. A child is indented only beneath one of their own grown-ups, so
 * a child alone (or with only siblings) in a section reads as a guest.
 */
function familyGroups<T extends Sortable>(
	guests: readonly T[],
): GuestGroup<T>[] {
	const families = new Map<string, T[]>();
	const groups: T[][] = [];
	for (const g of guests) {
		if (g.familyId === null) {
			groups.push([g]);
			continue;
		}
		let members = families.get(g.familyId);
		if (!members) {
			members = [];
			families.set(g.familyId, members);
			groups.push(members);
		}
		members.push(g);
	}
	return groups
		.map((members) => members.sort(adultsFirst))
		.sort((a, b) => compareNames(a[0] as T, b[0] as T))
		.map((members) => {
			const head = members[0] as T;
			const withAdult = members.some((m) => m.child !== true);
			return {
				key: head.familyId ?? head.id,
				rows: members.map((guest) => ({
					guest,
					indent: withAdult && guest.child === true,
				})),
			};
		});
}

/**
 * The host's list in the order they read it: who's coming, who might, who
 * can't, then the silent -- those who have looked first, since they are
 * the ones worth a word. Households inside each, by last name, and empty
 * sections are left out. `guests` is the section in the order drawn.
 */
export function guestSections<T extends Sortable>(
	guests: readonly T[],
	words: AnswerWords,
) {
	const label = labels(words);
	return SECTION_KEYS.map((key) => {
		const groups = familyGroups(guests.filter((g) => sectionOf(g) === key));
		return {
			key,
			label: label[key],
			groups,
			guests: groups.flatMap((group) => group.rows.map((r) => r.guest)),
		};
	}).filter((s) => s.guests.length > 0);
}
