import { describe, expect, it } from "vitest";

import {
	csvCell,
	describeChanges,
	emailsHeld,
	mayDelete,
	movesGuestFacts,
	openRefusal,
	planRemoval,
	rearmFor,
} from "./event-rules";
import { requireOpen } from "./events";
import { siteInstant } from "./time";

const base = {
	date: "2026-10-24" as string | null,
	startTime: "18:00" as string | null,
	endTime: "21:00" as string | null,
	location: "The barn",
	rsvpDeadline: "2026-10-20" as string | null,
};

describe("csvCell", () => {
	it("leaves plain text alone", () => {
		expect(csvCell("Dana")).toBe("Dana");
	});

	it("quotes commas, quotes and line breaks", () => {
		expect(csvCell("a,b")).toBe('"a,b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
	});

	it("defuses anything a spreadsheet would run as a formula", () => {
		for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
			expect(csvCell(`${lead}SUM(A1)`).replace(/^"/, "")).toMatch(/^'/);
		}
		expect(csvCell("=HYPERLINK(1,2)")).toBe(`"'=HYPERLINK(1,2)"`);
	});

	it("does not touch a dash in the middle", () => {
		expect(csvCell("a-b")).toBe("a-b");
	});
});

describe("describeChanges", () => {
	it("says nothing when nothing guests care about moved", () => {
		expect(describeChanges(base, { ...base })).toEqual([]);
	});

	it("reports a new date, with the old one", () => {
		const [change] = describeChanges(base, { ...base, date: "2026-10-31" });
		expect(change?.label).toBe("Date");
		expect(change?.was).not.toBe(change?.now);
	});

	it("names a missing date and a missing time", () => {
		const changes = describeChanges(base, {
			...base,
			date: null,
			startTime: null,
			endTime: null,
		});
		expect(changes.map((c) => [c.label, c.now])).toEqual([
			["Date", "No date"],
			["Time", "No time"],
		]);
	});

	it("falls back to a phrase for an empty place", () => {
		expect(describeChanges(base, { ...base, location: "" })).toEqual([
			{ label: "Where", was: "The barn", now: "To be announced" },
		]);
		expect(describeChanges({ ...base, location: "" }, base)).toEqual([
			{ label: "Where", was: "Nowhere yet", now: "The barn" },
		]);
	});
});

describe("movesGuestFacts", () => {
	it("counts only the fields in the edit that differ", () => {
		expect(movesGuestFacts(base, {})).toBe(false);
		expect(movesGuestFacts(base, { location: "The barn" })).toBe(false);
		expect(movesGuestFacts(base, { location: "The loft" })).toBe(true);
	});
});

describe("rearmFor", () => {
	it("re-arms nothing for an edit that moves nothing", () => {
		expect(rearmFor(base, {})).toEqual({});
		expect(
			rearmFor(base, { date: base.date, rsvpDeadline: base.rsvpDeadline }),
		).toEqual({});
	});

	it("clears the day-before stamp when the date or the start moves", () => {
		expect(rearmFor(base, { date: "2026-10-31" })).toEqual({
			dayBeforeAt: null,
		});
		expect(rearmFor(base, { startTime: "19:00" })).toEqual({
			dayBeforeAt: null,
		});
		expect(rearmFor(base, { date: null })).toEqual({ dayBeforeAt: null });
	});

	it("clears the deadline stamp when the deadline moves, and only then", () => {
		expect(rearmFor(base, { rsvpDeadline: "2026-10-22" })).toEqual({
			deadlineReminderAt: null,
		});
	});

	it("clears both when both moved", () => {
		expect(rearmFor(base, { date: "2026-11-07", rsvpDeadline: null })).toEqual({
			dayBeforeAt: null,
			deadlineReminderAt: null,
		});
	});
});

describe("openRefusal and requireOpen", () => {
	const live = {
		status: "published" as const,
		date: "2026-10-24" as string | null,
		startTime: "18:00" as string | null,
	};
	const before = siteInstant("2026-10-24", "17:59").getTime();
	const after = siteInstant("2026-10-24", "18:00").getTime();

	it("is open while published and not yet started", () => {
		expect(openRefusal(live, before)).toBeNull();
		expect(() => requireOpen(live, before)).not.toThrow();
	});

	it("says one thing for each way it is closed", () => {
		expect(openRefusal({ ...live, status: "canceled" }, before)).toBe(
			"It's been canceled.",
		);
		expect(openRefusal({ ...live, status: "draft" }, before)).toBe(
			"It hasn't gone out yet.",
		);
		expect(openRefusal(live, after)).toBe("It's already started.");
		expect(() => requireOpen(live, after)).toThrow("It's already started.");
	});

	it("is closed by a cancellation even after it started", () => {
		expect(openRefusal({ ...live, status: "canceled" }, after)).toBe(
			"It's been canceled.",
		);
	});

	it("stays open without a date, which has no start to pass", () => {
		expect(openRefusal({ ...live, date: null }, after)).toBeNull();
	});

	it("counts a date with no time as starting at midnight", () => {
		const midnight = siteInstant("2026-10-24", "00:00").getTime();
		expect(openRefusal({ ...live, startTime: null }, midnight)).toBe(
			"It's already started.",
		);
	});
});

describe("emailsHeld", () => {
	it("holds a paper event until its emails are released", () => {
		expect(emailsHeld({ paper: true, emailsReleasedAt: null })).toBe(true);
		expect(emailsHeld({ paper: true, emailsReleasedAt: new Date() })).toBe(
			false,
		);
		expect(emailsHeld({ paper: false, emailsReleasedAt: null })).toBe(false);
	});
});

describe("mayDelete", () => {
	const nobody = { isHost: false, isOwner: false, isAdmin: false };
	const cohost = { ...nobody, isHost: true };

	it("lets any host delete a draft", () => {
		expect(mayDelete({ status: "draft" }, cohost)).toBe(true);
		expect(mayDelete({ status: "draft" }, nobody)).toBe(false);
	});

	it("keeps a sent or canceled event to the owner and admins", () => {
		for (const status of ["published", "canceled"] as const) {
			expect(mayDelete({ status }, cohost)).toBe(false);
			expect(mayDelete({ status }, { ...cohost, isOwner: true })).toBe(true);
			expect(mayDelete({ status }, { ...nobody, isAdmin: true })).toBe(true);
		}
	});
});

describe("planRemoval", () => {
	const now = siteInstant("2026-10-10", "12:00").getTime();
	const owned = (
		id: string,
		status: "draft" | "published" | "canceled",
		date: string | null,
		heir: { id: string; name: string } | null = null,
	) => ({ id, title: id, status, date, startTime: "18:00", heir });
	const dana = { id: "u2", name: "Dana" };

	it("hands a co-hosted event over, even an upcoming one", () => {
		const plan = planRemoval(
			[owned("a", "published", "2026-10-24", dana)],
			now,
		);
		expect(plan.handOff.map((h) => [h.event.id, h.to.id])).toEqual([
			["a", "u2"],
		]);
		expect(plan.erase).toEqual([]);
		expect(plan.blocking).toEqual([]);
	});

	it("erases drafts, canceled and past events hosted alone", () => {
		const plan = planRemoval(
			[
				owned("draft", "draft", null),
				owned("off", "canceled", "2026-10-24"),
				owned("done", "published", "2026-10-01"),
			],
			now,
		);
		expect(plan.erase.map((e) => e.id)).toEqual(["draft", "off", "done"]);
		expect(plan.blocking).toEqual([]);
	});

	it("blocks on an upcoming sent event nobody else hosts", () => {
		const plan = planRemoval([owned("party", "published", "2026-10-24")], now);
		expect(plan.blocking.map((e) => e.id)).toEqual(["party"]);
		expect(plan.erase).toEqual([]);
	});

	it("counts one that has started as past", () => {
		const started = planRemoval(
			[{ ...owned("today", "published", "2026-10-10"), startTime: "09:00" }],
			now,
		);
		expect(started.erase.map((e) => e.id)).toEqual(["today"]);
	});
});
