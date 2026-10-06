import { describe, expect, it } from "vitest";

import { dropsFrom } from "./webhook";

describe("dropsFrom", () => {
	it("maps each stopping event to its reason", () => {
		const { received, drops } = dropsFrom([
			{ event: "unsubscribed", email: "a@x.test" },
			{ event: "hard_bounce", email: "b@x.test" },
			{ event: "spam", email: "c@x.test" },
			{ event: "invalid_email", email: "d@x.test" },
		]);
		expect(received).toBe(4);
		expect(drops.map((d) => d.reason)).toEqual([
			"self",
			"bounce",
			"spam",
			"invalid",
		]);
	});
	it("takes a single event as well as an array", () => {
		expect(dropsFrom({ event: "spam", email: "a@x.test" }).drops).toHaveLength(
			1,
		);
	});
	it("ignores other events, missing addresses and junk, but counts objects", () => {
		const { received, drops } = dropsFrom([
			{ event: "delivered", email: "a@x.test" },
			{ event: "spam" },
			{ event: "spam", email: 5 },
			null,
			"text",
		]);
		expect(drops).toEqual([]);
		expect(received).toBe(3);
	});
});
