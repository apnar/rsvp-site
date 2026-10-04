import { seenNoReply } from "@rsvp-site/api/headcount";
import { ANSWER_LABELS } from "@/content/site";
import type { Guest } from "./types";

export const SECTION_KEYS = ["yes", "maybe", "no", "viewed", "unseen"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

const LABELS: Record<SectionKey, string> = {
	yes: ANSWER_LABELS.yes,
	maybe: ANSWER_LABELS.maybe,
	no: ANSWER_LABELS.no,
	viewed: "Viewed, no reply",
	unseen: "Not viewed",
};

type Sortable = Pick<Guest, "name" | "response" | "viewedAt">;

export function sectionOf(g: Sortable): SectionKey {
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
export function guestSections<T extends Sortable>(guests: readonly T[]) {
	return SECTION_KEYS.map((key) => ({
		key,
		label: LABELS[key],
		guests: guests
			.filter((g) => sectionOf(g) === key)
			.sort((a, b) => byName.compare(a.name, b.name)),
	})).filter((s) => s.guests.length > 0);
}
