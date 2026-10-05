import { describe, expect, it } from "vitest";

import { isCode, newCode } from "./text-links";

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
