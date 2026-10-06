import type { Db } from "@rsvp-site/db";
import { inChunks, mapChunks } from "@rsvp-site/db/batch";
import { logError } from "@rsvp-site/db/errors";
import {
	countRecipients,
	listRecipients,
	listTextable,
	markLinkSent,
	type Recipient,
	type TextRecipient,
} from "@rsvp-site/db/people";
import { NO_EMAIL_DOMAIN, user } from "@rsvp-site/db/schema/auth";
import {
	type EmailAudience,
	type EmailKind,
	emailSend,
} from "@rsvp-site/db/schema/email";
import { eventGuest } from "@rsvp-site/db/schema/event";
import type { SmsKind } from "@rsvp-site/db/schema/sms";
import { ensureLinkToken, ensureUnsubscribeToken } from "@rsvp-site/db/tokens";
import { emailLook } from "@rsvp-site/design/theme";
import type {
	AlertReply,
	EmailLook,
	EventFacts,
	ListRecipient,
	ListResult,
	Rendered,
	SendOutcome,
} from "@rsvp-site/email";
import {
	hostAlertEmail,
	inviteEmail,
	mediaUrl,
	messageEmail,
	welcomeEmail,
} from "@rsvp-site/email";
import { getMailer, siteUrl } from "@rsvp-site/email/worker";
import { hostAlertText, inviteText } from "@rsvp-site/sms";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { answersOf } from "./answer-words";
import { channelsFor, type Purpose, type Via, viaOf } from "./channels";
import {
	type EventRow,
	guestCountsOf,
	guestsOf,
	hostIdsOf,
	labelsOf,
} from "./events";
import { type GuestCounts, headcount, tally } from "./headcount";
import {
	hostNameOf,
	mmsUrlOf,
	prepareTexts,
	sendPrepared,
	textFactsOf,
} from "./texting";

export type { EmailKind };

/** The reply tallies a host email shows, with "expecting" counted by headcount.ts. */
export function hostTotals(guests: readonly GuestCounts[]) {
	const t = tally(guests);
	return { ...t, expecting: headcount(t) };
}

/** Sends that go to an event's hosts rather than its guests. */
const HOST_KINDS = new Set<EmailKind>(["host_alert", "host_digest"]);

export type ListSendResult = ListResult & { sendId: string };

export function unsubscribeUrl(token: string): string {
	return `${siteUrl()}/api/unsubscribe/${token}`;
}

/**
 * A concrete sign-in link for one person. Unlike the links inside list
 * templates, this one is not a Brevo placeholder: it goes into an email
 * addressed to exactly one person.
 */
export function signInUrl(token: string, to = "/events"): string {
	return `${siteUrl()}/api/auth/link?k=${token}&to=${encodeURIComponent(to)}`;
}

/** Every fact the event emails share. */
export function eventFacts(row: EventRow): EventFacts {
	return {
		eventId: row.id,
		title: row.title,
		hostLine: row.hostLine,
		location: row.location,
		details: row.details,
		coverKey: row.coverKey,
		siteUrl: siteUrl(),
		...labelsOf(row),
		look: lookOf(row),
		answers: answersOf(row),
	};
}

/** The event's design as email can carry it, when the design is on. */
export function lookOf(row: EventRow): EmailLook | null {
	if (!row.designOn || !row.theme) return null;
	const labels = labelsOf(row);
	const alt = [row.title, labels.dateLabel, labels.timeLabel]
		.filter(Boolean)
		.join(" · ");
	return emailLook(
		row.theme,
		row.cardKey ? mediaUrl(siteUrl(), row.cardKey) : null,
		alt,
	);
}

export function renderMessage(input: {
	subject: string;
	body: string;
}): Rendered {
	return messageEmail({ ...input, siteUrl: siteUrl() });
}

/** How many people a message to everyone would reach right now. */
export async function countEveryone(db: Db): Promise<number> {
	return countRecipients(db);
}

/**
 * Send one rendered email to everybody, or to a subset by id, and record the
 * outcome in `email_send`. Returns null when nobody would receive it.
 * Nobody deactivated or unsubscribed is ever in the list, whatever ids are
 * asked for -- `listRecipients` will not return them.
 */
export async function sendToList(
	db: Db,
	opts: {
		kind: EmailKind;
		eventId?: string | null;
		rendered: Rendered;
		sentBy?: string | null;
		onlyPersonIds?: readonly string[];
	},
): Promise<ListSendResult | null> {
	const people = await listRecipients(db, opts.onlyPersonIds);
	if (people.length === 0) return null;
	return sendEmails(db, people, {
		...opts,
		audience: HOST_KINDS.has(opts.kind)
			? "hosts"
			: opts.onlyPersonIds
				? "guests"
				: "everyone",
	});
}

/** One list send to people `listRecipients` returned, logged in `email_send`. */
async function sendEmails(
	db: Db,
	people: readonly Recipient[],
	opts: {
		kind: EmailKind;
		eventId?: string | null;
		rendered: Rendered;
		sentBy?: string | null;
		audience: EmailAudience;
	},
): Promise<ListSendResult> {
	const recipients: ListRecipient[] = people.map((p) => ({
		email: p.email,
		name: p.name,
		unsubscribeUrl: unsubscribeUrl(p.unsubscribeToken ?? ""),
		linkToken: p.linkToken,
	}));
	const result = await getMailer().sendList(recipients, opts.rendered, {
		tags: [opts.kind],
	});
	const sendId = crypto.randomUUID();
	// The mail has left. A log row that fails to write must not read as a
	// failed send to the callers: they would give their claims back and the
	// next Send or cron pass would email everybody a second time.
	try {
		await db.insert(emailSend).values({
			id: sendId,
			kind: opts.kind,
			eventId: opts.eventId ?? null,
			subject: opts.rendered.subject,
			audience: opts.audience,
			recipientCount: result.attempted,
			failedCount: result.attempted - result.sent,
			messageIds: JSON.stringify(result.messageIds),
			errors: JSON.stringify(result.failed),
			sentBy: opts.sentBy ?? null,
		});
	} catch (error) {
		logError(`email_send row not written (${opts.kind} ${sendId})`, error);
	}
	return { ...result, sendId };
}

/** What an event send did, person by person rather than address by address. */
export type Delivery = {
	/** People it went to by at least one channel. */
	attempted: number;
	/** Of those, the people at least one channel reached. */
	sent: number;
	/** People every one of whose channels failed. */
	failedIds: string[];
	/** How it reached each person it reached. */
	via: Map<string, Via>;
};

/**
 * Send one event message to these people, each by the channels
 * `channelsFor` picks for them: the email as one list send, the text
 * one per person with their own `/t/` link to `path`. Returns null when
 * nobody can be reached by either -- the same "nobody" `sendToList` meant.
 * Every guest- and host-facing event message goes through here; the
 * one-off sends (sign-in links, the admin's message) stay email-only.
 */
export async function deliver(
	db: Db,
	opts: {
		kind: EmailKind & SmsKind;
		eventId: string;
		people: readonly string[];
		purpose?: Purpose;
		rendered: Rendered;
		/** The text, given the person's link; null sends email only. */
		text: ((link: string) => string) | null;
		path: string;
		mediaUrl?: string | null;
		sentBy?: string | null;
	},
): Promise<Delivery | null> {
	const ids = [...new Set(opts.people)];
	if (ids.length === 0) return null;
	const purpose = opts.purpose ?? "guest";
	const [mailable, textable, prefs] = await Promise.all([
		listRecipients(db, ids),
		opts.text ? listTextable(db, ids) : Promise.resolve([]),
		mapChunks(ids, (slice) =>
			db
				.select({
					id: user.id,
					contactBy: user.contactBy,
					alertsBy: user.alertsBy,
				})
				.from(user)
				.where(inArray(user.id, slice))
				.all(),
		),
	]);
	const byMail = new Map(mailable.map((p) => [p.id, p]));
	const byText = new Map(textable.map((p) => [p.id, p]));
	const via = new Map<string, Via>();
	const toMail: Recipient[] = [];
	const toText: TextRecipient[] = [];
	for (const p of prefs) {
		const mail = byMail.get(p.id);
		const text = byText.get(p.id);
		const c = channelsFor(
			{
				mailable: mail !== undefined,
				textable: text !== undefined,
				contactBy: p.contactBy,
				alertsBy: p.alertsBy,
			},
			purpose,
		);
		const v = viaOf(c);
		if (!v) continue;
		via.set(p.id, v);
		if (c.email && mail) toMail.push(mail);
		if (c.text && text) toText.push(text);
	}
	if (via.size === 0) return null;

	// The links are made before anything leaves: a D1 error here fails the
	// whole send with nothing sent, and the callers give their claims back.
	// Thrown after the email, the same error would hand back claims for
	// mail already delivered, and the next pass would send it again.
	const texts =
		toText.length > 0 && opts.text
			? await prepareTexts(db, toText, opts.path)
			: null;

	// Who each channel actually reached; a person is lost only when none did.
	const mailed = new Set<string>();
	const texted = new Set<string>();
	if (toMail.length > 0) {
		const result = await sendEmails(db, toMail, {
			kind: opts.kind,
			eventId: opts.eventId,
			rendered: opts.rendered,
			sentBy: opts.sentBy,
			audience: HOST_KINDS.has(opts.kind) ? "hosts" : "guests",
		});
		const refused = new Set(result.failed.flatMap((f) => f.emails));
		for (const p of toMail) if (!refused.has(p.email)) mailed.add(p.id);
	}
	if (texts && opts.text) {
		const result = await sendPrepared(db, texts, {
			kind: opts.kind,
			eventId: opts.eventId,
			mediaUrl: opts.mediaUrl,
			body: opts.text,
		});
		const refused = new Set(result.failedIds);
		for (const p of toText) if (!refused.has(p.id)) texted.add(p.id);
	}
	// What actually reached each person, not what was planned: a text that
	// failed beside a delivered email is an email invitation.
	const reached = new Map<string, Via>();
	for (const id of via.keys()) {
		const v = viaOf({ email: mailed.has(id), text: texted.has(id) });
		if (v) reached.set(id, v);
	}
	const lost = [...via.keys()].filter((id) => !reached.has(id));
	return {
		attempted: via.size,
		sent: reached.size,
		failedIds: lost,
		via: reached,
	};
}

/** What a notice after a saved change came to. */
export type Notice = { notified: number; noticeFailed: boolean };

/**
 * Send a notice about a change already written: an update, a
 * cancellation. The change stands either way, so a failure here is logged
 * and reported, never thrown -- thrown, it would tell the host their save
 * failed, and a retry finds nothing left to notify about.
 */
export async function notice(
	label: string,
	send: () => Promise<Delivery | null>,
): Promise<Notice> {
	try {
		const result = await send();
		return { notified: result?.sent ?? 0, noticeFailed: false };
	} catch (error) {
		logError(`${label} notice failed`, error);
		return { notified: 0, noticeFailed: true };
	}
}

export type InviteOutcome = { sent: number; failed: number; skipped: number };

/**
 * Send the invitation to everybody on the list who has not had it yet.
 *
 * Read -> claim -> send: the rows are stamped `invited_at` before the mail
 * leaves, with a guarded UPDATE that only takes rows still unstamped, so a
 * double-clicked Send cannot invite anybody twice. A send that never left
 * gives its rows back for the next try.
 */
export async function sendInvites(
	db: Db,
	row: EventRow,
	sentBy: string | null,
	opts: {
		/** Only these rows -- a guest's own friend, not the host's backlog. */
		onlyGuestIds?: readonly string[];
		/** The guest who brought them, named in the email. */
		invitedBy?: string | null;
		/**
		 * Leave out people who have already answered -- on a paper event they
		 * did it from the card, and "You're invited" would be news to nobody.
		 */
		skipAnswered?: boolean;
	} = {},
): Promise<InviteOutcome> {
	const only = opts.onlyGuestIds ? new Set(opts.onlyGuestIds) : null;
	const guests = (await guestsOf(db, row.id)).filter(
		(g) =>
			(!only || only.has(g.id)) && !(opts.skipAnswered && g.response !== null),
	);
	const pending = guests.filter((g) => g.invitedAt === null && !g.unreachable);
	const skipped = guests.filter(
		(g) => g.invitedAt === null && g.unreachable,
	).length;
	if (pending.length === 0) return { sent: 0, failed: 0, skipped };

	const now = new Date();
	const claimed: string[] = [];
	for (const slice of inChunks(pending)) {
		const ids = slice.map((g) => g.id);
		const rows = await db
			.update(eventGuest)
			.set({ invitedAt: now })
			.where(and(inArray(eventGuest.id, ids), isNull(eventGuest.invitedAt)))
			.returning({ userId: eventGuest.userId })
			.all();
		claimed.push(...rows.map((r) => r.userId));
	}
	if (claimed.length === 0) return { sent: 0, failed: 0, skipped };

	let result: Delivery | null;
	try {
		const [hostName, picture] = await Promise.all([
			hostNameOf(db, row),
			mmsUrlOf(row),
		]);
		const facts = textFactsOf(row, hostName);
		result = await deliver(db, {
			kind: "invite",
			eventId: row.id,
			people: claimed,
			rendered: inviteEmail(eventFacts(row), opts.invitedBy ?? null),
			text: (link) => inviteText(facts, link, opts.invitedBy ?? null),
			path: `/e/${row.id}`,
			mediaUrl: picture,
			sentBy,
		});
	} catch (error) {
		await releaseGuestClaim(db, row.id, "invitedAt", now);
		throw error;
	}
	if (!result || result.sent === 0) {
		await releaseGuestClaim(db, row.id, "invitedAt", now);
		return { sent: 0, failed: result?.attempted ?? 0, skipped };
	}
	// Somebody no channel reached gets their row back, so the next Send
	// tries them and nobody else.
	if (result.failedIds.length > 0) {
		await releaseGuestClaim(db, row.id, "invitedAt", now, {
			by: "userId",
			ids: result.failedIds,
		});
	}
	await stampVia(db, row.id, now, result);
	return {
		sent: result.sent,
		failed: result.attempted - result.sent,
		skipped,
	};
}

/** Record how each invitation went, on the rows this send claimed. */
async function stampVia(
	db: Db,
	eventId: string,
	stamp: Date,
	result: Delivery,
) {
	const lost = new Set(result.failedIds);
	const byVia = new Map<Via, string[]>();
	for (const [id, v] of result.via) {
		if (!lost.has(id)) byVia.set(v, [...(byVia.get(v) ?? []), id]);
	}
	for (const [v, ids] of byVia) {
		for (const slice of inChunks(ids)) {
			await db
				.update(eventGuest)
				.set({ invitedVia: v })
				.where(
					and(
						eq(eventGuest.eventId, eventId),
						eq(eventGuest.invitedAt, stamp),
						inArray(eventGuest.userId, slice),
					),
				);
		}
	}
}

/**
 * Give back a claim on guest rows, keyed on the claim's own timestamp, so a
 * failed send returns exactly the rows it took and nothing a concurrent
 * send stamped. Used for the invitation stamp and the nudge's: a send that
 * never left must leave its guests sendable, not waiting out a cooldown for
 * a message they never got.
 */
export async function releaseGuestClaim(
	db: Db,
	eventId: string,
	column: "invitedAt" | "nudgedAt",
	stamp: Date,
	/** Only these rows, by guest id or person id; everything the claim took when omitted. */
	only?: { by: "id" | "userId"; ids: readonly string[] },
) {
	for (const slice of only ? inChunks(only.ids) : [undefined]) {
		await db
			.update(eventGuest)
			.set({ [column]: null })
			.where(
				and(
					eq(eventGuest.eventId, eventId),
					eq(eventGuest[column], stamp),
					only && slice ? inArray(eventGuest[only.by], slice) : undefined,
				),
			);
	}
}

/**
 * One reply, straight to the event's hosts, when they asked for each one.
 * Awaited by the RSVP mutation: nothing plumbs an ExecutionContext through
 * oRPC to defer it, and one small send is quick. A failure is logged, not
 * thrown -- the guest's answer is saved either way.
 */
export async function alertHosts(
	db: Db,
	row: EventRow,
	reply: AlertReply,
	replierId: string,
): Promise<void> {
	if (row.hostAlerts !== "each") return;
	try {
		const hostIds = (await hostIdsOf(db, row.id)).filter(
			(id) => id !== replierId,
		);
		if (hostIds.length === 0) return;
		const totals = hostTotals(await guestCountsOf(db, row.id));
		const words = answersOf(row).words;
		const lines = [
			...(reply.self === false ? [] : [reply]),
			...(reply.for ?? []),
		];
		const first = lines[0] ?? reply;
		await deliver(db, {
			kind: "host_alert",
			eventId: row.id,
			people: hostIds,
			purpose: "alerts",
			rendered: hostAlertEmail(eventFacts(row), reply, totals),
			text: (link) =>
				hostAlertText(
					{
						title: row.title,
						guestName:
							lines.length > 1
								? `${first.name} +${lines.length - 1}`
								: first.name,
						answer: words[first.response].pick,
						party: first.response === "no" ? null : partyLabel(first),
					},
					link,
				),
			path: `/e/${row.id}/guests`,
		});
	} catch (error) {
		logError("host alert failed", error);
	}
}

/** "2 adults, 1 kid" -- and never "0 adults" for a child answered for. */
export function partyLabel(p: { adults: number; kids: number }): string | null {
	const part = (n: number, one: string) =>
		n > 0 ? [`${n} ${one}${n === 1 ? "" : "s"}`] : [];
	const words = [...part(p.adults, "adult"), ...part(p.kids, "kid")];
	return words.length > 0 ? words.join(", ") : null;
}

/**
 * Send someone their way in: the welcome email, carrying their own sign-in
 * link. Used when an admin adds them, resends a link, or someone asks for
 * one from the login page.
 */
export async function sendWelcome(
	db: Db,
	userId: string,
	person: { email: string; name: string | null },
): Promise<SendOutcome> {
	// A name-only paper guest has no address to send to; their card's QR
	// code is their way in.
	if (!person.email || person.email.endsWith(`@${NO_EMAIL_DOMAIN}`)) {
		return { ok: false, status: 0, error: "They have no email address." };
	}
	const token = await ensureLinkToken(db, userId);
	const outcome = await getMailer().sendOne(
		{ email: person.email, name: person.name },
		welcomeEmail({ name: person.name, url: signInUrl(token) }),
		{ tags: ["welcome"] },
	);
	if (outcome.ok) await markLinkSent(db, userId);
	return outcome;
}

/** The pair of tokens a one-off personalised send needs. */
export async function tokensFor(
	db: Db,
	userId: string,
): Promise<{ key: string; unsubscribeUrl: string }> {
	const [key, token] = await Promise.all([
		ensureLinkToken(db, userId),
		ensureUnsubscribeToken(db, userId),
	]);
	return { key, unsubscribeUrl: unsubscribeUrl(token) };
}
