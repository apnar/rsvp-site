import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./errors";

describe("isUniqueViolation", () => {
	it("finds the UNIQUE text where D1 nests it", () => {
		const inner = new Error("UNIQUE constraint failed: user.email");
		const outer = new Error("D1_ERROR: failed", { cause: inner });
		const wrapper = new Error("Failed query", { cause: outer });
		expect(isUniqueViolation(wrapper)).toBe(true);
		expect(isUniqueViolation(inner)).toBe(true);
	});

	it("reads a bare string too", () => {
		expect(isUniqueViolation("UNIQUE constraint failed: x.y")).toBe(true);
	});

	it("says no to other errors, and to nothing", () => {
		expect(isUniqueViolation(new Error("NOT NULL constraint failed"))).toBe(
			false,
		);
		expect(isUniqueViolation(undefined)).toBe(false);
		expect(isUniqueViolation(null)).toBe(false);
	});

	it("gives up on a cause chain that never ends", () => {
		const loop = new Error("loop");
		loop.cause = loop;
		expect(isUniqueViolation(loop)).toBe(false);
	});
});
