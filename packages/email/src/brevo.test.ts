import { describe, expect, it, vi } from "vitest";

import { BREVO_ENDPOINT, chunk, postBrevo, serializeRequest } from "./brevo";

const body = {
	sender: { email: "info@rsvp.botch.com", name: "RSVP" },
	to: [{ email: "a@example.com", name: null }],
	subject: "Hi",
	htmlContent: "<p>Hi</p>",
	textContent: "Hi",
};

function response(status: number, payload: unknown) {
	return new Response(JSON.stringify(payload), { status });
}

describe("postBrevo", () => {
	it("posts JSON with the api-key header and returns the messageId", async () => {
		const fetchImpl = vi.fn(async () =>
			response(201, { messageId: "<abc@smtp-relay>" }),
		);
		const outcome = await postBrevo(body, { apiKey: "k", fetch: fetchImpl });
		expect(outcome).toEqual({ ok: true, messageId: "<abc@smtp-relay>" });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe(BREVO_ENDPOINT);
		expect(init.method).toBe("POST");
		expect((init.headers as Record<string, string>)["api-key"]).toBe("k");
		const sent = JSON.parse(init.body as string);
		expect(sent.to).toEqual([{ email: "a@example.com" }]);
		expect(sent.subject).toBe("Hi");
	});

	it("maps 4xx to a failure without retrying", async () => {
		const fetchImpl = vi.fn(async () =>
			response(400, { code: "invalid_parameter", message: "bad sender" }),
		);
		const outcome = await postBrevo(body, { apiKey: "k", fetch: fetchImpl });
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.status).toBe(400);
			expect(outcome.error).toContain("bad sender");
		}
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("retries once on 5xx", async () => {
		vi.useFakeTimers();
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(response(503, {}))
			.mockResolvedValueOnce(response(201, { messageId: "second" }));
		const pending = postBrevo(body, { apiKey: "k", fetch: fetchImpl });
		await vi.runAllTimersAsync();
		const outcome = await pending;
		vi.useRealTimers();
		expect(outcome).toEqual({ ok: true, messageId: "second" });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("does not retry what Brevo may already have sent", async () => {
		for (const status of [500, 502, 504]) {
			const fetchImpl = vi.fn(async () => response(status, {}));
			const outcome = await postBrevo(body, { apiKey: "k", fetch: fetchImpl });
			expect(outcome.ok).toBe(false);
			expect(fetchImpl).toHaveBeenCalledTimes(1);
		}
		const dropped = vi.fn(async () => {
			throw new Error("connection reset");
		});
		const outcome = await postBrevo(body, { apiKey: "k", fetch: dropped });
		expect(outcome).toMatchObject({ ok: false, status: 0 });
		expect(dropped).toHaveBeenCalledTimes(1);
	});
});

describe("serializeRequest", () => {
	it("drops null names", () => {
		const out = serializeRequest({
			...body,
			messageVersions: [{ to: [{ email: "b@example.com", name: null }] }],
		});
		expect(out.messageVersions).toEqual([{ to: [{ email: "b@example.com" }] }]);
	});
});

describe("chunk", () => {
	it("splits into batches", () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(chunk([], 2)).toEqual([]);
	});
});
