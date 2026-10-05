import { describe, expect, it } from "vitest";

import {
	type AnswerWords,
	answersOf,
	answerWordsInput,
	DEFAULT_WORDS,
	mayPick,
	offered,
	PRESETS,
	pickWord,
	presetOf,
	readWords,
	showsMaybe,
	toStored,
} from "./answer-words";

const custom: AnswerWords = {
	yes: { pick: "Count me in!", count: "coming" },
	maybe: { pick: "Probably", count: "probably" },
	no: { pick: "Sadly no", count: "sorry" },
	none: { pick: "Silent", count: "quiet" },
	submit: "Send it",
};

describe("readWords", () => {
	it("is the defaults for nothing stored", () => {
		expect(readWords(null)).toBe(DEFAULT_WORDS);
		expect(readWords(undefined)).toBe(DEFAULT_WORDS);
	});

	it("reads a host's own words", () => {
		expect(readWords(custom)).toEqual(custom);
	});

	it("falls back to the defaults on anything it can't parse", () => {
		expect(readWords({ yes: "Yes" })).toBe(DEFAULT_WORDS);
		expect(readWords("nonsense")).toBe(DEFAULT_WORDS);
		expect(readWords({ ...custom, yes: { pick: "a\nb", count: "x" } })).toBe(
			DEFAULT_WORDS,
		);
	});
});

describe("answerWordsInput", () => {
	it("trims", () => {
		const parsed = answerWordsInput.parse({
			...custom,
			submit: "  Send it  ",
		});
		expect(parsed.submit).toBe("Send it");
	});

	it("refuses blanks and overlong words", () => {
		expect(
			answerWordsInput.safeParse({ ...custom, submit: "   " }).success,
		).toBe(false);
		expect(
			answerWordsInput.safeParse({
				...custom,
				yes: { pick: "x".repeat(21), count: "in" },
			}).success,
		).toBe(false);
	});

	it("refuses two answers with the same word, whatever the case", () => {
		const r = answerWordsInput.safeParse({
			...custom,
			no: { pick: "count ME in!", count: "sorry" },
		});
		expect(r.success).toBe(false);
		expect(
			answerWordsInput.safeParse({
				...custom,
				none: { pick: "Silent", count: "Coming" },
			}).success,
		).toBe(false);
	});

	it("takes every preset", () => {
		for (const p of PRESETS) {
			expect(
				answerWordsInput.safeParse({ ...DEFAULT_WORDS, ...p.words }).success,
			).toBe(true);
		}
	});
});

describe("toStored", () => {
	it("stores nothing for the defaults", () => {
		expect(toStored({ ...DEFAULT_WORDS })).toBeNull();
	});

	it("stores a host's own words", () => {
		expect(toStored(custom)).toEqual(custom);
		expect(toStored({ ...DEFAULT_WORDS, submit: "Send" })).not.toBeNull();
	});
});

describe("presetOf", () => {
	it("knows the defaults as the standard set", () => {
		expect(presetOf(DEFAULT_WORDS)).toBe("standard");
	});

	it("ignores no-reply and button words", () => {
		const going = PRESETS.find((p) => p.id === "going");
		expect(presetOf({ ...custom, ...going?.words })).toBe("going");
	});

	it("is null for a host's own", () => {
		expect(presetOf(custom)).toBeNull();
	});
});

describe("maybe", () => {
	const off = answersOf({ answerWords: null, allowMaybe: false });

	it("offers maybe only when it is on", () => {
		expect(offered(answersOf({ answerWords: null, allowMaybe: true }))).toEqual(
			["yes", "maybe", "no"],
		);
		expect(offered(off)).toEqual(["yes", "no"]);
	});

	it("keeps maybe for somebody who already said it", () => {
		expect(offered(off, "maybe")).toEqual(["yes", "maybe", "no"]);
		expect(offered(off, "yes")).toEqual(["yes", "no"]);
	});

	it("refuses a new maybe once it is off", () => {
		expect(mayPick(false, null, "maybe")).toBe(false);
		expect(mayPick(false, "yes", "maybe")).toBe(false);
		expect(mayPick(false, "maybe", "maybe")).toBe(true);
		expect(mayPick(false, null, "no")).toBe(true);
		expect(mayPick(true, null, "maybe")).toBe(true);
	});

	it("shows maybe counts while anybody still says it", () => {
		expect(showsMaybe(off, 0)).toBe(false);
		expect(showsMaybe(off, 2)).toBe(true);
	});
});

describe("pickWord", () => {
	it("names no answer as no reply", () => {
		expect(pickWord(custom, null)).toBe("Silent");
		expect(pickWord(custom, "no")).toBe("Sadly no");
	});
});
