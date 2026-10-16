import { describe, expect, it } from "vitest";

import {
	isCode,
	newCode,
	TEXT_LINK_MAX_AGE_MS,
	textLinkCutoff,
} from "./text-links";

describe("newCode", () => {
	it("is 12 base62 characters", () => {
		for (let i = 0; i < 200; i++) expect(isCode(newCode())).toBe(true);
	});

	it("doesn't repeat", () => {
		const seen = new Set(Array.from({ length: 1000 }, newCode));
		expect(seen.size).toBe(1000);
	});

	it("uses the whole alphabet", () => {
		const chars = new Set(Array.from({ length: 400 }, newCode).join(""));
		expect(chars.size).toBe(62);
	});
});

describe("isCode", () => {
	it("refuses anything else", () => {
		expect(isCode("abc")).toBe(false);
		expect(isCode("abcdefghijk!")).toBe(false);
		expect(isCode("abcdefghijklm")).toBe(false);
	});
});

describe("textLinkCutoff", () => {
	const now = new Date("2026-10-16T12:00:00Z");
	const day = 24 * 60 * 60 * 1000;

	it("is ninety days", () => {
		expect(TEXT_LINK_MAX_AGE_MS).toBe(90 * day);
		expect(textLinkCutoff(now).toISOString()).toBe("2026-07-18T12:00:00.000Z");
	});

	it("keeps a code from the day-before text and drops a stale one", () => {
		const cutoff = textLinkCutoff(now).getTime();
		const fresh = now.getTime() - 89 * day;
		const stale = now.getTime() - 91 * day;
		// `redeemTextLink` keeps rows with created_at strictly after the cutoff.
		expect(fresh > cutoff).toBe(true);
		expect(stale > cutoff).toBe(false);
	});
});
