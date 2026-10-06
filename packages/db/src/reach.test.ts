import { describe, expect, it } from "vitest";

import { canVouchTexts, isMailable, isTextable, shownEmail } from "./reach";

const base = {
	status: "active",
	banned: null,
	unsubscribedAt: null,
	noEmail: false,
	phone: "+13015550123",
	textsOkAt: new Date(0),
	textsOffAt: null,
	textBlock: null,
	claimedAt: null,
};

describe("isMailable", () => {
	it("is true for an ordinary person", () => {
		expect(isMailable(base)).toBe(true);
		expect(isMailable({ ...base, banned: false })).toBe(true);
	});
	it("refuses deactivated, banned, unsubscribed and name-only people", () => {
		expect(isMailable({ ...base, status: "deactivated" })).toBe(false);
		expect(isMailable({ ...base, banned: true })).toBe(false);
		expect(isMailable({ ...base, unsubscribedAt: new Date() })).toBe(false);
		expect(isMailable({ ...base, noEmail: true })).toBe(false);
	});
});

describe("isTextable", () => {
	it("is true with consent, a US number and no block", () => {
		expect(isTextable(base)).toBe(true);
	});
	it("needs each of them", () => {
		expect(isTextable({ ...base, status: "deactivated" })).toBe(false);
		expect(isTextable({ ...base, banned: true })).toBe(false);
		expect(isTextable({ ...base, phone: null })).toBe(false);
		expect(isTextable({ ...base, phone: "+442071234567" })).toBe(false);
		expect(isTextable({ ...base, textsOkAt: null })).toBe(false);
		expect(isTextable({ ...base, textsOffAt: new Date() })).toBe(false);
		expect(isTextable({ ...base, textBlock: "stop" })).toBe(false);
	});
});

describe("canVouchTexts", () => {
	const blank = { ...base, textsOkAt: null };
	it("is true for an unclaimed record with a number and no consent", () => {
		expect(canVouchTexts(blank)).toBe(true);
	});
	it("is false once consent, a switch-off, a claim or a block exists", () => {
		expect(canVouchTexts(base)).toBe(false);
		expect(canVouchTexts({ ...blank, textsOffAt: new Date() })).toBe(false);
		expect(canVouchTexts({ ...blank, claimedAt: new Date() })).toBe(false);
		expect(canVouchTexts({ ...blank, textBlock: "stop" })).toBe(false);
		expect(canVouchTexts({ ...blank, phone: null })).toBe(false);
		expect(canVouchTexts({ ...blank, status: "deactivated" })).toBe(false);
	});
});

describe("shownEmail", () => {
	it("blanks a placeholder and keeps a real address", () => {
		expect(shownEmail({ email: "x@y.test", noEmail: false })).toBe("x@y.test");
		expect(shownEmail({ email: "abc@no-email.invalid", noEmail: true })).toBe(
			"",
		);
	});
});
