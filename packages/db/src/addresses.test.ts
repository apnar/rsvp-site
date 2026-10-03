import { describe, expect, it } from "vitest";

import { parseAddresses, parseGuestLines } from "./addresses";

const parseEmails = (raw: string) => parseAddresses(raw).map((a) => a.email);

describe("parseAddresses, addresses only", () => {
	it("splits on commas, semicolons and new lines", () => {
		expect(parseEmails("a@x.com, b@x.com;c@x.com\nd@x.com")).toEqual([
			"a@x.com",
			"b@x.com",
			"c@x.com",
			"d@x.com",
		]);
	});

	it("takes the address out of a mail client's Name <address>", () => {
		expect(parseEmails('"Linh Nguyen" <Linh.Nguyen@Mail.com>')).toEqual([
			"linh.nguyen@mail.com",
		]);
	});

	it("drops repeats, keeping the first position", () => {
		expect(parseEmails("b@x.com a@x.com B@X.com")).toEqual([
			"b@x.com",
			"a@x.com",
		]);
	});

	it("ignores words that are not addresses", () => {
		expect(parseEmails("the Parks, nobody@, @x.com, x@y")).toEqual([]);
	});
});

describe("parseAddresses", () => {
	it("keeps the name a mail client puts in front", () => {
		expect(
			parseAddresses(
				'"Linh Nguyen" <linh@x.com>, Marcus T <marcus@x.com>; bare@x.com',
			),
		).toEqual([
			{ email: "linh@x.com", name: "Linh Nguyen" },
			{ email: "marcus@x.com", name: "Marcus T" },
			{ email: "bare@x.com", name: null },
		]);
	});

	it("reads the format the guest box suggests, one per line", () => {
		expect(
			parseAddresses("Linh Nguyen <linh@x.com>\nMarcus Taylor <Marcus@X.com>"),
		).toEqual([
			{ email: "linh@x.com", name: "Linh Nguyen" },
			{ email: "marcus@x.com", name: "Marcus Taylor" },
		]);
	});
});

describe("parseGuestLines", () => {
	it("keeps addresses as addresses and the rest as names", () => {
		expect(
			parseGuestLines(
				'The Parks\n"Linh N" <linh@x.com>, bo@x.com\nCoach Dana,\n  ',
			),
		).toEqual({
			addresses: [
				{ email: "linh@x.com", name: "Linh N" },
				{ email: "bo@x.com", name: null },
			],
			names: ["The Parks", "Coach Dana"],
		});
	});

	it("reads the paper box's suggestion: name and email, or a name alone", () => {
		expect(parseGuestLines("Linh Nguyen <linh@x.com>\nGrandma Rose")).toEqual({
			addresses: [{ email: "linh@x.com", name: "Linh Nguyen" }],
			names: ["Grandma Rose"],
		});
	});
});
