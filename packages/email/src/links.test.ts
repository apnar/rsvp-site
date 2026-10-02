import { describe, expect, it } from "vitest";

import { coverUrl, emailLink, rsvpLink, safeReturnPath } from "./links";
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

describe("coverUrl", () => {
	it("carries no sign-in key", () => {
		const url = coverUrl("https://rsvp.botch.com", "covers/abc.jpg");
		expect(url).toBe("https://rsvp.botch.com/api/covers/abc.jpg");
		expect(url).not.toContain("params.key");
	});
});

describe("safeReturnPath", () => {
	it("keeps paths on this site", () => {
		for (const path of ["/", "/events", "/e/abc?a=yes", "/admin/email"]) {
			expect(safeReturnPath(path)).toBe(path);
		}
	});

	it("sends everything else to the home page", () => {
		for (const bad of [
			"//evil.com",
			"/\\evil.com",
			"https://evil.com",
			"/a\nb",
			"/a\rb",
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
