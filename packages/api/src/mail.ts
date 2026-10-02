import {
	type Audience,
	ensureLinkToken,
	ensureUnsubscribeToken,
	listRecipients,
	markLinkSent,
} from "@rsvp-site/db/people";
import { type EmailKind, emailSend } from "@rsvp-site/db/schema/email";
import { rsvp } from "@rsvp-site/db/schema/rsvp";
import type {
	ListRecipient,
	ListResult,
	Rendered,
	SendOutcome,
} from "@rsvp-site/email";
import { messageEmail, type RsvpFacts, welcomeEmail } from "@rsvp-site/email";
import { getMailer, siteUrl } from "@rsvp-site/email/worker";
import { asc, eq } from "drizzle-orm";

import { type Split, splitAudience } from "./audience";
import type { Context } from "./context";
import { CONFIRM_AT, PLAY_AT } from "./cycle";
import type { GameSummary } from "./games";
import { CAPACITY } from "./run";

type Db = Context["db"];

export type { EmailKind };

export type ListSendResult = ListResult & { sendId: string };

export function unsubscribeUrl(token: string): string {
	return `${siteUrl()}/api/unsubscribe/${token}`;
}

/**
 * The concrete sign-in link for one person. Unlike the links inside list
 * templates, this one is not a Brevo placeholder: it goes into an email
 * addressed to exactly one subscriber.
 */
export function welcomeLinkUrl(token: string): string {
	return `${siteUrl()}/api/auth/link?k=${token}&to=%2F%23rsvp`;
}

export function permitUrl(game: GameSummary): string | null {
	return game.permit ? `${siteUrl()}/api/permits/${game.permit.id}/file` : null;
}

/** Every fact the five cycle emails share about one game. */
export function rsvpFacts(game: GameSummary, split: Split): RsvpFacts {
	return {
		gameId: game.id,
		dateLabel: game.dateLabel,
		timeLabel: game.timeLabel,
		location: game.location,
		notes: game.notes,
		siteUrl: siteUrl(),
		inNames: split.inNames,
		maybeNames: split.maybeNames,
		inCount: split.yes,
		confirmAt: CONFIRM_AT,
		playAt: PLAY_AT,
		capacity: CAPACITY,
	};
}

/** The sheet for a game, in the shape the audience split wants. */
export async function readSheet(db: Db, gameId: string) {
	return db
		.select({
			name: rsvp.name,
			nameKey: rsvp.nameKey,
			userId: rsvp.userId,
			addedBy: rsvp.addedBy,
			response: rsvp.response,
		})
		.from(rsvp)
		.where(eq(rsvp.gameId, gameId))
		.orderBy(asc(rsvp.createdAt))
		.all();
}

/** The sheet and the list together, split into who hears what. */
export async function readSplit(db: Db, gameId: string): Promise<Split> {
	const [rows, active] = await Promise.all([
		readSheet(db, gameId),
		listRecipients(db, "active"),
	]);
	return splitAudience(
		rows,
		active.map((p) => ({ id: p.id, name: p.name ?? "" })),
	);
}

export function renderMessage(input: {
	subject: string;
	body: string;
}): Rendered {
	return messageEmail({ ...input, siteUrl: siteUrl() });
}

/** How many people a send of this audience would reach right now. */
export async function countRecipients(
	db: Db,
	audience: Audience = "active",
): Promise<number> {
	return (await listRecipients(db, audience)).length;
}

/** Both numbers at once, for the audience picker. */
export async function recipientCounts(
	db: Db,
): Promise<{ active: number; everyone: number }> {
	const [active, everyone] = await Promise.all([
		countRecipients(db, "active"),
		countRecipients(db, "everyone"),
	]);
	return { active, everyone };
}

/**
 * Send one rendered email to the list (or a subset by id) and record the
 * outcome in `email_send`. Returns null when nobody would receive it.
 *
 * `audience` defaults to "active", which is what game email always wants:
 * somebody on a break does not need to hear that a venue is booked. Only
 * the ad-hoc message ever passes "everyone", and nothing reaches anybody
 * deactivated -- `listRecipients` will not return them at all.
 */
export async function sendToList(
	db: Db,
	opts: {
		kind: EmailKind;
		gameId?: string | null;
		rendered: Rendered;
		sentBy?: string | null;
		audience?: Audience;
		onlyPersonIds?: string[];
	},
): Promise<ListSendResult | null> {
	const audience = opts.audience ?? "active";
	let people = await listRecipients(db, audience);
	if (opts.onlyPersonIds) {
		const wanted = new Set(opts.onlyPersonIds);
		people = people.filter((p) => wanted.has(p.id));
	}
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
		gameId: opts.gameId ?? null,
		subject: opts.rendered.subject,
		audience,
		recipientCount: result.attempted,
		failedCount: result.attempted - result.sent,
		messageIds: JSON.stringify(result.messageIds),
		errors: JSON.stringify(result.failed),
		sentBy: opts.sentBy ?? null,
	});
	return { ...result, sendId };
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
	const token = await ensureLinkToken(db, userId);
	const outcome = await getMailer().sendOne(
		{ email: person.email, name: person.name },
		welcomeEmail({ name: person.name, url: welcomeLinkUrl(token) }),
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
