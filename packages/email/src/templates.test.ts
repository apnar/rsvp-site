import { describe, expect, it } from "vitest";

import { escapeHtml, PARAM } from "./render";
import {
	CONTRIBUTION_REMINDER_BODY,
	contributionCallDefaults,
	contributionCallEmail,
	contributionReminderEmail,
	messageEmail,
	type RsvpFacts,
	resetPasswordEmail,
	rsvpCallEmail,
	rsvpConfirmedEmail,
	rsvpFinalEmail,
	rsvpLastCallEmail,
	rsvpNudgeEmail,
	verifyEmail,
	welcomeEmail,
} from "./templates";

const site = "https://rsvp.botch.com";

const facts: RsvpFacts = {
	gameId: "g-1",
	dateLabel: "Sat, Sep 12",
	timeLabel: "7:00 PM - 10:00 PM",
	location: "The <Garden> Room",
	notes: "Park by the side door & bring a dish",
	siteUrl: site,
	inNames: ["Sam", "Big Ray"],
	maybeNames: ["Pete"],
	inCount: 7,
	confirmAt: 10,
	playAt: 8,
	capacity: 15,
};

describe("the cycle emails", () => {
	const call = rsvpCallEmail({ ...facts, today: false, alreadyOn: false });
	const nudge = rsvpNudgeEmail({ ...facts, needed: 3 });
	const confirmed = rsvpConfirmedEmail({
		...facts,
		inCount: 10,
		permitUrl: `${site}/api/permits/abc/file`,
	});
	const lastCall = rsvpLastCallEmail({
		...facts,
		needed: 2,
		wasConfirmed: false,
	});
	const on = rsvpFinalEmail({
		...facts,
		inCount: 9,
		decision: "on",
		permitUrl: null,
	});
	const off = rsvpFinalEmail({
		...facts,
		inCount: 6,
		decision: "off",
		permitUrl: null,
	});
	const all = [call, nudge, confirmed, lastCall, on, off];

	it("escape whatever an admin typed", () => {
		expect(call.html).toContain("The &lt;Garden&gt; Room");
		expect(call.html).toContain("side door &amp; bring");
		expect(call.html).not.toContain("<Garden>");
	});

	it("carry the unsubscribe placeholder in both parts", () => {
		for (const r of all) {
			expect(r.html).toContain(PARAM.unsubscribeUrl);
			expect(r.text).toContain(PARAM.unsubscribeUrl);
			expect(r.text.trim().length).toBeGreaterThan(0);
		}
	});

	it("send everyone back through their own sign-in link", () => {
		for (const r of all) {
			expect(r.html).toContain(PARAM.key);
			expect(r.text).toContain(PARAM.key);
		}
	});

	it("offer three answers before the last call and two after", () => {
		for (const answer of ["in", "maybe", "out"]) {
			expect(call.text).toContain(`%2Frsvp%2Fg-1%3Fa%3D${answer}`);
			expect(nudge.text).toContain(`%2Frsvp%2Fg-1%3Fa%3D${answer}`);
		}
		// The last call exists to turn a maybe into a number. Handing back the
		// button that made the problem is how you get to 7:30 with five maybes.
		expect(lastCall.text).not.toContain("%3Fa%3Dmaybe");
		expect(confirmed.text).not.toContain("%3Fa%3Dmaybe");
		// The verdict asks nothing. The question is closed.
		for (const r of [on, off]) {
			expect(r.text).not.toContain("%3Fa%3D");
		}
	});

	it("keep the permit link token-free: venue staff see it", () => {
		expect(confirmed.text).toContain(`${site}/api/permits/abc/file`);
		expect(confirmed.text).not.toContain("/api/permits/abc/file?k=");
	});

	it("say where the count stands", () => {
		expect(call.subject).toBe(
			"Tomorrow, 7:00 PM - 10:00 PM. In, out, or maybe.",
		);
		expect(nudge.subject).toBe("7 in, 3 short. You have not said anything.");
		expect(confirmed.subject).toBe("It's on. Sat, Sep 12, 7:00 PM - 10:00 PM.");
		expect(lastCall.subject).toBe("Last call: 7 in, 2 short by 7:30.");
		expect(on.subject).toBe("It's on. 9 in.");
		expect(off.subject).toBe("Called off tonight. 6 in.");
		expect(call.text).toContain("Sam, Big Ray");
	});

	it("says tonight when the venue was booked the same day", () => {
		const today = rsvpCallEmail({ ...facts, today: true, alreadyOn: false });
		expect(today.subject).toContain("Tonight");
		expect(today.text).toContain("There is an event tonight.");
	});

	it("doubles as the confirmation when ten answered before we asked", () => {
		const already = rsvpCallEmail({
			...facts,
			inCount: 11,
			today: false,
			alreadyOn: true,
		});
		expect(already.text).toContain("The event is on.");
	});

	it("tells a sponsor to pass a cancellation on", () => {
		expect(off.text).toContain("Go tell them before they drive over.");
		// The maybes are named on a cancellation: they were waiting on this.
		expect(off.text).toContain("Pete");
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
	const url = `${site}/api/auth/link?k=abc123&to=%2F%23rsvp`;
	const welcome = welcomeEmail({ name: "Pete", url });

	it("carries a concrete link, not a placeholder", () => {
		expect(welcome.text).toContain(url);
		expect(welcome.html).toContain(escapeHtml(url));
		expect(welcome.html).not.toContain("{{ params");
		expect(welcome.text).not.toContain("{{ params");
	});

	it("says the link is a key and mentions the password option", () => {
		expect(welcome.subject).toBe("You're on the list.");
		expect(welcome.text).toContain("don't forward it");
		expect(welcome.text).toContain("password");
	});
});

describe("auth templates", () => {
	const url = `${site}/api/auth/verify-email?token=x&callbackURL=%2Fdashboard`;
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
			'href="https://rsvp.botch.com/api/auth/verify-email?token=x&amp;callbackURL=%2Fdashboard"',
		);
		expect(verify.text).toContain(url);
		expect(verify.html).toContain("Kyle &lt;script&gt;");
		expect(reset.text).toContain(url);
	});
});

describe("contributions", () => {
	const call = contributionCallEmail({
		subject: "Costs & the rest",
		body: "Sam paid the caterer.\n\nPay Sam back <soon>.",
		amount: 40,
		instructions: "Venmo @sam, or cash & carry",
		siteUrl: site,
	});
	const reminder = contributionReminderEmail({
		body: CONTRIBUTION_REMINDER_BODY,
		amount: 1200,
		instructions: "Zelle",
		siteUrl: site,
	});

	it("escapes what the admin typed and keeps the footer", () => {
		expect(call.html).toContain("Pay Sam back &lt;soon&gt;.");
		expect(call.html).toContain("cash &amp; carry");
		expect(call.html).not.toContain("<soon>");
		for (const r of [call, reminder]) {
			expect(r.html).toContain(PARAM.unsubscribeUrl);
			expect(r.text).toContain(PARAM.unsubscribeUrl);
		}
	});

	it("puts the amount and the instructions in the facts", () => {
		expect(call.html).toContain("Amount");
		expect(call.html).toContain("$40");
		expect(call.text).toContain("Amount: $40");
		expect(call.text).toContain("How to pay: Venmo @sam, or cash & carry");
		expect(reminder.text).toContain("Amount: $1,200");
	});

	it("sends everyone to the dashboard through their own link", () => {
		for (const r of [call, reminder]) {
			expect(r.html).toContain("%2Fdashboard");
			expect(r.html).toContain(PARAM.key);
			expect(r.text).toContain("%2Fdashboard");
			expect(r.text).toContain(PARAM.key);
			expect(r.html).not.toContain("/rsvp/");
		}
	});

	it("the reminder names the amount in the subject", () => {
		expect(reminder.subject).toBe("Still owed: $1,200 toward the costs.");
		expect(call.subject).toBe("Costs & the rest");
	});

	it("the stock copy has no exclamation marks", () => {
		const defaults = contributionCallDefaults(40);
		for (const s of [
			defaults.subject,
			defaults.body,
			CONTRIBUTION_REMINDER_BODY,
		]) {
			expect(s).not.toContain("!");
		}
	});
});
