import { describe, expect, it } from "vitest";

import { canEditDetails } from "./details";

const host = { id: "h", role: "host" };
const guest = {
	id: "g",
	role: "user",
	status: "active",
	claimedAt: null as Date | null,
	inFamily: false,
};

describe("canEditDetails", () => {
	it("lets a host edit a guest in their book until the guest signs in", () => {
		expect(canEditDetails(host, guest, true)).toBe(true);
		expect(canEditDetails(host, { ...guest, role: null }, true)).toBe(true);
		expect(
			canEditDetails(host, { ...guest, claimedAt: new Date() }, true),
		).toBe(false);
	});

	it("keeps a host out of strangers, the deactivated and other hosts", () => {
		expect(canEditDetails(host, guest, false)).toBe(false);
		expect(
			canEditDetails(host, { ...guest, status: "deactivated" }, true),
		).toBe(false);
		expect(canEditDetails(host, { ...guest, role: "host" }, true)).toBe(false);
		expect(canEditDetails(host, { ...guest, role: "admin" }, true)).toBe(false);
	});

	it("leaves family members to admins and themselves", () => {
		const kin = { ...guest, inFamily: true };
		expect(canEditDetails(host, kin, true)).toBe(false);
		expect(canEditDetails({ id: "a", role: "admin" }, kin, false)).toBe(true);
		expect(canEditDetails({ id: "g", role: "user" }, kin, false)).toBe(true);
	});

	it("always lets the person themselves and an admin", () => {
		const claimed = { ...guest, claimedAt: new Date() };
		expect(canEditDetails({ id: "g", role: "user" }, claimed, false)).toBe(
			true,
		);
		expect(canEditDetails({ id: "a", role: "admin" }, claimed, false)).toBe(
			true,
		);
	});
});
