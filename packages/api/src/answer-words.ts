/**
 * What an event calls its answers. The stored answer is always yes, maybe
 * or no; a host only renames them ("Count me in!", "Going"), and may take
 * maybe off the menu. Pure, and free of drizzle and `cloudflare:workers`,
 * so the web app bundles it: the picker, the counts, the guest list and the
 * emails all read the same words.
 */

import { z } from "zod";

/**
 * Each answer has two forms: the thing a guest picks or a host sees as a
 * chip ("Can't"), and the word after a number ("6 out"). A host's "Count me
 * in!" can't follow a number, so neither form is derived from the other.
 * `none` is a guest who hasn't answered: "No reply", "14 waiting".
 */
type Word = { pick: string; count: string };

export type AnswerWords = {
	yes: Word;
	maybe: Word;
	no: Word;
	none: Word;
	/** The RSVP form's button. */
	submit: string;
};

/** What a page or an email needs to offer and show an event's answers. */
export type AnswerSet = { words: AnswerWords; maybe: boolean };

export const DEFAULT_WORDS: AnswerWords = {
	yes: { pick: "Yes", count: "in" },
	maybe: { pick: "Maybe", count: "maybe" },
	no: { pick: "Can't", count: "out" },
	none: { pick: "No reply", count: "waiting" },
	submit: "Lock it in",
};

/**
 * The ready-made sets the editor offers, for the three answers. Picking one
 * there also puts `none` back to the default; `submit` is its own field.
 */
export const PRESETS: {
	id: string;
	label: string;
	words: Pick<AnswerWords, "yes" | "maybe" | "no">;
}[] = [
	{
		id: "standard",
		label: "Yes / Maybe / Can't",
		words: {
			yes: DEFAULT_WORDS.yes,
			maybe: DEFAULT_WORDS.maybe,
			no: DEFAULT_WORDS.no,
		},
	},
	{
		id: "in-out",
		label: "In / Maybe / Out",
		words: {
			yes: { pick: "In", count: "in" },
			maybe: { pick: "Maybe", count: "maybe" },
			no: { pick: "Out", count: "out" },
		},
	},
	{
		id: "going",
		label: "Going / Maybe / Not going",
		words: {
			yes: { pick: "Going", count: "going" },
			maybe: { pick: "Maybe", count: "maybe" },
			no: { pick: "Not going", count: "not going" },
		},
	},
	{
		id: "attending",
		label: "Attending / Tentative / Declining",
		words: {
			yes: { pick: "Attending", count: "attending" },
			maybe: { pick: "Tentative", count: "tentative" },
			no: { pick: "Declining", count: "declining" },
		},
	},
];

/** The preset these words are, or null for a host's own. */
export function presetOf(words: AnswerWords): string | null {
	const same = (a: Word, b: Word) => a.pick === b.pick && a.count === b.count;
	return (
		PRESETS.find(
			(p) =>
				same(p.words.yes, words.yes) &&
				same(p.words.maybe, words.maybe) &&
				same(p.words.no, words.no),
		)?.id ?? null
	);
}

export const WORD_LIMITS = { pick: 20, count: 16, submit: 24 } as const;

// One line of plain text: these land in buttons, chips, subjects and
// sentences, where a line break or a control character has no business.
const oneLine = (max: number) =>
	z
		.string()
		.trim()
		.min(1, "Fill in every word.")
		.max(max, `Keep each to ${max} characters.`)
		// biome-ignore lint/suspicious/noControlCharactersInRegex: refusing them is the point
		.regex(/^[^\u0000-\u001f\u007f]*$/, "One line of text.");

const wordInput = z.object({
	pick: oneLine(WORD_LIMITS.pick),
	count: oneLine(WORD_LIMITS.count),
});

const KEYS = ["yes", "maybe", "no", "none"] as const;

/**
 * Words a host may save. All four of each form must differ: a guest has to
 * tell the buttons apart, and "9 in · 6 in" says nothing.
 */
export const answerWordsInput = z
	.object({
		yes: wordInput,
		maybe: wordInput,
		no: wordInput,
		none: wordInput,
		submit: oneLine(WORD_LIMITS.submit),
	})
	.superRefine((w, ctx) => {
		for (const form of ["pick", "count"] as const) {
			const seen = new Set<string>();
			for (const k of KEYS) {
				const v = w[k][form].toLocaleLowerCase();
				if (seen.has(v)) {
					ctx.addIssue({
						code: "custom",
						path: [k, form],
						message: "Each answer needs its own words.",
					});
				}
				seen.add(v);
			}
		}
	});

/** A stored value, or the defaults when there is none or it doesn't parse. */
export function readWords(raw: unknown): AnswerWords {
	if (raw == null) return DEFAULT_WORDS;
	const parsed = answerWordsInput.safeParse(raw);
	return parsed.success ? parsed.data : DEFAULT_WORDS;
}

/**
 * What to store: null for the defaults, so a later change to the site's
 * words still reaches every event that never chose its own.
 */
export function toStored(words: AnswerWords): AnswerWords | null {
	return sameWords(words, DEFAULT_WORDS) ? null : words;
}

function sameWords(a: AnswerWords, b: AnswerWords): boolean {
	return (
		a.submit === b.submit &&
		KEYS.every((k) => a[k].pick === b[k].pick && a[k].count === b[k].count)
	);
}

/** An event row's answers, ready for a page or an email. */
export function answersOf(row: {
	answerWords: unknown;
	allowMaybe: boolean;
}): AnswerSet {
	return { words: readWords(row.answerWords), maybe: row.allowMaybe };
}

type Answer = "yes" | "maybe" | "no";

/**
 * The answers a picker offers. Maybe stays for somebody who already said
 * it, so taking maybe away after the fact never blanks a guest's answer.
 */
export function offered(answers: AnswerSet, current?: Answer | null): Answer[] {
	return answers.maybe || current === "maybe"
		? ["yes", "maybe", "no"]
		: ["yes", "no"];
}

/** Whether an answer is on offer: the server's copy of `offered`. */
export function mayPick(
	allowMaybe: boolean,
	current: Answer | null,
	next: Answer,
): boolean {
	return next !== "maybe" || allowMaybe || current === "maybe";
}

/** Whether counts and filters show maybe: offered, or somebody said it. */
export function showsMaybe(answers: AnswerSet, maybes: number): boolean {
	return answers.maybe || maybes > 0;
}

/** The word for an answer or for no answer at all. */
export function pickWord(words: AnswerWords, response: Answer | null): string {
	return words[response ?? "none"].pick;
}
