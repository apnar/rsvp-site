import { describe, expect, it } from "vitest";

import { parseGuests } from "./addresses";
import { displayName, firstNameOf, nameFor, splitName } from "./names";
import { formatPhone, normalizePhone } from "./phone";

const emails = (raw: string) => parseGuests(raw).map((g) => g.email);
const guest = (
	email: string | null,
	firstName = "",
	lastName = "",
	phone: string | null = null,
) => ({ email, firstName, lastName, phone });

describe("parseGuests, addresses", () => {
	it("splits on commas, semicolons and new lines", () => {
		expect(emails("a@x.com, b@x.com;c@x.com\nd@x.com")).toEqual([
			"a@x.com",
			"b@x.com",
			"c@x.com",
			"d@x.com",
		]);
	});

	it("takes the address out of a mail client's Name <address>", () => {
		expect(emails('"Linh Nguyen" <Linh.Nguyen@Mail.com>')).toEqual([
			"linh.nguyen@mail.com",
		]);
	});

	it("drops repeats, keeping the first position", () => {
		expect(emails("b@x.com a@x.com\nB@X.com")).toEqual(["b@x.com", "a@x.com"]);
	});

	it("drops what is neither an address nor a name", () => {
		expect(
			parseGuests("nobody@, @x.com\nDana at dana@x\n301-555-1212\n  \n,"),
		).toEqual([]);
	});
});

describe("parseGuests, people", () => {
	it("keeps the names a mail client puts in front", () => {
		expect(
			parseGuests(
				'"Linh Nguyen" <linh@x.com>, Marcus T <marcus@x.com>; bare@x.com',
			),
		).toEqual([
			guest("linh@x.com", "Linh", "Nguyen"),
			guest("marcus@x.com", "Marcus", "T"),
			guest("bare@x.com"),
		]);
	});

	it("reads a name, an address and a phone in any order", () => {
		expect(
			parseGuests(
				"Linh Nguyen linh@x.com 301 555 1212\n(240) 555-0000, bo@x.com, Bo Park\ncell: 301.555.9999 Dana <dana@x.com>",
			),
		).toEqual([
			guest("linh@x.com", "Linh", "Nguyen", "+13015551212"),
			guest("bo@x.com", "Bo", "Park", "+12405550000"),
			guest("dana@x.com", "Dana", "", "+13015559999"),
		]);
	});

	it("gives a phone after an address to that person, not the next", () => {
		expect(
			parseGuests("Linh <linh@x.com> 301-555-1212; Bo Park <bo@x.com>"),
		).toEqual([
			guest("linh@x.com", "Linh", "", "+13015551212"),
			guest("bo@x.com", "Bo", "Park"),
		]);
	});

	it("keeps a comma inside quotes, and turns Last, First round", () => {
		expect(
			parseGuests('"Nguyen, Linh" <linh@x.com>; "Park, Bo" <bo@x.com>'),
		).toEqual([
			guest("linh@x.com", "Linh", "Nguyen"),
			guest("bo@x.com", "Bo", "Park"),
		]);
	});

	it("takes a line without an address as a name, with its phone", () => {
		expect(
			parseGuests("The Parks\nGrandma Rose 301-555-1212\nCoach Dana,"),
		).toEqual([
			guest(null, "The Parks"),
			guest(null, "Grandma", "Rose", "+13015551212"),
			guest(null, "Coach", "Dana"),
		]);
	});

	it("keeps an apostrophe inside a name", () => {
		expect(parseGuests("'Sean O'Brien' <sean@x.com>")).toEqual([
			guest("sean@x.com", "Sean", "O'Brien"),
		]);
	});
});

describe("splitName", () => {
	it("makes the last word the last name", () => {
		expect(splitName("  Linh & Marcus   Nguyen ")).toEqual({
			firstName: "Linh & Marcus",
			lastName: "Nguyen",
		});
	});

	it("takes one word, or a household, as a first name", () => {
		expect(splitName("Linh")).toEqual({ firstName: "Linh", lastName: "" });
		expect(splitName("The Parks")).toEqual({
			firstName: "The Parks",
			lastName: "",
		});
		expect(splitName("Theo Park").lastName).toBe("Park");
	});

	it("caps each part", () => {
		expect(splitName(`${"a".repeat(80)} b`).firstName).toHaveLength(60);
	});
});

describe("names", () => {
	it("joins the pair, or falls back to the address", () => {
		expect(displayName("Linh", "")).toBe("Linh");
		expect(nameFor(" Linh ", "Nguyen", "l@x.com")).toBe("Linh Nguyen");
		expect(nameFor("", "", "linh.n@x.com")).toBe("linh.n");
	});

	it("never gives a card a blank first name", () => {
		expect(firstNameOf({ firstName: "", name: "linh.n" })).toBe("linh.n");
		expect(firstNameOf({ firstName: "Linh", name: "Linh N" })).toBe("Linh");
	});
});

describe("phones", () => {
	it("stores North American numbers with +1", () => {
		expect(normalizePhone("(301) 555-1212")).toBe("+13015551212");
		expect(normalizePhone("1-301-555-1212")).toBe("+13015551212");
	});

	it("keeps a typed country code, and refuses what isn't a number", () => {
		expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
		expect(normalizePhone("555-12")).toBeNull();
		expect(normalizePhone("1234567890123456")).toBeNull();
	});

	it("shows North American numbers the usual way", () => {
		expect(formatPhone("+13015551212")).toBe("(301) 555-1212");
		expect(formatPhone("+442079460958")).toBe("+442079460958");
		expect(formatPhone(null)).toBe("");
	});
});
