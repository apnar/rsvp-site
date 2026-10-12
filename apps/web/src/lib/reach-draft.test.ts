import { describe, expect, it } from "vitest";

import {
	offeredChannels,
	type Reach,
	reachPatch,
	savedReach,
	shownChannel,
} from "./reach-draft";

const on: Reach = { email: true, texts: true, contactBy: null, alertsBy: null };

describe("savedReach", () => {
	const base = {
		email: "a@example.com",
		unsubscribedAt: null,
		textsOn: true,
		textBlock: null,
		contactBy: null,
		alertsBy: null,
	};

	it("is on for an address and consent", () => {
		expect(savedReach(base)).toEqual(on);
	});

	it("reads a blank address or an unsubscribe as email off", () => {
		expect(savedReach({ ...base, email: "" }).email).toBe(false);
		expect(savedReach({ ...base, unsubscribedAt: new Date() }).email).toBe(
			false,
		);
	});

	it("reads a blocked number as texts off, whatever the consent", () => {
		expect(savedReach({ ...base, textBlock: "stop" }).texts).toBe(false);
	});
});

describe("reachPatch", () => {
	it("drops edits that put a field back where it was", () => {
		expect(reachPatch(on, { email: true, texts: false })).toEqual({
			texts: false,
		});
	});

	it("keeps a choice set back to the site's pick", () => {
		const saved = { ...on, alertsBy: "text" as const };
		expect(reachPatch(saved, { alertsBy: null })).toEqual({ alertsBy: null });
	});
});

describe("channels", () => {
	it("defaults to email with an address, a text without", () => {
		expect(shownChannel(on)).toBe("email");
		expect(shownChannel({ ...on, email: false })).toBe("text");
	});

	it("offers only what can work, plus the one chosen", () => {
		expect(offeredChannels(on)).toEqual(["email", "text", "both"]);
		expect(offeredChannels({ ...on, texts: false })).toEqual(["email"]);
		expect(offeredChannels({ ...on, texts: false, contactBy: "both" })).toEqual(
			["email", "both"],
		);
	});
});
