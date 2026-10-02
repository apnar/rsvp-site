import { describe, expect, it } from "vitest";

import { parseAddresses, parseEmails } from "./people";
import { canHost, isAdmin, roleOf } from "./roles";

describe("parseEmails", () => {
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
});

describe("roleOf", () => {
	it("reads host and admin", () => {
		expect(roleOf("host")).toBe("host");
		expect(roleOf("admin")).toBe("admin");
	});

	it("treats null and anything unknown as a plain user", () => {
		expect(roleOf(null)).toBe("user");
		expect(roleOf("user")).toBe("user");
		expect(roleOf("superuser")).toBe("user");
	});
});

describe("canHost and isAdmin", () => {
	it("let admins do everything a host can", () => {
		expect(canHost({ role: "admin" })).toBe(true);
		expect(canHost({ role: "host" })).toBe(true);
		expect(isAdmin({ role: "host" })).toBe(false);
	});

	it("leave a plain user, or nobody, with neither", () => {
		for (const who of [{ role: "user" }, { role: null }, null, undefined]) {
			expect(canHost(who)).toBe(false);
			expect(isAdmin(who)).toBe(false);
		}
	});
});
