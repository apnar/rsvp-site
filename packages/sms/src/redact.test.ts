import { describe, expect, it } from "vitest";

import { redactPhone } from "./redact";

describe("redactPhone", () => {
	it("keeps only the last four digits", () => {
		expect(redactPhone("+13015550123")).toBe("...0123");
	});
});
