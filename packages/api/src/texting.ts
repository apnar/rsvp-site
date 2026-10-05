import type { Db } from "@rsvp-site/db";
import { insertChunks } from "@rsvp-site/db/batch";
import { notDeactivated, type TextRecipient } from "@rsvp-site/db/people";
import { textablePhone } from "@rsvp-site/db/phone";
import { user } from "@rsvp-site/db/schema/auth";
import { type SmsKind, smsSend } from "@rsvp-site/db/schema/sms";
import { blockNumber, blockOf } from "@rsvp-site/db/sms-status";
import { textLinksFor } from "@rsvp-site/db/text-links";
import { mediaUrl } from "@rsvp-site/email";
import { siteUrl } from "@rsvp-site/email/worker";
import { env } from "@rsvp-site/env/server";
import {
	blockFor,
	replyText,
	signInText,
	type TelnyxEvent,
	type TextFacts,
	type TextOutcome,
	testText,
} from "@rsvp-site/sms";
import { getTexter } from "@rsvp-site/sms/worker";
import { and, asc, eq, gt } from "drizzle-orm";

import { type EventRow, labelsOf } from "./events";

/** Over this a carrier may refuse a picture text; 600 KB is the safe line. */
const MMS_MAX_BYTES = 600 * 1024;

export function textLinkUrl(code: string): string {
	return `${siteUrl()}/t/${code}`;
}

/**
 * Who a text says invited them: the event's host line if the host wrote
 * one, else the first name of whoever made it.
 */
export async function hostNameOf(db: Db, row: EventRow): Promise<string> {
	if (row.hostLine.trim()) return row.hostLine.trim();
	if (!row.createdBy) return "";
	const host = await db
		.select({ firstName: user.firstName, name: user.name })
		.from(user)
		.where(eq(user.id, row.createdBy))
		.get();
	return host?.firstName || host?.name || "";
}

export function textFactsOf(row: EventRow, hostName: string): TextFacts {
	const labels = labelsOf(row);
	return {
		title: row.title,
		hostName,
		dateLabel: labels.dateLabel,
		timeLabel: labels.timeLabel,
		location: row.location,
		deadlineLabel: labels.deadlineLabel,
	};
}

/**
 * The picture an invitation text carries: the card while the design is
 * on, otherwise the cover. The small rendition when there is one; a
 * picture from before those existed goes only if it is small enough, and
 * otherwise the text goes without one rather than not at all.
 */
export async function mmsUrlOf(
	row: Pick<
		EventRow,
		"designOn" | "cardKey" | "cardMmsKey" | "coverKey" | "coverMmsKey"
	>,
): Promise<string | null> {
	const [small, full] =
		row.designOn && row.cardKey
			? [row.cardMmsKey, row.cardKey]
			: [row.coverMmsKey, row.coverKey];
	if (small) return mediaUrl(siteUrl(), small);
	if (!full) return null;
	const head = await env.MEDIA.head(full).catch(() => null);
	return head && head.size <= MMS_MAX_BYTES ? mediaUrl(siteUrl(), full) : null;
}

export type TextJob = {
	kind: SmsKind;
	eventId: string | null;
	/** Where each person's `/t/` link lands. */
	path: string;
	mediaUrl?: string | null;
	body: (link: string, person: TextRecipient) => string;
};

export type TextResult = {
	attempted: number;
	sent: number;
	/** People whose text Telnyx refused (or that failed to leave). */
	failedIds: string[];
};

/**
 * Text each of these people their own link, and log every text in
 * `sms_send`. A refusal that says something about the number itself (it
 * said STOP, it is a landline) blocks it, so it is not tried again.
 */
export async function sendTexts(
	db: Db,
	people: readonly TextRecipient[],
	job: TextJob,
): Promise<TextResult> {
	if (people.length === 0) return { attempted: 0, sent: 0, failedIds: [] };
	const codes = await textLinksFor(db, people, job.path);
	const ready = people.flatMap((p) => {
		const code = codes.get(p.id);
		return code ? [{ person: p, link: textLinkUrl(code) }] : [];
	});
	const outcomes = await getTexter().sendMany(
		ready.map(({ person, link }) => ({
			to: person.phone,
			text: job.body(link, person),
			mediaUrl: job.mediaUrl ?? null,
		})),
	);
	await recordTexts(
		db,
		ready.map(({ person }, i) => ({
			userId: person.id,
			phone: person.phone,
			outcome: outcomes[i],
		})),
		job,
	);
	const failedIds = [
		...people.filter((p) => !codes.has(p.id)).map((p) => p.id),
		...ready.flatMap(({ person }, i) => (outcomes[i]?.ok ? [] : [person.id])),
	];
	return {
		attempted: people.length,
		sent: people.length - failedIds.length,
		failedIds,
	};
}

/**
 * Log texts and block the numbers their refusals condemn. Like the email
 * log, a row that fails to write must not read as a failed send: the texts
 * have left, and the callers would give their claims back and text
 * everybody again.
 */
export async function recordTexts(
	db: Db,
	sent: { userId: string | null; phone: string; outcome?: TextOutcome }[],
	job: Pick<TextJob, "kind" | "eventId" | "mediaUrl">,
): Promise<void> {
	const rows = sent.map(({ userId, phone, outcome }) => ({
		id: crypto.randomUUID(),
		telnyxId: outcome?.ok ? outcome.id || null : null,
		kind: job.kind,
		eventId: job.eventId,
		userId,
		phone,
		status: outcome?.ok ? ("queued" as const) : ("failed" as const),
		errorCode: outcome && !outcome.ok ? outcome.code : null,
		error: outcome && !outcome.ok ? outcome.error.slice(0, 500) : null,
		parts: outcome?.ok ? outcome.parts : 1,
		media: Boolean(job.mediaUrl),
	}));
	try {
		for (const slice of insertChunks(smsSend, rows)) {
			await db.insert(smsSend).values(slice);
		}
		for (const { phone, outcome } of sent) {
			const reason = outcome && !outcome.ok ? blockFor(outcome.code) : null;
			if (reason) await blockNumber(db, phone, reason);
		}
	} catch (error) {
		console.error("sms_send rows not written", job.kind, error);
	}
}

/** At most this many people's links in one sign-in text. */
const SIGN_IN_MAX = 3;
const SIGN_IN_COOLDOWN_MS = 10 * 60_000;

/**
 * "Text me my link": one text to the number with a sign-in link for each
 * active person who has it (a household may share one phone), unless the
 * number is blocked or had one in the last ten minutes. Consent isn't
 * asked: the person asked. Says nothing about what it found; the caller
 * answers the same either way.
 */
export async function textSignIn(db: Db, phone: string): Promise<void> {
	if (await blockOf(db, phone)) return;
	const recent = await db
		.select({ id: smsSend.id })
		.from(smsSend)
		.where(
			and(
				eq(smsSend.phone, phone),
				eq(smsSend.kind, "sign_in"),
				gt(smsSend.createdAt, new Date(Date.now() - SIGN_IN_COOLDOWN_MS)),
			),
		)
		.get();
	if (recent) return;
	const people = await db
		.select({ id: user.id, name: user.name, linkToken: user.linkToken })
		.from(user)
		.where(and(eq(user.phone, phone), notDeactivated()))
		.orderBy(asc(user.createdAt))
		.limit(SIGN_IN_MAX)
		.all();
	if (people.length === 0) return;
	const codes = await textLinksFor(db, people, "/events");
	const links = people.flatMap((p) => {
		const code = codes.get(p.id);
		return code ? [{ name: p.name, link: textLinkUrl(code) }] : [];
	});
	if (links.length === 0) return;
	const outcome = await getTexter().send({
		to: phone,
		text: signInText(links),
	});
	await recordTexts(
		db,
		[
			{
				userId: people.length === 1 ? (people[0]?.id ?? null) : null,
				phone,
				outcome,
			},
		],
		{ kind: "sign_in", eventId: null },
	);
}

/** An admin's test text to their own phone; the outcome, for the page. */
export async function sendTestText(
	db: Db,
	me: { id: string; phone: string | null },
): Promise<TextOutcome> {
	const phone = textablePhone(me.phone);
	if (!phone) {
		return {
			ok: false,
			status: 0,
			code: null,
			error: "Put a US mobile number on your account first.",
		};
	}
	const outcome = await getTexter().send({ to: phone, text: testText() });
	await recordTexts(db, [{ userId: me.id, phone, outcome }], {
		kind: "test",
		eventId: null,
	});
	return outcome;
}

/**
 * A status from Telnyx's webhook onto the text's log row. Returns the
 * number when the failure condemned it (STOP, landline, not a number) and
 * it was newly blocked.
 */
export async function recordStatus(
	db: Db,
	e: Extract<TelnyxEvent, { type: "status" }>,
): Promise<string | null> {
	const row = await db
		.select({ id: smsSend.id, phone: smsSend.phone, status: smsSend.status })
		.from(smsSend)
		.where(eq(smsSend.telnyxId, e.messageId))
		.get();
	if (!row) return null;
	// `message.sent` can arrive after the final word; it never undoes it.
	if (e.status === "sent" && row.status !== "queued") return null;
	await db
		.update(smsSend)
		.set({
			status: e.status,
			errorCode: e.errorCode,
			error: e.error?.slice(0, 500) ?? null,
		})
		.where(eq(smsSend.id, row.id));
	const reason = e.status === "failed" ? blockFor(e.errorCode) : null;
	return reason && (await blockNumber(db, row.phone, reason))
		? row.phone
		: null;
}

/** Whoever a texted-in number belongs to, a household at most. */
export function peopleByPhone(db: Db, phone: string) {
	return db
		.select({ id: user.id, name: user.name })
		.from(user)
		.where(and(eq(user.phone, phone), notDeactivated()))
		.limit(4)
		.all();
}

/** One "we can't read replies" per number per day, never a conversation. */
const REPLY_EVERY_MS = 24 * 60 * 60_000;

/**
 * Tell a guest once a day that nobody reads this number, so a "yes!" sent
 * here isn't taken as an answer. Only people we know: a reply to every
 * stranger would be ours to pay for, and a stranger's to receive unasked.
 */
export async function answerOnce(
	db: Db,
	from: string,
	people: readonly { id: string }[],
): Promise<void> {
	const recent = await db
		.select({ id: smsSend.id })
		.from(smsSend)
		.where(
			and(
				eq(smsSend.phone, from),
				eq(smsSend.kind, "reply"),
				gt(smsSend.createdAt, new Date(Date.now() - REPLY_EVERY_MS)),
			),
		)
		.get();
	if (recent) return;
	const outcome = await getTexter().send({ to: from, text: replyText() });
	await recordTexts(
		db,
		[
			{
				userId: people.length === 1 ? (people[0]?.id ?? null) : null,
				phone: from,
				outcome,
			},
		],
		{ kind: "reply", eventId: null },
	);
}
