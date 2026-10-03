import { describe, expect, it } from "vitest";

import { canHost, isAdmin, roleOf } from "./roles";

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
