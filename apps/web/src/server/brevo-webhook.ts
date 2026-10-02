import { createDb } from "@rsvp-site/db";
import { unsubscribe } from "@rsvp-site/db/people";
import type { UnsubscribeReason } from "@rsvp-site/db/schema/auth";
import { env } from "@rsvp-site/env/server";
import { Hono } from "hono";

/**
 * Brevo transactional webhook. Brevo adds its own List-Unsubscribe header to
 * every email, so people can stop the mail from their mail app without ever
 * touching the site; this keeps the site in step with that, and also stops
 * mail to addresses that bounce hard or mark us as spam.
 *
 * All of it unsubscribes the address, never deactivates it: not being able
 * to reach somebody is not grounds for locking them out, and only an admin
 * does that anyway. The reason is recorded, so the admin page shows this
 * was the mail and not the person.
 *
 * Registered with `auth: { type: "bearer", token: BREVO_WEBHOOK_SECRET }`
 * (see README "Email"). Events arrive one per request, or as an array when
 * the webhook was created with `batched: true`.
 */
export const brevoWebhook = new Hono();

/** Payload `event` values that mean "stop emailing this address", and why. */
const DROP_EVENTS = new Map<string, UnsubscribeReason>([
	["unsubscribed", "self"],
	["hard_bounce", "bounce"],
	["spam", "spam"],
	["invalid_email", "invalid"],
]);

type BrevoEvent = { event?: string; email?: string; reason?: string };

brevoWebhook.post("/", async (c) => {
	const secret = env.BREVO_WEBHOOK_SECRET;
	if (!secret) return c.text("Not found.", 404);
	const auth = c.req.header("authorization") ?? "";
	if (auth !== `Bearer ${secret}`) return c.text("Forbidden.", 403);

	let payload: unknown;
	try {
		payload = await c.req.json();
	} catch {
		return c.text("Bad JSON.", 400);
	}
	const events = (Array.isArray(payload) ? payload : [payload]).filter(
		(e): e is BrevoEvent => typeof e === "object" && e !== null,
	);

	const db = createDb();
	let dropped = 0;
	for (const e of events) {
		const reason = e.event ? DROP_EVENTS.get(e.event) : undefined;
		if (!e.email || !reason) continue;
		// Only somebody still subscribed, so a repeat event keeps the first
		// reason rather than overwriting it.
		if (await unsubscribe(db, { email: e.email }, reason)) {
			dropped++;
			console.log(`brevo webhook: ${e.event} -> unsubscribed ${e.email}`);
		}
	}
	return c.json({ received: events.length, dropped });
});
