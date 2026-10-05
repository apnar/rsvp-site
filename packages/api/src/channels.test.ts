import { describe, expect, it } from "vitest";

import { channelsFor, type Reach, viaOf } from "./channels";

const both: Reach = {
	mailable: true,
	textable: true,
	contactBy: null,
	alertsBy: null,
};

describe("channelsFor", () => {
	it("defaults to email when there is one", () => {
		expect(channelsFor(both, "guest")).toEqual({ email: true, text: false });
	});

	it("texts by default somebody with no working email", () => {
		expect(channelsFor({ ...both, mailable: false }, "guest")).toEqual({
			email: false,
			text: true,
		});
	});

	it("reaches nobody with neither", () => {
		expect(
			channelsFor({ ...both, mailable: false, textable: false }, "guest"),
		).toEqual({ email: false, text: false });
	});

	it("follows a choice of text", () => {
		expect(channelsFor({ ...both, contactBy: "text" }, "guest")).toEqual({
			email: false,
			text: true,
		});
	});

	it("falls back to email when text is chosen but impossible", () => {
		expect(
			channelsFor({ ...both, contactBy: "text", textable: false }, "guest"),
		).toEqual({ email: true, text: false });
	});

	it("falls back to text when email is chosen but impossible", () => {
		expect(
			channelsFor({ ...both, contactBy: "email", mailable: false }, "guest"),
		).toEqual({ email: false, text: true });
	});

	it("sends both when both are chosen, as far as they work", () => {
		expect(channelsFor({ ...both, contactBy: "both" }, "guest")).toEqual({
			email: true,
			text: true,
		});
		expect(
			channelsFor({ ...both, contactBy: "both", textable: false }, "guest"),
		).toEqual({ email: true, text: false });
	});

	it("uses the alerts choice for alerts, else the general one", () => {
		const p: Reach = { ...both, contactBy: "email", alertsBy: "text" };
		expect(channelsFor(p, "alerts")).toEqual({ email: false, text: true });
		expect(channelsFor(p, "guest")).toEqual({ email: true, text: false });
		expect(channelsFor({ ...both, contactBy: "both" }, "alerts")).toEqual({
			email: true,
			text: true,
		});
	});
});

describe("viaOf", () => {
	it("names the channels", () => {
		expect(viaOf({ email: true, text: true })).toBe("both");
		expect(viaOf({ email: false, text: true })).toBe("text");
		expect(viaOf({ email: true, text: false })).toBe("email");
		expect(viaOf({ email: false, text: false })).toBeNull();
	});
});
