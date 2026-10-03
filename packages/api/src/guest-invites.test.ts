import { describe, expect, it } from "vitest";

import { canInviteOthers, inviteRefusal, invitesLeft } from "./guest-invites";
import { siteInstant } from "./time";

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

describe("inviteRefusal", () => {
	const open = {
		status: "published" as const,
		date: "2026-10-24" as string | null,
		startTime: "18:00" as string | null,
		guestInvites: true,
		paper: false,
		emailsReleasedAt: null as Date | null,
	};
	const chosen = { source: "host" as const };
	const before = siteInstant("2026-10-24", "12:00").getTime();
	const after = siteInstant("2026-10-24", "19:00").getTime();

	it("lets a chosen guest invite while it is open", () => {
		expect(inviteRefusal(open, chosen, before)).toBeNull();
	});

	it("refuses guests who are not the host's picks, or not guests at all", () => {
		expect(inviteRefusal(open, { source: "guest" }, before)?.code).toBe(
			"FORBIDDEN",
		);
		expect(inviteRefusal(open, { source: "link" }, before)?.code).toBe(
			"FORBIDDEN",
		);
		expect(inviteRefusal(open, null, before)?.code).toBe("FORBIDDEN");
	});

	it("refuses when the hosts turned guest invites off", () => {
		expect(
			inviteRefusal({ ...open, guestInvites: false }, chosen, before),
		).toMatchObject({ code: "FORBIDDEN" });
	});

	it("refuses while a paper event holds its email", () => {
		const held = { ...open, paper: true };
		expect(inviteRefusal(held, chosen, before)?.code).toBe("BAD_REQUEST");
		expect(
			inviteRefusal({ ...held, emailsReleasedAt: new Date() }, chosen, before),
		).toBeNull();
	});

	it("refuses a drafted, canceled or started event, in the open-event words", () => {
		expect(inviteRefusal({ ...open, status: "draft" }, chosen, before)).toEqual(
			{
				code: "BAD_REQUEST",
				message: "It hasn't gone out yet.",
			},
		);
		expect(
			inviteRefusal({ ...open, status: "canceled" }, chosen, before)?.message,
		).toBe("It's been canceled.");
		expect(inviteRefusal(open, chosen, after)?.message).toBe(
			"It's already started.",
		);
	});
});
