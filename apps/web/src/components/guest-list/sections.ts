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

type Sortable = Pick<Guest, "name" | "response" | "viewedAt">;

function sectionOf(g: Sortable): SectionKey {
	if (g.response !== null) return g.response;
	return seenNoReply(g) ? "viewed" : "unseen";
}

const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/**
 * The host's list in the order they read it: who's coming, who might, who
 * can't, then the silent -- those who have looked first, since they are
 * the ones worth a word. Alphabetical inside each, and empty sections are
 * left out.
 */
export function guestSections<T extends Sortable>(
	guests: readonly T[],
	words: AnswerWords,
) {
	const label = labels(words);
	return SECTION_KEYS.map((key) => ({
		key,
		label: label[key],
		guests: guests
			.filter((g) => sectionOf(g) === key)
			.sort((a, b) => byName.compare(a.name, b.name)),
	})).filter((s) => s.guests.length > 0);
}
