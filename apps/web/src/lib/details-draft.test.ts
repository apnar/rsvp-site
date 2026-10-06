import { describe, expect, it } from "vitest";

import { changedDetails, type DetailKey, draftOf } from "./details-draft";

const blank: Record<DetailKey, string | null> = {
	firstName: null,
	lastName: null,
	phone: null,
	addressLine1: null,
	addressLine2: null,
	city: null,
	region: null,
	postalCode: null,
	country: null,
};

describe("draftOf", () => {
	it("turns null into blanks and shows a stored phone as people read it", () => {
		const d = draftOf({ ...blank, firstName: "Linh", phone: "+13015551234" });
		expect(d.firstName).toBe("Linh");
		expect(d.lastName).toBe("");
		expect(d.phone).toBe("(301) 555-1234");
	});
});

describe("changedDetails", () => {
	const saved = { ...blank, firstName: "Linh", phone: "+13015551234" };

	it("is empty for an untouched draft", () => {
		expect(changedDetails(saved, draftOf(saved))).toEqual({});
	});

	it("treats null and an empty string as the same blank", () => {
		expect(changedDetails(blank, draftOf(blank))).toEqual({});
	});

	it("ignores whitespace around a value", () => {
		const draft = { ...draftOf(saved), firstName: "  Linh " };
		expect(changedDetails(saved, draft)).toEqual({});
	});

	it("does not call a phone typed another way a change", () => {
		const draft = { ...draftOf(saved), phone: "301-555-1234" };
		expect(changedDetails(saved, draft)).toEqual({});
	});

	it("reports a different number, and a cleared one", () => {
		expect(
			changedDetails(saved, { ...draftOf(saved), phone: "301-555-9999" }),
		).toEqual({ phone: "301-555-9999" });
		expect(changedDetails(saved, { ...draftOf(saved), phone: "" })).toEqual({
			phone: "",
		});
	});

	it("reports an unparseable phone as typed", () => {
		expect(changedDetails(saved, { ...draftOf(saved), phone: "123" })).toEqual({
			phone: "123",
		});
	});

	it("reports only the fields that differ", () => {
		const draft = { ...draftOf(saved), city: "Takoma Park" };
		expect(changedDetails(saved, draft)).toEqual({ city: "Takoma Park" });
	});
});
