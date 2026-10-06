import { describe, expect, it } from "vitest";

import { readEmailClaim, signEmailClaim } from "./email-claim";

const secret = "a-test-secret-that-is-long-enough";
const claim = {
	userId: "0b0e3c9a-5d1f-4a57-9a0c-2f4f1d1b7c11",
	email: "dana@example.com",
	by: { card: "7c2e9f40-1b8a-4d6e-9a53-0f1e2d3c4b5a" },
	expires: 2_000_000,
};

describe("email claims", () => {
	it("reads back what was signed until it expires", async () => {
		const token = await signEmailClaim(secret, claim);
		expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
		expect(await readEmailClaim(secret, token, 1_000_000)).toEqual(claim);
		expect(await readEmailClaim(secret, token, 2_000_001)).toBe("expired");
	});

	it("carries a guest's own claim as well as a card's", async () => {
		const own = { ...claim, by: "self" as const };
		const token = await signEmailClaim(secret, own);
		expect(await readEmailClaim(secret, token, 0)).toEqual(own);
	});

	it("refuses another secret, a changed body and junk", async () => {
		const token = await signEmailClaim(secret, claim);
		expect(await readEmailClaim("another-secret", token, 0)).toBeNull();
		const [, mac] = token.split(".");
		const forged = await signEmailClaim(secret, {
			...claim,
			email: "mallory@example.com",
		});
		const [body] = forged.split(".");
		expect(await readEmailClaim(secret, `${body}.${mac}`, 0)).toBeNull();
		expect(await readEmailClaim(secret, "", 0)).toBeNull();
		expect(await readEmailClaim(secret, "a.b.c", 0)).toBeNull();
		expect(await readEmailClaim(secret, "!!.??", 0)).toBeNull();
	});

	it("refuses a well-signed body of the wrong shape", async () => {
		const token = await signEmailClaim(secret, {
			...claim,
			by: { card: "a:b" },
		});
		expect(await readEmailClaim(secret, token, 0)).toBeNull();
	});
});
