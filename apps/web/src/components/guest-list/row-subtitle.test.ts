import { describe, expect, it } from "vitest";

import { rowSubtitle as parts, subtitleText } from "./row-subtitle";

const rowSubtitle = (...args: Parameters<typeof parts>) =>
	subtitleText(parts(...args));

const nowMs = Date.parse("2026-10-03T12:00:00Z");
const hoursAgo = (h: number) => new Date(nowMs - h * 3_600_000);

const base = {
	email: "linh@example.com",
	response: null,
	respondedAt: null,
	invitedAt: null,
	hasPaper: false,
	noEmail: false,
	viewedAt: null,
	phone: null,
	invitedVia: null,
	textable: false,
} as const;

const email = { isYou: false, paper: false, nowMs };
const paper = { isYou: false, paper: true, nowMs };

describe("rowSubtitle", () => {
	it("keeps the status apart from the address it may be cut from", () => {
		expect(parts({ ...base, viewedAt: hoursAgo(5) }, email)).toEqual({
			lead: "linh@example.com",
			status: "viewed 5 hours ago",
		});
		expect(parts({ ...base, response: "no" }, email)).toEqual({
			lead: "linh@example.com",
			status: null,
		});
	});
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
	it("says when a silent guest opened it", () => {
		expect(
			rowSubtitle(
				{
					...base,
					invitedAt: new Date("2026-09-30T15:00:00Z"),
					viewedAt: hoursAgo(5),
				},
				email,
			),
		).toBe("linh@example.com · viewed 5 hours ago");
		expect(
			rowSubtitle({ ...base, hasPaper: true, viewedAt: hoursAgo(30) }, paper),
		).toBe("linh@example.com · viewed yesterday");
		// Once they answer, the answer is the news.
		expect(
			rowSubtitle(
				{
					...base,
					response: "yes",
					respondedAt: hoursAgo(2),
					viewedAt: hoursAgo(3),
				},
				email,
			),
		).toBe("linh@example.com · 2 hours ago");
	});
	it("says where a paper guest's card is", () => {
		expect(rowSubtitle({ ...base, email: "" }, paper)).toBe(
			"No email · paper invite, not printed yet",
		);
		expect(rowSubtitle({ ...base, hasPaper: true }, paper)).toBe(
			"linh@example.com · paper invite",
		);
	});
	it("says how an invitation went out", () => {
		const invitedAt = new Date("2026-09-30T15:00:00Z");
		expect(
			rowSubtitle({ ...base, invitedAt, invitedVia: "email" }, email),
		).toBe("linh@example.com · invited Sep 30");
		expect(
			rowSubtitle(
				{
					...base,
					email: "",
					phone: "+13015550101",
					invitedAt,
					invitedVia: "text",
				},
				email,
			),
		).toBe("(301) 555-0101 · invited by text Sep 30");
		expect(
			rowSubtitle(
				{ ...base, phone: "+13015550101", invitedAt, invitedVia: "both" },
				email,
			),
		).toBe("linh@example.com · invited by email and text Sep 30");
	});
	it("knows a guest with only a phone by their number", () => {
		const pat = { ...base, email: "", noEmail: true, phone: "+13015550101" };
		expect(rowSubtitle({ ...pat, textable: true }, email)).toBe(
			"(301) 555-0101 · not invited yet",
		);
		expect(rowSubtitle(pat, email)).toBe(
			"(301) 555-0101 · you answer for them",
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
