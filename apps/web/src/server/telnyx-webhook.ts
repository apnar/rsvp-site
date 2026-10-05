import {
	answerOnce,
	peopleByPhone,
	recordStatus,
} from "@rsvp-site/api/texting";
import { createDb, type Db } from "@rsvp-site/db";
import { formatPhone } from "@rsvp-site/db/phone";
import { blockNumber, unblockNumber } from "@rsvp-site/db/sms-status";
import { escapeHtml, SENDER } from "@rsvp-site/email";
import { getMailer } from "@rsvp-site/email/worker";
import {
	keywordOf,
	parseTelnyxEvent,
	verifyTelnyxSignature,
} from "@rsvp-site/sms";
import { telnyxPublicKey } from "@rsvp-site/sms/worker";
import { Hono } from "hono";

/**
 * Telnyx's messaging webhook: what happened to each text we sent, and the
 * texts people send back.
 *
 * Telnyx answers STOP, START and HELP itself and keeps its own block on a
 * number that said STOP; this keeps the site in step (`sms_block`), so the
 * account page can say why texts stopped and sends skip the number instead
 * of paying for a refusal. Anything else somebody texts us is forwarded to
 * the site's inbox, since a guest who writes "running late!" expects a
 * person to read it.
 *
 * Signed with the account's Ed25519 key (TELNYX_PUBLIC_KEY); without one
 * the route is a 404, like the Brevo webhook without its secret.
 */
export const telnyxWebhook = new Hono();

/** Enough of a number to tell lines apart in the logs, not to dial it. */
function redactPhone(phone: string): string {
	return `...${phone.slice(-4)}`;
}

telnyxWebhook.post("/", async (c) => {
	const publicKey = telnyxPublicKey();
	if (!publicKey) return c.text("Not found.", 404);
	// The signature covers the bytes as sent, so read them before parsing.
	const rawBody = await c.req.text();
	const verified = await verifyTelnyxSignature({
		publicKey,
		signature: c.req.header("telnyx-signature-ed25519"),
		timestamp: c.req.header("telnyx-timestamp"),
		rawBody,
	});
	if (!verified) return c.text("Forbidden.", 403);

	let body: unknown;
	try {
		body = JSON.parse(rawBody);
	} catch {
		return c.text("Bad JSON.", 400);
	}
	const event = parseTelnyxEvent(body);
	const db = createDb();
	if (event.type === "status") {
		const blocked = await recordStatus(db, event);
		if (blocked) {
			console.log(
				`telnyx webhook: ${event.errorCode} -> blocked ${redactPhone(blocked)}`,
			);
		}
	} else if (event.type === "received") {
		await received(db, event.from, event.text);
	}
	// Anything else (a type we don't use) is acknowledged, or Telnyx retries it.
	return c.json({ ok: true });
});

async function received(db: Db, from: string, text: string) {
	const keyword = keywordOf(text);
	if (keyword === "stop") {
		if (await blockNumber(db, from, "stop")) {
			console.log(`telnyx webhook: STOP from ${redactPhone(from)}`);
		}
		return;
	}
	if (keyword === "start") {
		if (await unblockNumber(db, from)) {
			console.log(`telnyx webhook: START from ${redactPhone(from)}`);
		}
		return;
	}
	// Telnyx sends the profile's HELP answer itself.
	if (keyword === "help") return;

	const people = await peopleByPhone(db, from);
	await forward(from, text, people);
	if (people.length > 0) await answerOnce(db, from, people);
}

/** The text, by email to the site's own inbox, with who it seems to be from. */
async function forward(
	from: string,
	text: string,
	people: readonly { name: string }[],
) {
	const who = people.length > 0 ? people.map((p) => p.name).join(" or ") : "";
	const shown = formatPhone(from);
	const subject = `Text from ${who ? `${who}, ` : ""}${shown}`;
	const said = text.slice(0, 2000);
	const outcome = await getMailer().sendOne(
		{ email: SENDER.email, name: SENDER.name },
		{
			subject,
			text: `${subject}:\n\n${said}\n\nReplies to this email go nowhere; text them back from your own phone.`,
			html: `<p><strong>${escapeHtml(subject)}:</strong></p><p style="white-space:pre-wrap">${escapeHtml(said)}</p><p>Replies to this email go nowhere; text them back from your own phone.</p>`,
		},
		{ tags: ["sms-inbound"] },
	);
	if (!outcome.ok) console.error("forwarding a text failed", outcome.error);
}
