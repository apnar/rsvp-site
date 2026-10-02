import { describe, expect, it } from "vitest";

import { canInviteOthers, invitesLeft } from "./guest-invites";

describe("canInviteOthers", () => {
	it("lets the people the host chose bring friends", () => {
		expect(canInviteOthers("host")).toBe(true);
		expect(canInviteOthers("group")).toBe(true);
	});

	it("stops at one level: a guest's friend, or a link joiner, cannot", () => {
		expect(canInviteOthers("guest")).toBe(false);
		expect(canInviteOthers("link")).toBe(false);
	});
});

describe("invitesLeft", () => {
	it("counts down to zero and no further", () => {
		expect(invitesLeft(3, 0)).toBe(3);
		expect(invitesLeft(3, 3)).toBe(0);
		expect(invitesLeft(2, 3)).toBe(0);
	});
});
