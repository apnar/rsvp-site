import { describe, expect, it } from "vitest";

import { rowSubtitle } from "./row-subtitle";

const nowMs = Date.parse("2026-10-03T12:00:00Z");
const hoursAgo = (h: number) => new Date(nowMs - h * 3_600_000);

const base = {
	email: "linh@example.com",
	response: null,
	respondedAt: null,
	invitedAt: null,
	hasPaper: false,
	noEmail: false,
} as const;

const email = { isYou: false, paper: false, nowMs };
const paper = { isYou: false, paper: true, nowMs };

describe("rowSubtitle", () => {
	it("tells the host it is them", () => {
		expect(rowSubtitle(base, { ...email, isYou: true })).toBe("That's you");
		expect(
			rowSubtitle(
				{ ...base, response: "yes", respondedAt: hoursAgo(3) },
				{ ...email, isYou: true },
			),
		).toBe("That's you · 3 hours ago");
	});
	it("shows an answered guest's address and when they answered", () => {
		expect(
			rowSubtitle(
				{ ...base, response: "maybe", respondedAt: hoursAgo(2) },
				email,
			),
		).toBe("linh@example.com · 2 hours ago");
		expect(rowSubtitle({ ...base, response: "no" }, email)).toBe(
			"linh@example.com",
		);
	});
	it("says No email for an answered guest with none", () => {
		expect(rowSubtitle({ ...base, email: "", response: "yes" }, paper)).toBe(
			"No email",
		);
	});
	it("shows when an invitation went out", () => {
		expect(
			rowSubtitle(
				{ ...base, invitedAt: new Date("2026-09-30T15:00:00Z") },
				email,
			),
		).toBe("linh@example.com · invited Sep 30");
	});
	it("says where a paper guest's card is", () => {
		expect(rowSubtitle({ ...base, email: "" }, paper)).toBe(
			"No email · paper invite, not printed yet",
		);
		expect(rowSubtitle({ ...base, hasPaper: true }, paper)).toBe(
			"linh@example.com · paper invite",
		);
	});
	it("says an emailed guest is not invited yet", () => {
		expect(rowSubtitle(base, email)).toBe("linh@example.com · not invited yet");
	});
	it("says who answers for a name-only guest on an emailed event", () => {
		const child = { ...base, email: "", noEmail: true };
		expect(rowSubtitle(child, email)).toBe("No email · you answer for them");
		expect(rowSubtitle(child, { ...email, familyOnList: true })).toBe(
			"No email · family answers",
		);
	});
});
