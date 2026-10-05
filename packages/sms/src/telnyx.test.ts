import { describe, expect, it, vi } from "vitest";

import { blockFor, describeCode, postMessage, textRequest } from "./telnyx";

const req = textRequest({
	from: "+13012798944",
	to: "+15551234567",
	text: "Hi",
});

function fake(...responses: Response[]) {
	const queue = [...responses];
	return vi.fn(
		async (_url: string | URL | Request, _init?: RequestInit) =>
			queue.shift() ?? new Response("", { status: 500 }),
	);
}

describe("textRequest", () => {
	it("is an MMS only with a picture", () => {
		expect(req.type).toBe("SMS");
		expect(req.media_urls).toBeUndefined();
		const mms = textRequest({
			from: "a",
			to: "b",
			text: "c",
			mediaUrl: "https://x/y.jpg",
		});
		expect(mms).toMatchObject({ type: "MMS", media_urls: ["https://x/y.jpg"] });
	});
});

describe("postMessage", () => {
	it("reads the id and parts and sends a bearer token", async () => {
		const f = fake(
			new Response(JSON.stringify({ data: { id: "m1", parts: 2 } }), {
				status: 200,
			}),
		);
		const out = await postMessage(req, { apiKey: "KEY", fetch: f });
		expect(out).toEqual({ ok: true, id: "m1", parts: 2 });
		const init = f.mock.calls[0]?.[1];
		expect((init?.headers as { authorization?: string })?.authorization).toBe(
			"Bearer KEY",
		);
	});

	it("defaults parts to 1", async () => {
		const f = fake(new Response(JSON.stringify({ data: { id: "m" } })));
		expect(await postMessage(req, { apiKey: "k", fetch: f })).toMatchObject({
			parts: 1,
		});
	});

	it("reports the first error's code and detail", async () => {
		const f = fake(
			new Response(
				JSON.stringify({
					errors: [{ code: "40300", title: "Blocked", detail: "Opted out" }],
				}),
				{ status: 400 },
			),
		);
		expect(await postMessage(req, { apiKey: "k", fetch: f })).toEqual({
			ok: false,
			status: 400,
			code: "40300",
			error: "Opted out",
		});
	});

	it("falls back to the title", async () => {
		const f = fake(
			new Response(JSON.stringify({ errors: [{ code: 1, title: "Bad" }] }), {
				status: 422,
			}),
		);
		expect(await postMessage(req, { apiKey: "k", fetch: f })).toMatchObject({
			code: "1",
			error: "Bad",
		});
	});

	it("retries once on 429 and 503", async () => {
		for (const status of [429, 503]) {
			const f = fake(
				new Response("", { status }),
				new Response(JSON.stringify({ data: { id: "ok" } })),
			);
			const out = await postMessage(req, { apiKey: "k", fetch: f });
			expect(out.ok).toBe(true);
			expect(f).toHaveBeenCalledTimes(2);
		}
	});

	it("gives up after one retry", async () => {
		const f = fake(
			new Response("", { status: 429 }),
			new Response("", { status: 429 }),
		);
		const out = await postMessage(req, { apiKey: "k", fetch: f });
		expect(out.ok).toBe(false);
		expect(f).toHaveBeenCalledTimes(2);
	});

	it("never retries other failures", async () => {
		for (const status of [400, 500, 502]) {
			const f = fake(new Response("", { status }));
			await postMessage(req, { apiKey: "k", fetch: f });
			expect(f).toHaveBeenCalledTimes(1);
		}
		const thrown = vi.fn(async () => {
			throw new Error("timeout");
		});
		const out = await postMessage(req, { apiKey: "k", fetch: thrown });
		expect(out).toMatchObject({ ok: false, status: 0, error: "timeout" });
		expect(thrown).toHaveBeenCalledTimes(1);
	});
});

describe("blockFor and describeCode", () => {
	it("maps codes", () => {
		expect(blockFor("40300")).toBe("stop");
		expect(blockFor("40001")).toBe("landline");
		expect(blockFor("40310")).toBe("invalid");
		expect(blockFor("40311")).toBe("invalid");
		expect(blockFor("40333")).toBeNull();
		expect(blockFor(null)).toBeNull();
		expect(describeCode("40300")).toBe("replied STOP");
		expect(describeCode("40010")).toBe("number not registered yet");
		expect(describeCode("40002")).toBe("carrier flagged as spam");
		expect(describeCode("x")).toBe("couldn't be delivered");
	});
});
