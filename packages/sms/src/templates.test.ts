import { describe, expect, it } from "vitest";

import { segments } from "./segments";
import {
	cancelText,
	dayBeforeText,
	deadlineReminderText,
	hostAlertText,
	hostDigestText,
	inviteText,
	nudgeText,
	replyText,
	signInText,
	type TextFacts,
	testText,
	textLinkUrl,
	updateText,
} from "./templates";

const f: TextFacts = {
	title: "Halloween Party",
	hostName: "Josh",
	dateLabel: "Sat, Oct 31",
	timeLabel: "7:00 PM - 10:00 PM",
	location: "12 Elm St",
	deadlineLabel: "Sat, Oct 17",
};
const link =
	"https://rsvp.botch.com/api/auth/link?k=0123456789abcdef0123456789abcdef&to=%2Fe%2Fabc";
const STOP = "Reply STOP to opt out.";

describe("templates", () => {
	it("invites", () => {
		expect(inviteText(f, "L")).toBe(
			"Botch RSVP: Josh invited you to Halloween Party, Sat, Oct 31 at 7:00 PM. See the invitation and RSVP: L Reply STOP to opt out.",
		);
		expect(inviteText(f, "L", "Pat")).toContain("Pat invited you along to");
		expect(inviteText({ ...f, hostName: "" }, "L")).toContain(
			"You're invited to",
		);
	});

	it("brands and opts out", () => {
		const all = [
			inviteText(f, link),
			nudgeText(f, link),
			deadlineReminderText(f, link),
			dayBeforeText(f, link),
			updateText(f, [{ label: "Time", was: "7", now: "8" }], link),
			cancelText(f, "Sorry", link),
			hostAlertText(
				{ title: "T", guestName: "Pat", answer: "Yes", party: "2 adults" },
				link,
			),
			hostDigestText({ title: "T", lines: ["Pat: Yes"], more: 0 }, link),
			replyText(),
		];
		for (const t of all) {
			expect(t.startsWith("Botch RSVP")).toBe(true);
			expect(t.endsWith(STOP)).toBe(true);
		}
		expect(signInText([{ name: "Pat", link: "L" }])).toBe(
			"Botch RSVP: your sign-in link: L\nDidn't ask? Ignore this.",
		);
		expect(
			signInText([
				{ name: "Pat", link: "L1" },
				{ name: "Sam", link: "L2" },
			]),
		).toContain("Pat: L1\nSam: L2");
		expect(testText().startsWith("Botch RSVP: ")).toBe(true);
	});

	it("mentions the deadline and the place", () => {
		expect(deadlineReminderText(f, "L")).toContain("by Sat, Oct 17");
		expect(dayBeforeText(f, "L")).toContain("12 Elm St");
	});

	it("stays GSM-7 for plain input, even with curly quotes", () => {
		const t = inviteText({ ...f, title: "Josh’s “bash”" }, "L");
		expect(segments(t).encoding).toBe("GSM-7");
	});

	it("bounds hostile input to 10 segments", () => {
		const long = "x".repeat(2000);
		const big: TextFacts = {
			...f,
			title: long,
			location: long,
			hostName: long,
		};
		const changes = Array.from({ length: 10 }, (_, i) => ({
			label: long,
			was: long,
			now: `${i}${long}`,
		}));
		const lines = Array.from({ length: 30 }, () => long);
		const texts = [
			inviteText(big, link, long),
			nudgeText(big, link),
			deadlineReminderText(big, link),
			dayBeforeText(big, link),
			updateText(big, changes, link),
			cancelText(big, long, link),
			hostAlertText(
				{ title: long, guestName: long, answer: long, party: long },
				link,
			),
			hostDigestText({ title: long, lines, more: 5 }, link),
		];
		for (const t of texts) expect(segments(t).parts).toBeLessThanOrEqual(10);
		expect(texts[4]).toContain("(+7 more)");
		expect(texts[7]).toContain("+27 more");
		expect(texts[0]).toContain("...");
	});
});

describe("textLinkUrl", () => {
	it("puts the code under /t on the origin", () => {
		expect(textLinkUrl("https://rsvp.botch.com", "abc123")).toBe(
			"https://rsvp.botch.com/t/abc123",
		);
	});
});
