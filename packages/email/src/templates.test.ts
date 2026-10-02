import { describe, expect, it } from "vitest";

import { escapeHtml, PARAM } from "./render";
import {
	cancelEmail,
	dayBeforeEmail,
	deadlineReminderEmail,
	type EventFacts,
	hostAlertEmail,
	hostDigestEmail,
	inviteEmail,
	joinLinkEmail,
	messageEmail,
	nudgeEmail,
	resetPasswordEmail,
	type Totals,
	updateEmail,
	verifyEmail,
	welcomeEmail,
} from "./templates";

const site = "https://rsvp.botch.com";

const facts: EventFacts = {
	eventId: "ev-1",
	title: "House Crawl <& tacos>",
	hostLine: "The swim team parents",
	dateLabel: "Sat, Oct 24",
	timeLabel: "5:00 PM - 10:00 PM",
	location: "112 Lakeview Ave",
	details: "Four houses.\n\nBring a jacket & a dish.",
	deadlineLabel: "Sat, Oct 17",
	coverKey: "covers/abc.jpg",
	siteUrl: site,
};

const totals: Totals = {
	yes: 3,
	maybe: 1,
	no: 1,
	waiting: 4,
	adults: 6,
	kids: 2,
};

describe("the event emails", () => {
	const all = {
		invite: inviteEmail(facts),
		deadline: deadlineReminderEmail(facts),
		nudge: nudgeEmail(facts),
		dayBefore: dayBeforeEmail(facts),
		update: updateEmail(facts, [
			{ label: "When", was: "Fri, Oct 23", now: "Sat, Oct 24" },
		]),
		cancel: cancelEmail(facts, "Rain <again>."),
		alert: hostAlertEmail(
			facts,
			{ name: "Linh", response: "yes", adults: 2, kids: 2, note: "So in" },
			totals,
		),
		digest: hostDigestEmail(
			facts,
			[{ name: "Marcus", response: "maybe", adults: 1, kids: 0, note: "" }],
			totals,
		),
	};

	it("escape what hosts and guests typed", () => {
		for (const r of Object.values(all)) {
			expect(r.html).not.toContain("<& tacos>");
		}
		expect(all.invite.html).toContain("House Crawl &lt;&amp; tacos&gt;");
		expect(all.cancel.html).toContain("Rain &lt;again&gt;.");
	});

	it("all carry the unsubscribe placeholder in both parts", () => {
		for (const r of Object.values(all)) {
			expect(r.html).toContain(PARAM.unsubscribeUrl);
			expect(r.text).toContain(PARAM.unsubscribeUrl);
		}
	});

	it("sign the reader in on every link back to the site", () => {
		for (const r of [all.invite, all.deadline, all.nudge, all.update]) {
			expect(r.text).toContain(
				`${site}/api/auth/link?k=${PARAM.key}&to=%2Fe%2Fev-1%3Fa%3Dyes`,
			);
			expect(r.text).toContain("%3Fa%3Dmaybe");
			expect(r.text).toContain("%3Fa%3Dno");
		}
		expect(all.dayBefore.text).toContain(
			`${site}/api/auth/link?k=${PARAM.key}&to=%2Fe%2Fev-1`,
		);
		expect(all.alert.text).toContain("%2Fe%2Fev-1%2Fguests");
	});

	it("show the cover from a token-free URL", () => {
		const img = all.invite.html.match(/<img src="([^"]+)"/)?.[1];
		expect(img).toBe(`${site}/api/covers/abc.jpg`);
		expect(img).not.toContain("params");
	});

	it("leave the cover out when there is none", () => {
		expect(inviteEmail({ ...facts, coverKey: null }).html).not.toContain(
			"<img",
		);
	});

	it("name the deadline where it matters", () => {
		expect(all.invite.text).toContain("RSVP by: Sat, Oct 17");
		expect(all.deadline.subject).toBe(
			"RSVP by Sat, Oct 17: House Crawl <& tacos>",
		);
		expect(all.dayBefore.text).not.toContain("RSVP by");
	});

	it("say what changed, old and new", () => {
		expect(all.update.text).toContain("When: Sat, Oct 24 (was Fri, Oct 23)");
	});

	it("give the hosts the party size and the running total", () => {
		expect(all.alert.subject).toBe("Linh: Yes · House Crawl <& tacos>");
		expect(all.alert.text).toContain("Linh: Yes · 2 adults, 2 kids");
		expect(all.alert.text).toContain('"So in"');
		expect(all.digest.subject).toBe("1 new reply · House Crawl <& tacos>");
		expect(all.digest.text).toContain("expecting 8");
	});
});

describe("an invitation from a guest", () => {
	const r = inviteEmail(facts, "Priya <S>");

	it("says whose friend they are, escaped", () => {
		expect(r.subject).toBe("Priya <S> invited you: House Crawl <& tacos>");
		expect(r.html).toContain("Priya &lt;S&gt; is going and invited you along");
		expect(r.text).toContain("Hosted by The swim team parents.");
	});
});

describe("join link", () => {
	const url = `${site}/api/auth/link?k=abc123&to=%2Fi%2Ftok`;
	const join = joinLinkEmail({ title: "Party", url, coverUrl: null });

	it("carries a concrete link and no list placeholders", () => {
		expect(join.text).toContain(url);
		expect(join.html).toContain(escapeHtml(url));
		expect(join.html).not.toContain("{{ params");
	});
});

describe("message", () => {
	const message = messageEmail({
		subject: "Venue closed <tonight>",
		body: "Power is out.\n\nSee you next time & bring a jacket.",
		siteUrl: site,
	});
	it("escapes and keeps its footer", () => {
		expect(message.html).toContain("Venue closed &lt;tonight&gt;");
		expect(message.html).toContain(PARAM.unsubscribeUrl);
	});
});

describe("welcome", () => {
	const url = `${site}/api/auth/link?k=abc123&to=%2Fevents`;
	const welcome = welcomeEmail({ name: "Pete", url });

	it("carries a concrete link, not a placeholder", () => {
		expect(welcome.text).toContain(url);
		expect(welcome.html).toContain(escapeHtml(url));
		expect(welcome.html).not.toContain("{{ params");
		expect(welcome.text).not.toContain("{{ params");
	});

	it("says the link is a key and mentions the password option", () => {
		expect(welcome.subject).toBe("Your Botch RSVP link");
		expect(welcome.text).toContain("don't forward it");
		expect(welcome.text).toContain("password");
	});
});

describe("auth templates", () => {
	const url = `${site}/api/auth/verify-email?token=x&callbackURL=%2Faccount`;
	const verify = verifyEmail({ name: "Kyle <script>", url });
	const reset = resetPasswordEmail({ name: "Pete", url });

	it("have no unsubscribe footer", () => {
		for (const r of [verify, reset]) {
			expect(r.html).not.toContain("{{ params");
			expect(r.text).not.toContain("{{ params");
		}
	});

	it("include the link in both parts and escape names", () => {
		expect(verify.html).toContain(
			'href="https://rsvp.botch.com/api/auth/verify-email?token=x&amp;callbackURL=%2Faccount"',
		);
		expect(verify.text).toContain(url);
		expect(verify.html).toContain("Kyle &lt;script&gt;");
		expect(reset.text).toContain(url);
	});
});
