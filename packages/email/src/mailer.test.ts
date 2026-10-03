import { describe, expect, it, vi } from "vitest";

import { createMailer, type ListRecipient } from "./mailer";

const sender = { email: "info@rsvp.botch.com", name: "RSVP" };
const rendered = { subject: "S", html: "<p>{{ params.name }}</p>", text: "T" };

function recipients(n: number): ListRecipient[] {
	return Array.from({ length: n }, (_, i) => ({
		email: `p${i}@example.com`,
		name: i % 2 ? `Guest ${i}` : null,
		unsubscribeUrl: `https://rsvp.botch.com/api/unsubscribe/t${i}`,
		linkToken: `k${i}`,
	}));
}

describe("subjects", () => {
	it("reach Brevo as one clean line", async () => {
		const fetchImpl = vi.fn(
			async (_url: string | URL | Request, _init?: RequestInit) =>
				new Response(JSON.stringify({ messageId: "m" }), { status: 201 }),
		);
		const mailer = createMailer({ apiKey: "k", sender, fetch: fetchImpl });
		await mailer.sendOne(
			{ email: "a@example.com" },
			{ ...rendered, subject: "Hi\r\nBcc: x@example.com\u0000\u2028 there" },
		);
		const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
		expect(body.subject).toBe("Hi Bcc: x@example.com there");
	});
});

describe("createMailer", () => {
	it("dry-runs when there is no API key", async () => {
		const log = vi.fn();
		const fetchImpl = vi.fn();
		const mailer = createMailer({
			apiKey: undefined,
			sender,
			fetch: fetchImpl,
			log,
		});
		expect(mailer.dryRun).toBe(true);
		const one = await mailer.sendOne({ email: "a@example.com" }, rendered);
		expect(one).toEqual({ ok: true, messageId: "dry-run" });
		const list = await mailer.sendList(recipients(3), rendered);
		expect(list.sent).toBe(3);
		expect(list.failed).toEqual([]);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalled();
		expect(String(log.mock.calls[0]?.[0])).toContain("Subject: S");
	});

	it("fails instead of dry-running where dry runs aren't allowed", async () => {
		const log = vi.fn();
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const mailer = createMailer({
			apiKey: undefined,
			allowDryRun: false,
			sender,
			log,
		});
		expect(mailer.dryRun).toBe(false);
		const one = await mailer.sendOne({ email: "a@example.com" }, rendered);
		expect(one.ok).toBe(false);
		const list = await mailer.sendList(recipients(3), rendered);
		expect(list.sent).toBe(0);
		expect(list.failed).toHaveLength(1);
		expect(log).not.toHaveBeenCalled();
		error.mockRestore();
	});

	it("lets no stray brace open a template tag, however many there are", async () => {
		const fetchImpl = vi.fn(
			async (_url: string | URL | Request, _init?: RequestInit) =>
				new Response(JSON.stringify({ messageId: "m" }), { status: 201 }),
		);
		const mailer = createMailer({ apiKey: "k", sender, fetch: fetchImpl });
		await mailer.sendList(recipients(1), {
			subject: "Party {{ dance }} {{{ x }}",
			html: '<p>{% if x %}{{% y %}</p><a href="/?k={{ params.key }}">go</a>',
			text: "{# hi #} {{{# no #} {{ params.unsubscribeUrl }}",
		});
		const [, init] = fetchImpl.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		const sent = JSON.parse(init.body as string);
		const z = "\u200b";
		expect(sent.subject).toBe(`Party {${z}{ dance }} {${z}{${z}{ x }}`);
		expect(sent.htmlContent).toBe(
			`<p>{${z}% if x %}{${z}{${z}% y %}</p><a href="/?k={{ params.key }}">go</a>`,
		);
		expect(sent.textContent).toBe(
			`{${z}# hi #} {${z}{${z}{${z}# no #} {{ params.unsubscribeUrl }}`,
		);
	});

	it("fills the placeholders in a dry-run log so the link is clickable", async () => {
		const log = vi.fn();
		const mailer = createMailer({ apiKey: undefined, sender, log });
		const withLink = {
			subject: "S",
			html: "<p>x</p>",
			text: "Sign in: https://rsvp.botch.com/api/auth/link?k={{ params.key }}",
		};
		await mailer.sendList(recipients(2), withLink);
		expect(String(log.mock.calls[0]?.[0])).toContain(
			"https://rsvp.botch.com/api/auth/link?k=k0",
		);
		log.mockClear();
		await mailer.sendOne({ email: "a@example.com" }, withLink, {
			params: { key: "solo" },
		});
		expect(String(log.mock.calls[0]?.[0])).toContain("link?k=solo");
	});

	it("batches 100 recipients into calls of 99 and 1 with per-recipient params", async () => {
		const fetchImpl = vi.fn(
			async (_url: string | URL | Request, _init?: RequestInit) =>
				new Response(JSON.stringify({ messageId: "m" }), { status: 201 }),
		);
		const mailer = createMailer({ apiKey: "k", sender, fetch: fetchImpl });
		const result = await mailer.sendList(recipients(100), rendered, {
			tags: ["announcement"],
		});
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		const bodies = fetchImpl.mock.calls.map((c) =>
			JSON.parse((c as unknown as [string, RequestInit])[1].body as string),
		);
		expect(bodies[0].messageVersions).toHaveLength(99);
		expect(bodies[1].messageVersions).toHaveLength(1);
		expect(bodies[0].messageVersions[1]).toEqual({
			to: [{ email: "p1@example.com", name: "Guest 1" }],
			params: {
				unsubscribeUrl: "https://rsvp.botch.com/api/unsubscribe/t1",
				key: "k1",
			},
		});
		expect(bodies[0].headers).toBeUndefined();
		expect(bodies[0].tags).toEqual(["announcement"]);
		expect(result).toEqual({
			attempted: 100,
			sent: 100,
			failed: [],
			messageIds: ["m", "m"],
		});
	});

	it("reports a failed batch without losing the others", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ messageId: "ok" }), { status: 201 }),
			)
			.mockResolvedValueOnce(new Response("nope", { status: 400 }));
		const mailer = createMailer({ apiKey: "k", sender, fetch: fetchImpl });
		const result = await mailer.sendList(recipients(100), rendered);
		expect(result.sent).toBe(99);
		expect(result.failed).toEqual([
			{ emails: ["p99@example.com"], error: "400: nope" },
		]);
	});

	it("unblocks through Brevo and treats 404 as success", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(new Response("{}", { status: 404 }))
			.mockResolvedValueOnce(new Response("{}", { status: 500 }));
		const mailer = createMailer({
			apiKey: "k",
			sender,
			fetch: fetchImpl,
			log: vi.fn(),
		});
		expect(await mailer.unblock("a+b@example.com")).toBe(true);
		expect(await mailer.unblock("a+b@example.com")).toBe(true);
		expect(await mailer.unblock("a+b@example.com")).toBe(false);
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe(
			"https://api.brevo.com/v3/smtp/blockedContacts/a%2Bb%40example.com",
		);
		expect(init.method).toBe("DELETE");
	});

	it("sends nothing for an empty list", async () => {
		const fetchImpl = vi.fn();
		const mailer = createMailer({ apiKey: "k", sender, fetch: fetchImpl });
		const result = await mailer.sendList([], rendered);
		expect(result.attempted).toBe(0);
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});
