import { describe, expect, it } from "vitest";

import {
	cleanSubject,
	email,
	escapeHtml,
	PARAM,
	redactEmail,
	scrubEmails,
} from "./render";
import {
	cancelEmail,
	dayBeforeEmail,
	deadlineReminderEmail,
	type EventFacts,
	type HostTotals,
	hostAlertEmail,
	hostDigestEmail,
	inviteEmail,
	joinLinkEmail,
	messageEmail,
	nudgeEmail,
	resetPasswordEmail,
	updateEmail,
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
	answers: {
		words: {
			yes: { pick: "Yes", count: "in" },
			maybe: { pick: "Maybe", count: "maybe" },
			no: { pick: "Can't", count: "out" },
			none: { pick: "No reply", count: "waiting" },
		},
		maybe: true,
	},
};

const totals: HostTotals = {
	yes: 3,
	maybe: 1,
	no: 1,
	waiting: 4,
	expecting: 8,
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

	it("put relatives answered for in the same alert, never as 0 adults", () => {
		const r = hostAlertEmail(
			facts,
			{
				name: "Linh",
				response: "yes",
				adults: 1,
				kids: 0,
				note: "",
				for: [
					{ name: "Sam", response: "yes", adults: 1, kids: 0 },
					{ name: "Ada", response: "yes", adults: 0, kids: 1 },
				],
			},
			totals,
		);
		expect(r.subject).toBe("Linh: Yes · House Crawl <& tacos>");
		expect(r.text).toContain("Linh answered, and for Sam and Ada.");
		expect(r.text).toContain("Ada: Yes · 1 kid");
		expect(r.text).not.toContain("0 adults");

		const only = hostAlertEmail(
			facts,
			{
				name: "Linh",
				response: "yes",
				adults: 1,
				kids: 0,
				note: "",
				self: false,
				for: [{ name: "Sam", response: "no", adults: 1, kids: 0 }],
			},
			totals,
		);
		expect(only.subject).toBe("Linh answered for Sam · House Crawl <& tacos>");
		expect(only.text).not.toContain("Linh: Yes");
	});

	it("say in the digest who answered for whom", () => {
		const r = hostDigestEmail(
			facts,
			[
				{
					name: "Ada",
					response: "yes",
					adults: 0,
					kids: 1,
					note: "",
					answeredBy: "Linh",
				},
			],
			totals,
		);
		expect(r.text).toContain("Ada: Yes · 1 kid (answered by Linh)");
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
	const url = `${site}/api/auth/reset-password/x?callbackURL=%2Freset-password`;
	const reset = resetPasswordEmail({ name: "Kyle <script>", url });

	it("have no unsubscribe footer", () => {
		expect(reset.html).not.toContain("{{ params");
		expect(reset.text).not.toContain("{{ params");
	});

	it("include the link in both parts and escape names", () => {
		expect(reset.html).toContain(
			'href="https://rsvp.botch.com/api/auth/reset-password/x?callbackURL=%2Freset-password"',
		);
		expect(reset.text).toContain(url);
		expect(reset.html).toContain("Kyle &lt;script&gt;");
	});
});

describe("an event with its own design", () => {
	const look = {
		cardUrl: `${site}/api/designs/e1/card-1.jpg`,
		cardAlt: 'Ava\'s "big" night · Sat, Oct 24',
		band: "#1d2b6b",
		ground: "#eef0f8",
		text: "#1f1930",
		accent: "#ffd84d",
		onAccent: "#14101f",
		accent2: "#2b6bff",
		onAccent2: "#ffffff",
		link: "#1d4fd8",
		headingStack: '"Playfair Display", Georgia, serif',
	};
	const designed = inviteEmail({ ...facts, look }, null);

	it("opens on the card instead of the band and the cover", () => {
		expect(designed.html).toContain(`<img src="${look.cardUrl}"`);
		expect(designed.html).not.toContain("covers/abc.jpg");
		expect(designed.html).not.toContain("botch<span");
	});

	it("describes the card for mail that blocks images", () => {
		expect(designed.html).toContain(`alt="${escapeHtml(look.cardAlt)}"`);
	});

	it("colours the buttons and links with the design", () => {
		expect(designed.html).toContain("background:#ffd84d; color:#14101f");
		expect(designed.html).toContain("color:#1d4fd8");
		expect(designed.html).not.toContain("#C6FF3D");
		expect(designed.html).not.toContain("#B0236C");
	});

	it("keeps the per-recipient placeholders intact", () => {
		expect(designed.html).toContain(PARAM.key);
		expect(designed.html).toContain(PARAM.unsubscribeUrl);
	});

	it("leaves an undesigned event exactly as it was", () => {
		expect(inviteEmail({ ...facts, look: null }, null).html).toBe(
			inviteEmail(facts, null).html,
		);
	});
});

describe("email blocks", () => {
	const r = email({
		subject: "S",
		heading: "Heading <1>",
		list: true,
		blocks: [
			{ kind: "text", text: "Hi <there>" },
			{ kind: "typed", text: "One.\n\nTwo & three." },
			{ kind: "facts", facts: [{ label: "When", value: "Sat" }] },
			{ kind: "facts", facts: [] },
			{
				kind: "buttons",
				items: [{ label: "Go", href: "https://x/a?b=1&c=2" }],
			},
			{ kind: "pasteLink", url: "https://x/a" },
			{ kind: "muted", text: "Quiet." },
			{ kind: "custom", html: "<hr>", text: "---" },
		],
	});

	it("puts every block in both parts, escaped only in the HTML", () => {
		expect(r.html).toContain("Hi &lt;there&gt;");
		expect(r.html).toContain("Two &amp; three.");
		expect(r.html).toContain('href="https://x/a?b=1&amp;c=2"');
		expect(r.html).toContain("Or paste this into a browser");
		expect(r.html).toContain("<hr>");
		expect(r.text).toBe(
			[
				"Heading <1>",
				"Hi <there>",
				"One.\n\nTwo & three.",
				"When: Sat",
				"Go: https://x/a?b=1&c=2",
				"Quiet.",
				"---",
				r.text.slice(r.text.indexOf("You got this")),
			].join("\n\n"),
		);
	});

	it("draws nothing for an empty table, and the footer only on list mail", () => {
		expect(r.html.match(/<table/g)).toHaveLength(1);
		expect(r.text).toContain(PARAM.unsubscribeUrl);
		const one = email({ subject: "S", heading: "H", blocks: [] });
		expect(one.text).toBe("H");
		expect(one.html).not.toContain(PARAM.unsubscribeUrl);
	});
});

describe("subjects and logs", () => {
	it("a subject is one line without control characters", () => {
		expect(cleanSubject("a\r\nb\tc\u0007d")).toBe("a b c d");
		expect(email({ subject: "x\ny", heading: "H", blocks: [] }).subject).toBe(
			"x y",
		);
	});

	it("addresses are redacted for logs", () => {
		expect(redactEmail("jane@example.com")).toBe("j***@example.com");
		expect(scrubEmails("bad address <jane@example.com>, x@y.org")).toBe(
			"bad address <j***@example.com>, x***@y.org",
		);
	});
});

describe("an event's own answer words", () => {
	const own: EventFacts = {
		...facts,
		answers: {
			words: {
				yes: { pick: "Count me in", count: "coming" },
				maybe: { pick: "Probably", count: "probably" },
				no: { pick: "Sadly no", count: "missing" },
				none: { pick: "Silent", count: "quiet" },
			},
			maybe: true,
		},
	};
	const yesNo: EventFacts = {
		...own,
		answers: { ...own.answers, maybe: false },
	};

	it("label the one-tap buttons, with no cheer added", () => {
		const r = inviteEmail(own);
		expect(r.html).toContain("Count me in");
		expect(r.html).not.toContain("Count me in!");
		expect(r.html).toContain("Probably");
		expect(r.html).toContain("Sadly no");
		expect(inviteEmail(facts).html).toContain("Yes!");
	});

	it("leave maybe off when the event doesn't offer it", () => {
		for (const r of [
			inviteEmail(yesNo),
			deadlineReminderEmail(yesNo),
			nudgeEmail(yesNo),
		]) {
			expect(r.text).not.toContain("%3Fa%3Dmaybe");
			expect(r.text).toContain("%3Fa%3Dyes");
			expect(r.text).toContain("%3Fa%3Dno");
		}
	});

	it("name the answer and the tallies in a host's alert", () => {
		const r = hostAlertEmail(
			own,
			{ name: "Linh", response: "no", adults: 1, kids: 0, note: "" },
			totals,
		);
		expect(r.subject).toBe("Linh: Sadly no · House Crawl <& tacos>");
		expect(r.text).toContain(
			"3 coming · 1 probably · 1 missing · 4 quiet · expecting 8",
		);
	});

	it("drop maybe from the tallies once it is off and nobody said it", () => {
		const none = { ...totals, maybe: 0 };
		const r = hostDigestEmail(yesNo, [], none);
		expect(r.text).toContain("3 coming · 1 missing · 4 quiet · expecting 8");
		expect(hostDigestEmail(yesNo, [], totals).text).toContain("1 probably");
	});
});

describe("words people type", () => {
	const facts = {
		eventId: "e1",
		title: "Party {{ params.key }}",
		hostLine: "",
		dateLabel: null,
		timeLabel: null,
		location: "",
		details: "Directions: https://evil.example/?t={{ params.key }}",
		deadlineLabel: null,
		coverKey: null,
		siteUrl: "https://rsvp.botch.com",
		answers: {
			words: {
				yes: { pick: "In {{ params.key }}", count: "{{ params.key }}" },
				maybe: { pick: "Maybe", count: "maybe" },
				no: { pick: "{% if x %}", count: "out" },
				none: { pick: "No reply", count: "waiting" },
			},
			maybe: true,
		},
	};
	const stray = (s: string) =>
		s.replaceAll(PARAM.key, "").replaceAll(PARAM.unsubscribeUrl, "");

	it("can't smuggle a sign-in token placeholder into an invitation", () => {
		const r = inviteEmail(facts, "Eve {{ params.key }}");
		// The template's own links keep theirs; nothing else may hold one.
		for (const part of [r.subject, r.html, r.text]) {
			expect(stray(part)).not.toMatch(/\{\{/);
		}
		expect(r.text).toContain("https://evil.example/?t={");
	});

	it("can't smuggle one in through the answer words", () => {
		const r = inviteEmail(facts, null);
		for (const part of [r.subject, r.html, r.text]) {
			expect(stray(part)).not.toMatch(/\{\{|\{%/);
		}
	});

	it("can't smuggle one into a host's alert through a note or a name", () => {
		const r = hostAlertEmail(
			facts,
			{
				name: "Eve {{ params.key }}",
				response: "yes",
				adults: 1,
				kids: 0,
				note: "see https://evil.example/?t={{ params.key }}",
				for: [
					{ name: "Kid {{ params.key }}", response: "yes", adults: 0, kids: 1 },
				],
			},
			{ yes: 1, maybe: 0, no: 0, waiting: 0, expecting: 1 },
		);
		for (const part of [r.subject, r.html, r.text]) {
			expect(stray(part)).not.toMatch(/\{\{|\{%|\{#/);
		}
	});
});
