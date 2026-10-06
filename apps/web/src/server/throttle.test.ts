import { describe, expect, it } from "vitest";

import { throttleKey } from "./throttle";

describe("throttleKey", () => {
	const door = "/api/auth/sign-in/email";
	it("leaves a plain door alone", () => {
		expect(throttleKey(`https://x.test${door}`)).toBe(door);
	});
	it("folds case, repeated and trailing slashes", () => {
		for (const spelling of [
			"/API/Auth/Sign-In/Email",
			"/api//auth///sign-in/email",
			"/api/auth/sign-in/email/",
			"/api/auth/sign-in/email//",
		]) {
			expect(throttleKey(`https://x.test${spelling}`)).toBe(door);
		}
	});
	it("folds percent-escapes", () => {
		expect(throttleKey("https://x.test/api/auth/sign%2Din/email")).toBe(door);
		expect(throttleKey("https://x.test/api/auth/sign-in/%65mail")).toBe(door);
	});
	it("keeps a malformed escape as typed and survives a bad URL", () => {
		expect(throttleKey("https://x.test/api/%zz")).toBe("/api/%zz");
		expect(throttleKey("not a url")).toBe("/");
	});
	it("ignores the query string", () => {
		expect(throttleKey(`https://x.test${door}?a=1`)).toBe(door);
	});
});
