import { describe, expect, it } from "vitest";

import { segments, toGsm } from "./segments";

describe("toGsm", () => {
	it("folds typographic characters", () => {
		expect(toGsm("“It’s” – ok… •")).toBe('"It\'s" - ok... -');
	});
	it("keeps emoji", () => {
		expect(toGsm("hi \u{1F389}")).toBe("hi \u{1F389}");
	});
});

describe("segments", () => {
	it("counts GSM-7 at 160 then 153", () => {
		expect(segments("a".repeat(160))).toEqual({ encoding: "GSM-7", parts: 1 });
		expect(segments("a".repeat(161)).parts).toBe(2);
		expect(segments("a".repeat(306)).parts).toBe(2);
		expect(segments("a".repeat(307)).parts).toBe(3);
	});
	it("counts extension characters twice", () => {
		expect(segments("{".repeat(80)).parts).toBe(1);
		expect(segments("{".repeat(81)).parts).toBe(2);
		expect(segments("€").encoding).toBe("GSM-7");
	});
	it("switches to UCS-2 at 70 then 67", () => {
		expect(segments(`${"a".repeat(69)}\u{1F389}`)).toEqual({
			encoding: "UCS-2",
			parts: 2,
		});
		expect(segments("中".repeat(70))).toEqual({ encoding: "UCS-2", parts: 1 });
		expect(segments("中".repeat(134)).parts).toBe(2);
		expect(segments("中".repeat(135)).parts).toBe(3);
	});
});
