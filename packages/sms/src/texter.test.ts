import { describe, expect, it, vi } from "vitest";

import { createTexter } from "./texter";

describe("createTexter", () => {
	it("dry-runs without a key when allowed", async () => {
		const log = vi.fn();
		const fetchImpl = vi.fn();
		const t = createTexter({
			from: "+1",
			allowDryRun: true,
			fetch: fetchImpl,
			log,
		});
		expect(t.dryRun).toBe(true);
		const out = await t.send({
			to: "+1555",
			text: "hello https://x",
			mediaUrl: "https://m/p.jpg",
		});
		expect(out).toMatchObject({ ok: true, parts: 1 });
		expect(out.ok && out.id.startsWith("dry-run-")).toBe(true);
		expect(log.mock.calls[0]?.[0]).toContain("hello https://x");
		expect(log.mock.calls[0]?.[0]).toContain("https://m/p.jpg");
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("fails without a key when not allowed", async () => {
		const t = createTexter({ from: "+1", allowDryRun: false });
		expect(t.dryRun).toBe(false);
		expect(await t.send({ to: "+1555", text: "x" })).toEqual({
			ok: false,
			status: 0,
			code: null,
			error: "Texting is not configured.",
		});
	});

	it("posts with a key", async () => {
		const fetchImpl = vi.fn(
			async (_u: string | URL | Request, _i?: RequestInit) =>
				new Response(JSON.stringify({ data: { id: "m" } })),
		);
		const t = createTexter({
			apiKey: "k",
			from: "+13",
			allowDryRun: true,
			fetch: fetchImpl,
		});
		expect(t.dryRun).toBe(false);
		await t.send({ to: "+14", text: "hi" });
		expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
			from: "+13",
			to: "+14",
			text: "hi",
			type: "SMS",
		});
	});

	it("sendMany keeps order and respects concurrency", async () => {
		let active = 0;
		let peak = 0;
		const fetchImpl = vi.fn(
			async (_u: string | URL | Request, init?: RequestInit) => {
				active++;
				peak = Math.max(peak, active);
				await new Promise((r) => setTimeout(r, 5));
				active--;
				const { text } = JSON.parse(String(init?.body));
				return new Response(JSON.stringify({ data: { id: text } }));
			},
		);
		const t = createTexter({
			apiKey: "k",
			from: "+1",
			allowDryRun: false,
			fetch: fetchImpl,
		});
		const ms = Array.from({ length: 20 }, (_, i) => ({
			to: "+1555",
			text: `t${i}`,
		}));
		const heard: number[] = [];
		const out = await t.sendMany(ms, {
			concurrency: 3,
			onOutcome: (i) => {
				heard.push(i);
			},
		});
		expect(out.map((o) => (o.ok ? o.id : "x"))).toEqual(ms.map((m) => m.text));
		expect(peak).toBeLessThanOrEqual(3);
		expect(peak).toBeGreaterThan(1);
		expect([...heard].sort((a, b) => a - b)).toEqual(ms.map((_, i) => i));
		expect(await t.sendMany([])).toEqual([]);
	});

	it("sendMany carries on past an onOutcome that throws", async () => {
		const lines: string[] = [];
		const t = createTexter({
			from: "+1",
			allowDryRun: true,
			log: (line) => lines.push(line),
		});
		const out = await t.sendMany(
			[
				{ to: "+1555", text: "a" },
				{ to: "+1555", text: "b" },
			],
			{
				concurrency: 1,
				onOutcome: () => {
					throw new Error("params: +13015550100");
				},
			},
		);
		expect(out.every((o) => o.ok)).toBe(true);
		expect(lines.filter((l) => l.includes("onOutcome failed"))).toHaveLength(2);
		expect(lines.join("\n")).not.toContain("+13015550100");
	});
});
