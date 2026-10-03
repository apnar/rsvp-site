/**
 * Every email about one event. They share a shape -- the same facts about
 * the same party, differing in what they want from you -- so they share a
 * type and a few builders rather than repeating the fields eight times.
 *
 * All of them are list emails: the links carry `{{ params.key }}` and the
 * footer carries `{{ params.unsubscribeUrl }}`, which Brevo fills per
 * recipient. Never run escapeHtml over a link built here.
 */

import type { Rendered } from "../brevo";
import {
	coverUrl,
	emailLink,
	eventLink,
	type RsvpAnswer,
	rsvpLink,
} from "../links";
import {
	type Block,
	COLORS,
	type EmailLook,
	email,
	escapeHtml,
	type Fact,
	paraHtml,
} from "../render";

export type EventFacts = {
	eventId: string;
	title: string;
	/** "The King Farm Swim Team parents". May be empty. */
	hostLine: string;
	/** "Sat, Oct 24", or null for a draft with no date. */
	dateLabel: string | null;
	/** "5:00 PM - 10:00 PM", or null. */
	timeLabel: string | null;
	location: string;
	details: string;
	/** "Sat, Oct 17", when there is a deadline. */
	deadlineLabel: string | null;
	coverKey: string | null;
	siteUrl: string;
	/** The event's design, when it is on: the card replaces band and cover. */
	look?: EmailLook | null;
};

const ANSWER_WORD: Record<RsvpAnswer, string> = {
	yes: "Yes",
	maybe: "Maybe",
	no: "Can't",
};

/** The one-tap button and link wording: the word, with a cheer on yes. */
const answerLabel = (a: RsvpAnswer) => (a === "yes" ? "Yes!" : ANSWER_WORD[a]);

const ANSWERS: readonly RsvpAnswer[] = ["yes", "maybe", "no"];

function answerButtons(facts: EventFacts): Block {
	return {
		kind: "buttons",
		items: ANSWERS.map((a) => ({
			label: answerLabel(a),
			href: rsvpLink(facts.siteUrl, facts.eventId, a),
			tone: a === "yes" ? "lime" : "outline",
		})),
	};
}

/** "Sat, Oct 24, 5:00 PM - 10:00 PM", or whichever part exists. */
export function whenLine(facts: EventFacts): string | null {
	const parts = [facts.dateLabel, facts.timeLabel].filter(Boolean);
	return parts.length > 0 ? parts.join(", ") : null;
}

/** When, where and the deadline -- whichever of them the event has. */
function eventFacts(facts: EventFacts, withDeadline: boolean): Fact[] {
	const when = whenLine(facts);
	return [
		...(when ? [{ label: "When", value: when }] : []),
		...(facts.location ? [{ label: "Where", value: facts.location }] : []),
		...(withDeadline && facts.deadlineLabel
			? [{ label: "RSVP by", value: facts.deadlineLabel }]
			: []),
	];
}

type Parts = {
	subject: string;
	kicker: string;
	lead: string;
	/** What goes between the lead and the buttons. */
	middle: Block[];
	/** Show the three answer buttons; otherwise one "Open the invite". */
	answers: boolean;
	tail?: string;
};

function render(facts: EventFacts, parts: Parts): Rendered {
	return email({
		subject: parts.subject,
		kicker: parts.kicker,
		heading: facts.title,
		coverUrl: facts.coverKey ? coverUrl(facts.siteUrl, facts.coverKey) : null,
		look: facts.look,
		list: true,
		blocks: [
			{ kind: "text", text: parts.lead },
			...parts.middle,
			parts.answers
				? answerButtons(facts)
				: {
						kind: "buttons",
						items: [
							{
								label: "Open the invite",
								href: eventLink(facts.siteUrl, facts.eventId),
							},
						],
					},
			...(parts.tail ? [{ kind: "muted", text: parts.tail } as const] : []),
		],
	});
}

function hostedBy(facts: EventFacts): string {
	return facts.hostLine.trim()
		? `${facts.hostLine.trim()} would love to see you.`
		: "You're invited.";
}

/** The details a host wrote, when there are any. */
function details(facts: EventFacts): Block[] {
	const text = facts.details.trim();
	return text ? [{ kind: "typed", text }] : [];
}

/**
 * The invitation itself. `invitedBy` is the guest who brought them, when it
 * was a guest rather than the host -- the reader should know whose friend
 * they are on this list.
 */
export function inviteEmail(
	facts: EventFacts,
	invitedBy: string | null = null,
): Rendered {
	const host = facts.hostLine.trim();
	return render(facts, {
		subject: invitedBy
			? `${invitedBy} invited you: ${facts.title}`
			: `You're invited: ${facts.title}`,
		kicker: "You're invited",
		lead: invitedBy
			? `${invitedBy} is going and invited you along${host ? `. Hosted by ${host}.` : "."}`
			: hostedBy(facts),
		middle: [
			{ kind: "facts", facts: eventFacts(facts, true) },
			...details(facts),
		],
		answers: true,
		tail: "One tap answers. You can change it later on the invite page.",
	});
}

/** To people who have not answered, ahead of the deadline. */
export function deadlineReminderEmail(facts: EventFacts): Rendered {
	const by = facts.deadlineLabel ? ` by ${facts.deadlineLabel}` : "";
	return render(facts, {
		subject: `RSVP${by}: ${facts.title}`,
		kicker: "Still deciding?",
		lead: `The hosts are counting heads and would like an answer${by}.`,
		middle: [{ kind: "facts", facts: eventFacts(facts, true) }],
		answers: true,
	});
}

/** A host pressing "Nudge". */
export function nudgeEmail(facts: EventFacts): Rendered {
	return render(facts, {
		subject: `Coming? ${facts.title}`,
		kicker: "A nudge from the host",
		lead: "We haven't heard from you yet. Are you coming?",
		middle: [{ kind: "facts", facts: eventFacts(facts, true) }],
		answers: true,
	});
}

/** To yeses and maybes, the day before. */
export function dayBeforeEmail(facts: EventFacts): Rendered {
	return render(facts, {
		subject: `Tomorrow: ${facts.title}`,
		kicker: "See you tomorrow",
		lead: "It's tomorrow. Here's the when and where.",
		middle: [
			{ kind: "facts", facts: eventFacts(facts, false) },
			...details(facts),
		],
		answers: false,
		tail: "Plans changed? Update your answer on the invite page so the hosts know.",
	});
}

/** Date, time or place moved. `changes` says what it was and is now. */
export function updateEmail(
	facts: EventFacts,
	changes: { label: string; was: string; now: string }[],
): Rendered {
	const moved: Block = {
		kind: "custom",
		html: changes
			.map((c) =>
				paraHtml(
					`<strong>${escapeHtml(c.label)}:</strong> ${escapeHtml(c.now)} <span style="color:${COLORS.muted}; text-decoration:line-through;">${escapeHtml(c.was)}</span>`,
				),
			)
			.join("\n"),
		text: changes.map((c) => `${c.label}: ${c.now} (was ${c.was})`).join("\n"),
	};
	return render(facts, {
		subject: `Change of plans: ${facts.title}`,
		kicker: "Change of plans",
		lead: "The hosts changed some details.",
		middle: [moved, { kind: "facts", facts: eventFacts(facts, false) }],
		answers: true,
		tail: "Does it still work for you? Your answer is unchanged until you change it.",
	});
}

/** The event is off. */
export function cancelEmail(facts: EventFacts, note: string): Rendered {
	const said = note.trim();
	return render(facts, {
		subject: `Canceled: ${facts.title}`,
		kicker: "Canceled",
		lead: whenLine(facts)
			? `${facts.title} on ${facts.dateLabel ?? whenLine(facts)} is canceled.`
			: `${facts.title} is canceled.`,
		middle: said ? [{ kind: "typed", text: said }] : [],
		answers: false,
		tail: "Nothing to do. Sorry to miss you.",
	});
}

export type ReplyLine = {
	name: string;
	response: RsvpAnswer;
	adults: number;
	kids: number;
	note: string;
};

export type Totals = {
	yes: number;
	maybe: number;
	no: number;
	waiting: number;
	/** People coming, counted by the caller (packages/api headcount). */
	expecting: number;
};

function partyLine(r: ReplyLine): string {
	if (r.response === "no") return ANSWER_WORD.no;
	const people = [
		`${r.adults} ${r.adults === 1 ? "adult" : "adults"}`,
		...(r.kids > 0 ? [`${r.kids} ${r.kids === 1 ? "kid" : "kids"}`] : []),
	];
	return `${ANSWER_WORD[r.response]} · ${people.join(", ")}`;
}

function totalsLine(t: Totals): string {
	return `${t.yes} yes · ${t.maybe} maybe · ${t.no} can't · ${t.waiting} waiting · expecting ${t.expecting}`;
}

function guestListLink(facts: EventFacts): string {
	return emailLink(facts.siteUrl, `/e/${facts.eventId}/guests`);
}

function hostRender(
	facts: EventFacts,
	subject: string,
	heading: string,
	replies: ReplyLine[],
	totals: Totals,
): Rendered {
	const note = (r: ReplyLine) => r.note.trim();
	const rows: Block = {
		kind: "custom",
		html: `<table role="presentation" style="margin:0 0 18px; border-collapse:collapse; font-size:16px; line-height:1.4;">${replies
			.map(
				(r) =>
					`<tr><td style="padding:6px 14px 6px 0; font-weight:700; vertical-align:top;">${escapeHtml(r.name)}</td><td style="padding:6px 0; vertical-align:top;">${escapeHtml(partyLine(r))}${note(r) ? `<br><span style="color:${COLORS.muted};">"${escapeHtml(note(r))}"</span>` : ""}</td></tr>`,
			)
			.join("")}</table>`,
		text: replies
			.map(
				(r) => `${r.name}: ${partyLine(r)}${note(r) ? ` -- "${note(r)}"` : ""}`,
			)
			.join("\n"),
	};
	return email({
		subject,
		kicker: facts.title,
		heading,
		list: true,
		blocks: [
			rows,
			{ kind: "text", text: totalsLine(totals) },
			{
				kind: "buttons",
				items: [{ label: "Guest list", href: guestListLink(facts) }],
			},
		],
	});
}

/** One reply, to the hosts, as it lands. */
export function hostAlertEmail(
	facts: EventFacts,
	reply: ReplyLine,
	totals: Totals,
): Rendered {
	return hostRender(
		facts,
		`${reply.name}: ${ANSWER_WORD[reply.response]} · ${facts.title}`,
		`${reply.name} answered.`,
		[reply],
		totals,
	);
}

/** The day's replies, to the hosts, once a day. */
export function hostDigestEmail(
	facts: EventFacts,
	replies: ReplyLine[],
	totals: Totals,
): Rendered {
	const n = replies.length;
	return hostRender(
		facts,
		`${n} new ${n === 1 ? "reply" : "replies"} · ${facts.title}`,
		`${n} new ${n === 1 ? "reply" : "replies"}.`,
		replies,
		totals,
	);
}

/**
 * Somebody typed their address on a share link. A concrete URL, not a
 * placeholder: it goes to exactly one person, through `sendOne`.
 */
export function joinLinkEmail(input: {
	title: string;
	url: string;
	coverUrl: string | null;
	look?: EmailLook | null;
}): Rendered {
	return email({
		subject: `Your invite: ${input.title}`,
		kicker: "Here's your link",
		heading: input.title,
		coverUrl: input.coverUrl,
		look: input.look,
		blocks: [
			{
				kind: "text",
				text: "Tap below to see the details and answer. The link signs you in, so keep it to yourself.",
			},
			{
				kind: "buttons",
				items: [{ label: "Open the invite", href: input.url }],
			},
			{ kind: "pasteLink", url: input.url },
			{
				kind: "muted",
				text: "Didn't ask for this? Ignore it and nothing happens.",
			},
		],
	});
}
