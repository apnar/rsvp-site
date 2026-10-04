import type { Inputs, Outputs } from "@/lib/api-types";
import { plural } from "@/lib/format";

export type Loaded = Outputs["events"]["get"];

/** Every field events.update takes: the form always holds all of them. */
type ApiFields = Required<NonNullable<Inputs["events"]["update"]["fields"]>>;

/**
 * The API's fields, except that an empty date or time is "" in an input
 * and becomes null in `fieldsOf`.
 */
export type EventForm = Omit<
	ApiFields,
	"date" | "startTime" | "endTime" | "rsvpDeadline"
> & {
	date: string;
	startTime: string;
	endTime: string;
	rsvpDeadline: string;
};

export type Item = {
	key: string;
	id?: string;
	label: string;
	quantity: number;
};

export const BLANK: EventForm = {
	title: "",
	hostLine: "",
	date: "",
	startTime: "18:00",
	endTime: "",
	location: "",
	details: "",
	extraDetails: "",
	rsvpDeadline: "",
	maxPlusOnes: 4,
	askKids: true,
	askDietary: true,
	askNote: true,
	potluckEnabled: false,
	showGuestNames: true,
	shareEnabled: false,
	paper: false,
	guestInvites: false,
	guestInviteLimit: 3,
	remindDeadline: true,
	remindDaysBefore: 3,
	remindDayBefore: true,
	notifyChanges: true,
	hostAlerts: "daily",
};

export function formOf(loaded: Loaded): EventForm {
	const e = loaded.event;
	return {
		title: e.title,
		hostLine: e.hostLine,
		date: e.date ?? "",
		startTime: e.startTime ?? "",
		endTime: e.endTime ?? "",
		location: e.location,
		details: e.details,
		extraDetails: e.extraDetails,
		rsvpDeadline: e.rsvpDeadline ?? "",
		maxPlusOnes: e.maxPlusOnes,
		askKids: e.askKids,
		askDietary: e.askDietary,
		askNote: e.askNote,
		potluckEnabled: e.potluckEnabled,
		showGuestNames: e.showGuestNames,
		shareEnabled: e.shareEnabled,
		paper: e.paper,
		guestInvites: e.guestInvites,
		guestInviteLimit: e.guestInviteLimit,
		remindDeadline: e.remindDeadline,
		remindDaysBefore: e.remindDaysBefore,
		remindDayBefore: e.remindDayBefore,
		notifyChanges: e.notifyChanges,
		hostAlerts: e.hostAlerts,
	};
}

/** The form as the API wants it: empty strings become nulls. */
export function fieldsOf(f: EventForm) {
	return {
		...f,
		title: f.title.trim(),
		date: f.date || null,
		startTime: f.startTime || null,
		endTime: f.endTime || null,
		rsvpDeadline: f.rsvpDeadline || null,
	};
}

export function itemsOf(loaded?: Loaded): Item[] {
	return (loaded?.potluck ?? []).map((p) => ({
		key: p.id,
		id: p.id,
		label: p.label,
		quantity: p.quantity,
	}));
}

/** What the API would store for these items; blank rows are dropped. */
export const itemsSig = (items: Item[]) =>
	items
		.filter((i) => i.label.trim())
		.map((i) => `${i.id ?? ""}:${i.label.trim()}:${i.quantity}`)
		.join("|");

/**
 * The send button's words: one place for what was a nested ternary. Only a
 * paper draft "publishes" (its emails are held); once a paper event's
 * emails are started, the button emails new guests like any other event's.
 */
export function sendLabel(paper: boolean, status: string, sendCount: number) {
	if (paper && status === "draft") return "Publish";
	if (status === "draft" && sendCount === 0) return "Send invites";
	return `Send ${plural(sendCount, "invite")}`;
}

let itemKey = 0;
export const nextKey = () => `new-${++itemKey}`;
