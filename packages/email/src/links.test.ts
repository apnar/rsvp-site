import { describe, expect, it } from "vitest";

import { emailLink, safeReturnPath } from "./links";
import { PARAM } from "./render";

describe("emailLink", () => {
	it("carries the per-recipient key and an encoded destination", () => {
		expect(emailLink("https://rsvp.botch.com", "/#rsvp")).toBe(
			`https://rsvp.botch.com/api/auth/link?k=${PARAM.key}&to=%2F%23rsvp`,
		);
		expect(emailLink("https://rsvp.botch.com", "/")).toContain("&to=%2F");
	});
});

describe("safeReturnPath", () => {
	it("keeps paths on this site", () => {
		for (const path of ["/", "/#rsvp", "/schedule", "/admin/email"]) {
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
