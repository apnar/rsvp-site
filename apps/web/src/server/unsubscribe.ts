import { createDb } from "@rsvp-site/db";
import {
	findPersonByUnsubscribeToken,
	resubscribe,
	unsubscribe as unsubscribePerson,
} from "@rsvp-site/db/people";
import {
	COLORS,
	escapeHtml,
	layout,
	muted,
	paraHtml,
	SITE_LABEL,
} from "@rsvp-site/email";
import { getMailer } from "@rsvp-site/email/worker";
import { Hono } from "hono";

const CTA = `display:inline-block; padding:13px 22px; border-radius:999px; background:${COLORS.lime}; color:${COLORS.night}; border:0; font-weight:800; font-size:15px; cursor:pointer;`;

function page(input: {
	heading: string;
	body: string;
	formHtml?: string;
	home: string;
}) {
	return layout({
		title: input.heading,
		kicker: "Your email",
		heading: input.heading,
		bodyHtml: `${paraHtml(input.body)}${input.formHtml ?? ""}${muted(`<a href="${escapeHtml(input.home)}" style="color:${COLORS.pinkText};">Back to the site</a>`)}`,
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

function button(action: string, label: string) {
	return `<form method="post" action="${escapeHtml(action)}" style="margin:20px 0 6px;"><button type="submit" style="${CTA}">${escapeHtml(label)}</button></form>`;
}

/**
 * The footer link from every list email lands here. It has to work from a
 * plain tap in a mail app with no JavaScript, which is why it is a real
 * form. The GET only *shows* it -- mail clients prefetch link targets, and
 * a GET that acted would unsubscribe people for opening their mail.
 *
 * Unsubscribing stops the email and nothing else: the account still works,
 * and invitations still show up on the site.
 */
export const unsubscribe = new Hono();

unsubscribe.get("/:token", async (c) => {
	const token = c.req.param("token");
	const home = new URL("/", c.req.url).toString();
	const person = await findPersonByUnsubscribeToken(createDb(), token);
	if (!person || person.status === "deactivated") {
		return html(
			page({
				heading: "That link doesn't go anywhere.",
				body: "It may have been for an address that is no longer on the site. Nothing changed.",
				home,
			}),
			404,
		);
	}
	const base = `/api/unsubscribe/${token}`;
	if (person.unsubscribedAt) {
		return html(
			page({
				heading: "You're already unsubscribed.",
				body: `${escapeHtml(person.email)} gets no email from ${SITE_LABEL}. Want invitations by email again?`,
				formHtml: button(`${base}/back`, "Email me again"),
				home,
			}),
		);
	}
	return html(
		page({
			heading: "No more email?",
			body: `${escapeHtml(person.email)} will stop getting invitations and reminders by email. Your account stays, and anything you're invited to still shows up on the site.`,
			formHtml: button(base, "Unsubscribe"),
			home,
		}),
	);
});

/**
 * The form posts here, and so do mail clients honouring
 * List-Unsubscribe-Post, which send no fields at all.
 */
unsubscribe.post("/:token", async (c) => {
	const token = c.req.param("token");
	const home = new URL("/", c.req.url).toString();
	const db = createDb();
	const person = await findPersonByUnsubscribeToken(db, token);
	if (!person || person.status === "deactivated") {
		return c.text("Unknown token.", 404);
	}
	await unsubscribePerson(db, { id: person.id }, "self");

	// One-click clients want a bare 200, not a page.
	if (!c.req.header("accept")?.includes("text/html")) {
		return c.text("Unsubscribed.", 200);
	}
	return html(
		page({
			heading: "Unsubscribed.",
			body: `${escapeHtml(person.email)} won't get email from ${SITE_LABEL}. Changed your mind? One tap undoes it.`,
			formHtml: button(`/api/unsubscribe/${token}/back`, "Email me again"),
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
	await resubscribe(db, person.id);
	// Brevo may have them blocklisted from a bounce or a mail-app unsubscribe;
	// without this they would read as subscribed and be quietly undeliverable.
	// A failure here must not turn the resubscribe that already happened
	// into a 500: the person is back on, and the blocklist can be cleared
	// from Brevo's side.
	try {
		await getMailer().unblock(person.email);
	} catch (error) {
		console.error("Brevo unblock failed after resubscribe", error);
	}
	return html(
		page({
			heading: "You're back on.",
			body: `${escapeHtml(person.email)} will get invitations by email again.`,
			home,
		}),
	);
});
