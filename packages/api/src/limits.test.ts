import { describe, expect, it } from "vitest";

import { callerIp, requireUnderLimit } from "./limits";

describe("callerIp", () => {
	it("reads Cloudflare's header and falls back to local", () => {
		expect(callerIp(new Headers({ "cf-connecting-ip": "1.2.3.4" }))).toBe(
			"1.2.3.4",
		);
		expect(callerIp(new Headers())).toBe("local");
	});
});

describe("requireUnderLimit", () => {
	const limiter = (success: boolean) => ({
		limit: async () => ({ success }),
	});
	it("passes while the limiter allows", async () => {
		await expect(
			requireUnderLimit(limiter(true), "k"),
		).resolves.toBeUndefined();
	});
	it("throws a 429 with the given or default message", async () => {
		await expect(requireUnderLimit(limiter(false), "k")).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
			message: "Slow down a little, then try again.",
		});
		await expect(
			requireUnderLimit(limiter(false), "k", "Wait."),
		).rejects.toMatchObject({ message: "Wait." });
	});
});
