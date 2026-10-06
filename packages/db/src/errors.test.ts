import { describe, expect, it } from "vitest";

import { describeError, isUniqueViolation } from "./errors";

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

describe("describeError", () => {
	// The shape drizzle throws: the parameters in the message, and so in the stack.
	function failedQuery() {
		const cause = new Error("D1_ERROR: no such column: x");
		const error = Object.assign(
			new Error(
				'Failed query: update "user" set "phone" = ?\nparams: +13015550100,k-secret',
				{ cause },
			),
			{ query: 'update "user" set "phone" = ?', params: ["+13015550100"] },
		);
		return error;
	}

	it("keeps the query and its cause but never its parameters", () => {
		const text = describeError(failedQuery());
		expect(text).toContain('Failed query: update "user" set "phone" = ?');
		expect(text).toContain("no such column: x");
		expect(text).not.toContain("+13015550100");
		expect(text).not.toContain("k-secret");
	});

	it("keeps an ordinary error's message and frames", () => {
		const text = describeError(new Error("boom"));
		expect(text.split("\n")[0]).toBe("Error: boom");
		expect(text).toMatch(/\n\s+at /);
	});

	it("reads strings and stops on a loop", () => {
		expect(describeError("plain")).toBe("plain");
		const loop = new Error("loop");
		loop.cause = loop;
		expect(describeError(loop).split(" <- ")).toHaveLength(5);
	});
});
