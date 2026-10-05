import { type AnswerWords, DEFAULT_WORDS } from "@rsvp-site/api/answer-words";
import { describe, expect, it } from "vitest";

import {
	BLANK,
	fieldsOf,
	formOf,
	type Item,
	itemsOf,
	itemsSig,
	type Loaded,
	sendLabel,
} from "./form";

/** What formOf reads of an event: the rest of the row is not its business. */
const event = {
	title: "Ava turns 9",
	hostLine: "The Lukens",
	date: "2026-10-17",
	startTime: "18:00",
	endTime: null,
	location: "112 Lakeview Ave",
	details: "Bring a blanket.",
	extraDetails: "Gate code 1234.",
	rsvpDeadline: null,
	maxPlusOnes: 2,
	askKids: false,
	askDietary: true,
	askNote: true,
	allowMaybe: false,
	potluckEnabled: true,
	showGuestNames: false,
	shareEnabled: true,
	paper: false,
	guestInvites: true,
	guestInviteLimit: 5,
	remindDeadline: false,
	remindDaysBefore: 2,
	remindDayBefore: true,
	notifyChanges: false,
	hostAlerts: "off",
};

/** The words as the server resolves them (`answers`), not the raw column. */
const words: AnswerWords = {
	...DEFAULT_WORDS,
	yes: { pick: "Going", count: "going" },
	submit: "Send it",
};

const loaded = {
	event,
	answers: { words, maybe: false },
	potluck: [
		{ id: "p1", label: "Chips", quantity: 2 },
		{ id: "p2", label: "Ice", quantity: 1 },
	],
} as unknown as Loaded;

describe("formOf and fieldsOf", () => {
	it("turns an event into a form and back to the same fields", () => {
		expect(fieldsOf(formOf(loaded))).toEqual({ ...event, answerWords: words });
	});
	it("shows an empty date or time as an empty input", () => {
		const form = formOf(loaded);
		expect(form.endTime).toBe("");
		expect(form.rsvpDeadline).toBe("");
	});
	it("sends an empty date or time as null, and trims the title", () => {
		const fields = fieldsOf({ ...BLANK, title: "  Party  ", startTime: "" });
		expect(fields.title).toBe("Party");
		expect(fields.date).toBeNull();
		expect(fields.startTime).toBeNull();
		expect(fields.endTime).toBeNull();
		expect(fields.rsvpDeadline).toBeNull();
	});
	it("holds every field the form has", () => {
		expect(Object.keys(formOf(loaded)).sort()).toEqual(
			Object.keys(BLANK).sort(),
		);
	});
});

describe("itemsOf and itemsSig", () => {
	it("reads the potluck rows with their ids", () => {
		expect(itemsOf(loaded)).toEqual([
			{ key: "p1", id: "p1", label: "Chips", quantity: 2 },
			{ key: "p2", id: "p2", label: "Ice", quantity: 1 },
		]);
		expect(itemsOf(undefined)).toEqual([]);
	});
	it("ignores blank rows and the spacing around labels", () => {
		const a: Item[] = [{ key: "1", id: "p1", label: "Chips", quantity: 2 }];
		const b: Item[] = [
			{ key: "x", id: "p1", label: " Chips ", quantity: 2 },
			{ key: "y", label: "   ", quantity: 1 },
		];
		expect(itemsSig(b)).toBe(itemsSig(a));
	});
	it("notices a changed label, quantity or new row", () => {
		const chips: Item = { key: "1", id: "p1", label: "Chips", quantity: 2 };
		const base = [chips];
		expect(itemsSig([{ ...chips, label: "Salsa" }])).not.toBe(itemsSig(base));
		expect(itemsSig([{ ...chips, quantity: 3 }])).not.toBe(itemsSig(base));
		expect(
			itemsSig([...base, { key: "2", label: "Ice", quantity: 1 }]),
		).not.toBe(itemsSig(base));
	});
});

describe("sendLabel", () => {
	it("publishes a paper draft, whoever is on the list", () => {
		expect(sendLabel(true, "draft", 0)).toBe("Publish");
		expect(sendLabel(true, "draft", 4)).toBe("Publish");
	});
	it("sends to new guests once a paper event's emails are started", () => {
		expect(sendLabel(true, "published", 4)).toBe("Send 4 invites");
	});
	it("sends the first invites of a draft", () => {
		expect(sendLabel(false, "draft", 0)).toBe("Send invites");
	});
	it("counts who is left once there is anyone", () => {
		expect(sendLabel(false, "draft", 3)).toBe("Send 3 invites");
		expect(sendLabel(false, "published", 1)).toBe("Send 1 invite");
	});
});
