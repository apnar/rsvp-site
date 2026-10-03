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
	buttons,
	type EmailLook,
	escapeHtml,
	type Fact,
	factsTable,
	layout,
	listFooter,
	listFooterText,
	muted,
	paragraphs,
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

const P = "margin:0 0 14px; font-size:16px; line-height:1.5;";

function para(text: string): string {
	return `<p style="${P}">${escapeHtml(text)}</p>`;
}

const ANSWER_LABEL: Record<RsvpAnswer, string> = {
	yes: "Yes!",
	maybe: "Maybe",
	no: "Can't",
};

const ANSWERS: readonly RsvpAnswer[] = ["yes", "maybe", "no"];

function answerButtons(facts: EventFacts): string {
	return buttons(
		ANSWERS.map((a) => ({
			label: ANSWER_LABEL[a],
			href: rsvpLink(facts.siteUrl, facts.eventId, a),
			tone: a === "yes" ? "lime" : "outline",
		})),
	);
}

function answerLines(facts: EventFacts): string[] {
	return ANSWERS.map(
		(a) => `${ANSWER_LABEL[a]}: ${rsvpLink(facts.siteUrl, facts.eventId, a)}`,
	);
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
	heading: string;
	lead: string;
	facts: Fact[];
	/** Extra HTML after the facts (already escaped). */
	bodyExtra?: string;
	/** The same extra, as text lines. */
	textExtra?: string[];
	/** Show the three answer buttons; otherwise one "Open the invite". */
	answers: boolean;
	tail?: string;
};

function render(facts: EventFacts, parts: Parts): Rendered {
	const open = eventLink(facts.siteUrl, facts.eventId);
	const html = layout({
		title: parts.subject,
		kicker: parts.kicker,
		heading: parts.heading,
		coverUrl: facts.coverKey ? coverUrl(facts.siteUrl, facts.coverKey) : null,
		look: facts.look,
		bodyHtml: [
			para(parts.lead),
			parts.facts.length > 0 ? factsTable(parts.facts) : "",
			parts.bodyExtra ?? "",
			parts.answers
				? answerButtons(facts)
				: buttons([{ label: "Open the invite", href: open }]),
			parts.tail ? muted(escapeHtml(parts.tail)) : "",
		]
			.filter(Boolean)
			.join("\n"),
		footerHtml: listFooter(),
	});
	const text = [
		parts.heading,
		"",
		parts.lead,
		"",
		...parts.facts.map((f) => `${f.label}: ${f.value}`),
		...(parts.textExtra ?? []),
		"",
		...(parts.answers ? answerLines(facts) : [`Open the invite: ${open}`]),
		...(parts.tail ? ["", parts.tail] : []),
		"",
		listFooterText(),
	].join("\n");
	return { subject: parts.subject, html, text };
}

function hostedBy(facts: EventFacts): string {
	return facts.hostLine.trim()
		? `${facts.hostLine.trim()} would love to see you.`
		: "You're invited.";
}

function detailsBlock(facts: EventFacts): {
	bodyExtra?: string;
	textExtra?: string[];
} {
	const details = facts.details.trim();
	return details
		? { bodyExtra: paragraphs(details), textExtra: ["", details] }
		: {};
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
		heading: facts.title,
		lead: invitedBy
			? `${invitedBy} is going and invited you along${host ? `. Hosted by ${host}.` : "."}`
			: hostedBy(facts),
		facts: eventFacts(facts, true),
		...detailsBlock(facts),
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
		heading: facts.title,
		lead: `The hosts are counting heads and would like an answer${by}.`,
		facts: eventFacts(facts, true),
		answers: true,
	});
}

/** A host pressing "Nudge". */
export function nudgeEmail(facts: EventFacts): Rendered {
	return render(facts, {
		subject: `Coming? ${facts.title}`,
		kicker: "A nudge from the host",
		heading: facts.title,
		lead: "We haven't heard from you yet. Are you coming?",
		facts: eventFacts(facts, true),
		answers: true,
	});
}

/** To yeses and maybes, the day before. */
export function dayBeforeEmail(facts: EventFacts): Rendered {
	return render(facts, {
		subject: `Tomorrow: ${facts.title}`,
		kicker: "See you tomorrow",
		heading: facts.title,
		lead: "It's tomorrow. Here's the when and where.",
		facts: eventFacts(facts, false),
		...detailsBlock(facts),
		answers: false,
		tail: "Plans changed? Update your answer on the invite page so the hosts know.",
	});
}

/** Date, time or place moved. `changes` says what it was and is now. */
export function updateEmail(
	facts: EventFacts,
	changes: { label: string; was: string; now: string }[],
): Rendered {
	const html = changes
		.map(
			(c) =>
				`<p style="${P}"><strong>${escapeHtml(c.label)}:</strong> ${escapeHtml(c.now)} <span style="color:#5E5577; text-decoration:line-through;">${escapeHtml(c.was)}</span></p>`,
		)
		.join("\n");
	return render(facts, {
		subject: `Change of plans: ${facts.title}`,
		kicker: "Change of plans",
		heading: facts.title,
		lead: "The hosts changed some details.",
		facts: [],
		bodyExtra: `${html}\n${factsTable(eventFacts(facts, false))}`,
		textExtra: [
			...changes.map((c) => `${c.label}: ${c.now} (was ${c.was})`),
			"",
			...eventFacts(facts, false).map((f) => `${f.label}: ${f.value}`),
		],
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
		heading: facts.title,
		lead: whenLine(facts)
			? `${facts.title} on ${facts.dateLabel ?? whenLine(facts)} is canceled.`
			: `${facts.title} is canceled.`,
		facts: [],
		...(said ? { bodyExtra: paragraphs(said), textExtra: ["", said] } : {}),
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
	adults: number;
	kids: number;
};

const RESPONSE_WORD: Record<RsvpAnswer, string> = {
	yes: "Yes",
	maybe: "Maybe",
	no: "Can't",
};

function partyLine(r: ReplyLine): string {
	if (r.response === "no") return RESPONSE_WORD.no;
	const people = [
		`${r.adults} ${r.adults === 1 ? "adult" : "adults"}`,
		...(r.kids > 0 ? [`${r.kids} ${r.kids === 1 ? "kid" : "kids"}`] : []),
	];
	return `${RESPONSE_WORD[r.response]} · ${people.join(", ")}`;
}

function totalsLine(t: Totals): string {
	return `${t.yes} yes · ${t.maybe} maybe · ${t.no} can't · ${t.waiting} waiting · expecting ${t.adults + t.kids}`;
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
	const list = guestListLink(facts);
	const rows = replies
		.map(
			(r) =>
				`<tr><td style="padding:6px 14px 6px 0; font-weight:700; vertical-align:top;">${escapeHtml(r.name)}</td><td style="padding:6px 0; vertical-align:top;">${escapeHtml(partyLine(r))}${r.note.trim() ? `<br><span style="color:#5E5577;">"${escapeHtml(r.note.trim())}"</span>` : ""}</td></tr>`,
		)
		.join("");
	const html = layout({
		title: subject,
		kicker: facts.title,
		heading,
		bodyHtml: [
			`<table role="presentation" style="margin:0 0 18px; border-collapse:collapse; font-size:16px; line-height:1.4;">${rows}</table>`,
			`<p style="${P}">${escapeHtml(totalsLine(totals))}</p>`,
			buttons([{ label: "Guest list", href: list }]),
		].join("\n"),
		footerHtml: listFooter(),
	});
	const text = [
		heading,
		"",
		...replies.map(
			(r) =>
				`${r.name}: ${partyLine(r)}${r.note.trim() ? ` -- "${r.note.trim()}"` : ""}`,
		),
		"",
		totalsLine(totals),
		"",
		`Guest list: ${list}`,
		"",
		listFooterText(),
	].join("\n");
	return { subject, html, text };
}

/** One reply, to the hosts, as it lands. */
export function hostAlertEmail(
	facts: EventFacts,
	reply: ReplyLine,
	totals: Totals,
): Rendered {
	return hostRender(
		facts,
		`${reply.name}: ${RESPONSE_WORD[reply.response]} · ${facts.title}`,
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
	const subject = `Your invite: ${input.title}`;
	const html = layout({
		title: subject,
		kicker: "Here's your link",
		heading: input.title,
		coverUrl: input.coverUrl,
		look: input.look,
		bodyHtml: [
			para(
				"Tap below to see the details and answer. The link signs you in, so keep it to yourself.",
			),
			buttons([{ label: "Open the invite", href: input.url }]),
			muted(
				`Or paste this into a browser:<br><a href="${escapeHtml(input.url)}" style="color:#B0236C; word-break:break-all;">${escapeHtml(input.url)}</a>`,
			),
			muted("Didn't ask for this? Ignore it and nothing happens."),
		].join("\n"),
	});
	const text = [
		input.title,
		"",
		"Tap below to see the details and answer. The link signs you in, so keep it to yourself.",
		"",
		input.url,
		"",
		"Didn't ask for this? Ignore it and nothing happens.",
	].join("\n");
	return { subject, html, text };
}
