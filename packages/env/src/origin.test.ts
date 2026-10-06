import { describe, expect, it } from "vitest";

import { isLocal } from "./origin";

describe("isLocal", () => {
	it("is true for localhost and loopback, with any port", () => {
		expect(isLocal("http://localhost:3001")).toBe(true);
		expect(isLocal("http://127.0.0.1:3001")).toBe(true);
	});
	it("is false for a real host, a lookalike and junk", () => {
		expect(isLocal("https://rsvp.botch.com")).toBe(false);
		expect(isLocal("https://localhost.evil.test")).toBe(false);
		expect(isLocal("")).toBe(false);
		expect(isLocal("not a url")).toBe(false);
	});
});
