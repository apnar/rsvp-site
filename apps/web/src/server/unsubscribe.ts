import { createDb } from "@rsvp-site/db";
import {
	findPersonByUnsubscribeToken,
	suspend,
	unsuspend,
} from "@rsvp-site/db/people";
import { escapeHtml, layout } from "@rsvp-site/email";
import { getMailer } from "@rsvp-site/email/worker";
import { Hono } from "hono";

const CTA =
	"display:inline-block; padding:12px 20px; background:#2f5f86; color:#ffffff; border:0; font-weight:700; font-size:15px; cursor:pointer;";
const P = "margin:0 0 14px; font-size:16px; line-height:1.5;";
const FIELD = "margin:0 0 14px;";
const LABEL =
	"display:block; margin:0 0 6px; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#4a6d8c;";
const INPUT =
	"width:100%; box-sizing:border-box; padding:10px; border:1px solid #d9d6cc; font-size:15px; font-family:inherit;";
const CHOICE = "margin:0 0 6px; font-size:15px; line-height:1.5;";

/** How long a break lasts. Weeks, because that is how time away is measured. */
const DURATIONS = [
	{ value: "2", label: "Two weeks" },
	{ value: "4", label: "Four weeks", checked: true },
	{ value: "8", label: "Eight weeks" },
	{ value: "0", label: "Until I say otherwise" },
] as const;

function page(input: {
	heading: string;
	body: string;
	formHtml?: string;
	home: string;
}) {
	return layout({
		title: input.heading,
		kicker: "Your spot",
		heading: input.heading,
		bodyHtml: `<p style="${P}">${input.body}</p>${input.formHtml ?? ""}<p style="${P} color:#5f5f5f; font-size:14px;"><a href="${escapeHtml(input.home)}" style="color:#2f5f86;">Back to the site</a></p>`,
	});
}

function html(body: string, status: 200 | 404 = 200) {
	return new Response(body, {
		status,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}

/** Where a break ends, from the form's number of weeks. 0 means never. */
function untilFrom(weeks: string | undefined): Date | null {
	const n = Number(weeks);
	if (!Number.isFinite(n) || n <= 0) return null;
	return new Date(Date.now() + n * 7 * 24 * 60 * 60 * 1000);
}

function dateLabel(value: Date): string {
	return value.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		timeZone: "America/New_York",
	});
}

/**
 * The footer link from list emails lands here. There is no unsubscribe that
 * leaves somebody on the guest list any more: email is how this group talks,
 * so stepping away from the email is stepping away from the events. This asks
 * for how long and why, and holds their spot until then.
 *
 * It has to work from a plain tap in a mail app with no JavaScript, which is
 * why it is a real form. The GET only *shows* it -- mail clients prefetch
 * link targets, and the old version quietly unsubscribed people when they did.
 */
export const unsubscribe = new Hono();

unsubscribe.get("/:token", async (c) => {
	const token = c.req.param("token");
	const home = new URL("/", c.req.url).toString();
	const person = await findPersonByUnsubscribeToken(createDb(), token);
	if (!person || person.status === "deactivated") {
		return html(
			page({
				heading: "That link is not on the sheet.",
				body: "It may have been for an address that is no longer with us. Nothing changed.",
				home,
			}),
			404,
		);
	}

	if (person.status === "suspended") {
		return html(
			page({
				heading: "You're already taking a break.",
				body: `${escapeHtml(person.email)} is off the event emails and off the sheet. Ready to come back?`,
				formHtml: `<form method="post" action="/api/unsubscribe/${escapeHtml(token)}/back" style="margin:20px 0 6px;"><button type="submit" style="${CTA}">I'm back</button></form>`,
				home,
			}),
		);
	}

	const choices = DURATIONS.map(
		(d) =>
			`<p style="${CHOICE}"><label><input type="radio" name="weeks" value="${d.value}"${"checked" in d && d.checked ? " checked" : ""}> ${escapeHtml(d.label)}</label></p>`,
	).join("");

	return html(
		page({
			heading: "Taking a break?",
			body: "No event emails and no spot on the sheet until you're back. Your account stays exactly where it is, and one tap puts you back on it.",
			formHtml: `<form method="post" action="/api/unsubscribe/${escapeHtml(token)}" style="margin:20px 0 6px;">
<div style="${FIELD}"><label style="${LABEL}" for="reason">What's up? (optional)</label><input style="${INPUT}" type="text" id="reason" name="reason" maxlength="200" placeholder="Travelling, back in a month"></div>
<div style="${FIELD}"><span style="${LABEL}">For how long</span>${choices}</div>
<button type="submit" style="${CTA}">Hold my spot</button>
</form>`,
			home,
		}),
	);
});

/**
 * The form posts here, and so do mail clients honouring
 * List-Unsubscribe-Post -- which send no fields at all, so that lands as an
 * open-ended break with no reason. Exactly what "unsubscribe" used to mean.
 */
unsubscribe.post("/:token", async (c) => {
	const token = c.req.param("token");
	const home = new URL("/", c.req.url).toString();
	const db = createDb();
	const person = await findPersonByUnsubscribeToken(db, token);
	if (!person || person.status === "deactivated") {
		return c.text("Unknown token.", 404);
	}

	let reason: string | undefined;
	let until: Date | null = null;
	try {
		const form = await c.req.parseBody();
		reason = typeof form.reason === "string" ? form.reason : undefined;
		until = untilFrom(typeof form.weeks === "string" ? form.weeks : undefined);
	} catch {
		// A one-click unsubscribe from a mail app: no body, no form.
	}

	await suspend(db, { userId: person.id, reason, until, by: "mail" });

	// One-click clients want a bare 200, not a page.
	if (!c.req.header("accept")?.includes("text/html")) {
		return c.text("Done. Your spot is held.", 200);
	}
	return html(
		page({
			heading: until ? `See you ${dateLabel(until)}.` : "Spot held.",
			body: until
				? `${escapeHtml(person.email)} is off the event emails until then, and we'll put you back on the sheet automatically. Come back sooner if plans change.`
				: `${escapeHtml(person.email)} is off the event emails until you say otherwise. No hard feelings; one tap puts you back on.`,
			formHtml: `<form method="post" action="/api/unsubscribe/${escapeHtml(token)}/back" style="margin:20px 0 6px;"><button type="submit" style="${CTA}">Actually, I'm fine</button></form>`,
			home,
		}),
	);
});

unsubscribe.post("/:token/back", async (c) => {
	const token = c.req.param("token");
	const home = new URL("/", c.req.url).toString();
	const db = createDb();
	const person = await findPersonByUnsubscribeToken(db, token);
	if (!person || person.status === "deactivated") {
		return c.text("Unknown token.", 404);
	}
	await unsuspend(db, person.id);
	// Brevo may have them blocklisted from a bounce or a mail-app unsubscribe;
	// without this they would read as active and be quietly undeliverable.
	await getMailer().unblock(person.email);
	return html(
		page({
			heading: "You're back on.",
			body: `${escapeHtml(person.email)} will get the event emails again, and you're back on the sheet. See you at the next one.`,
			home,
		}),
	);
});
