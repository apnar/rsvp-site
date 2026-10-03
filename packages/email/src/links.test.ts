import { describe, expect, it } from "vitest";

import { emailLink, mediaUrl, rsvpLink, safeReturnPath } from "./links";
import { PARAM } from "./render";

describe("emailLink", () => {
	it("carries the per-recipient key and an encoded destination", () => {
		expect(emailLink("https://rsvp.botch.com", "/#rsvp")).toBe(
			`https://rsvp.botch.com/api/auth/link?k=${PARAM.key}&to=%2F%23rsvp`,
		);
		expect(emailLink("https://rsvp.botch.com", "/")).toContain("&to=%2F");
	});
});

describe("rsvpLink", () => {
	it("lands on the event page with the answer picked, signed in", () => {
		expect(rsvpLink("https://rsvp.botch.com", "ev1", "yes")).toBe(
			`https://rsvp.botch.com/api/auth/link?k=${PARAM.key}&to=%2Fe%2Fev1%3Fa%3Dyes`,
		);
	});
});

describe("mediaUrl", () => {
	it("carries no sign-in key", () => {
		const url = mediaUrl("https://rsvp.botch.com", "covers/abc.jpg");
		expect(url).toBe("https://rsvp.botch.com/api/covers/abc.jpg");
		expect(url).not.toContain("params.key");
	});
});

describe("safeReturnPath", () => {
	it("keeps paths on this site", () => {
		for (const path of [
			"/",
			"/events",
			"/e/abc?a=yes",
			"/admin/email",
			"/#rsvp",
		]) {
			expect(safeReturnPath(path)).toBe(path);
		}
	});

	it("keeps a smuggled tab or newline from leaving the site", () => {
		expect(safeReturnPath("/a\nb")).toBe("/ab");
		// Arrives already decoded once; a literal "%09" left is just a path.
		expect(safeReturnPath("/%09/evil.com")).toBe("/%09/evil.com");
	});

	it("sends everything else to the home page", () => {
		for (const bad of [
			"//evil.com",
			"/\\evil.com",
			"https://evil.com",
			"/\t/evil.com",
			"/\n/evil.com",
			"/\r/evil.com",
			"\t//evil.com",
			"/.//evil.com",
			"/..//evil.com",
			"/%2e//evil.com",
			"/./\\evil.com",
			"/a/..//evil.com",
			"/\\\\evil.com",
			"schedule",
			"",
			undefined,
			null,
			42,
			{},
		]) {
			expect(safeReturnPath(bad)).toBe("/");
		}
	});
});
