import {
	ensureLinkToken,
	ensureUnsubscribeToken,
	listRecipients,
	markLinkSent,
} from "@rsvp-site/db/people";
import { NO_EMAIL_DOMAIN } from "@rsvp-site/db/schema/auth";
import { type EmailKind, emailSend } from "@rsvp-site/db/schema/email";
import { eventGuest } from "@rsvp-site/db/schema/event";
import { emailLook } from "@rsvp-site/design/theme";
import type {
	EmailLook,
	EventFacts,
	ListRecipient,
	ListResult,
	Rendered,
	SendOutcome,
} from "@rsvp-site/email";
import {
	cardUrl,
	hostAlertEmail,
	inviteEmail,
	messageEmail,
	type ReplyLine,
	welcomeEmail,
} from "@rsvp-site/email";
import { getMailer, siteUrl } from "@rsvp-site/email/worker";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Context } from "./context";
import { type EventRow, guestsOf, hostIdsOf, labelsOf } from "./events";
import { type GuestCounts, headcount, tally } from "./headcount";

type Db = Context["db"];

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
		row.cardKey ? cardUrl(siteUrl(), row.cardKey) : null,
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
	return (await listRecipients(db)).length;
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
	await db.insert(emailSend).values({
		id: sendId,
		kind: opts.kind,
		eventId: opts.eventId ?? null,
		subject: opts.rendered.subject,
		audience: HOST_KINDS.has(opts.kind)
			? "hosts"
			: opts.onlyPersonIds
				? "guests"
				: "everyone",
		recipientCount: result.attempted,
		failedCount: result.attempted - result.sent,
		messageIds: JSON.stringify(result.messageIds),
		errors: JSON.stringify(result.failed),
		sentBy: opts.sentBy ?? null,
	});
	return { ...result, sendId };
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
	for (let i = 0; i < pending.length; i += 90) {
		const ids = pending.slice(i, i + 90).map((g) => g.id);
		const rows = await db
			.update(eventGuest)
			.set({ invitedAt: now })
			.where(and(inArray(eventGuest.id, ids), isNull(eventGuest.invitedAt)))
			.returning({ userId: eventGuest.userId })
			.all();
		claimed.push(...rows.map((r) => r.userId));
	}
	if (claimed.length === 0) return { sent: 0, failed: 0, skipped };

	let result: ListSendResult | null;
	try {
		result = await sendToList(db, {
			kind: "invite",
			eventId: row.id,
			rendered: inviteEmail(eventFacts(row), opts.invitedBy ?? null),
			sentBy,
			onlyPersonIds: claimed,
		});
	} catch (error) {
		await releaseInvites(db, row.id, now);
		throw error;
	}
	if (!result || result.sent === 0) {
		await releaseInvites(db, row.id, now);
		return { sent: 0, failed: result?.attempted ?? 0, skipped };
	}
	return {
		sent: result.sent,
		failed: result.attempted - result.sent,
		skipped,
	};
}

async function releaseInvites(db: Db, eventId: string, stamp: Date) {
	// Keyed on the claim's own timestamp, so a failed send gives back exactly
	// the rows it took and nothing a concurrent send stamped.
	await db
		.update(eventGuest)
		.set({ invitedAt: null })
		.where(
			and(eq(eventGuest.eventId, eventId), eq(eventGuest.invitedAt, stamp)),
		);
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
	reply: ReplyLine,
	replierId: string,
): Promise<void> {
	if (row.hostAlerts !== "each") return;
	try {
		const hostIds = (await hostIdsOf(db, row.id)).filter(
			(id) => id !== replierId,
		);
		if (hostIds.length === 0) return;
		const totals = hostTotals(await guestsOf(db, row.id));
		await sendToList(db, {
			kind: "host_alert",
			eventId: row.id,
			rendered: hostAlertEmail(eventFacts(row), reply, totals),
			onlyPersonIds: hostIds,
		});
	} catch (error) {
		console.error("host alert failed", error);
	}
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
