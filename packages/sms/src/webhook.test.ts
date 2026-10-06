import { describe, expect, it } from "vitest";

import {
	inboundAction,
	keywordOf,
	parseTelnyxEvent,
	verifyTelnyxSignature,
} from "./webhook";

const b64 = (b: ArrayBuffer | Uint8Array) =>
	btoa(String.fromCharCode(...new Uint8Array(b)));

async function signer() {
	const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
		"sign",
		"verify",
	])) as CryptoKeyPair;
	const publicKey = b64(
		(await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer,
	);
	const sign = async (ts: string, body: string) =>
		b64(
			await crypto.subtle.sign(
				{ name: "Ed25519" },
				pair.privateKey,
				new TextEncoder().encode(`${ts}|${body}`),
			),
		);
	return { publicKey, sign };
}

describe("verifyTelnyxSignature", () => {
	const now = new Date("2026-10-04T12:00:00Z");
	const ts = String(Math.floor(now.getTime() / 1000));
	const body = '{"data":{"id":"e"}}';

	it("accepts a good signature", async () => {
		const { publicKey, sign } = await signer();
		const signature = await sign(ts, body);
		expect(
			await verifyTelnyxSignature({
				publicKey,
				signature,
				timestamp: ts,
				rawBody: body,
				now,
			}),
		).toBe(true);
	});

	it("rejects tampering, staleness and garbage", async () => {
		const { publicKey, sign } = await signer();
		const signature = await sign(ts, body);
		const base = { publicKey, signature, timestamp: ts, rawBody: body, now };
		expect(await verifyTelnyxSignature({ ...base, rawBody: `${body} ` })).toBe(
			false,
		);
		const old = String(Number(ts) - 301);
		expect(
			await verifyTelnyxSignature({
				...base,
				timestamp: old,
				signature: await sign(old, body),
			}),
		).toBe(false);
		const future = String(Number(ts) + 301);
		expect(
			await verifyTelnyxSignature({
				...base,
				timestamp: future,
				signature: await sign(future, body),
			}),
		).toBe(false);
		expect(await verifyTelnyxSignature({ ...base, signature: "!!!" })).toBe(
			false,
		);
		expect(await verifyTelnyxSignature({ ...base, signature: null })).toBe(
			false,
		);
		expect(await verifyTelnyxSignature({ ...base, timestamp: "abc" })).toBe(
			false,
		);
		expect(await verifyTelnyxSignature({ ...base, publicKey: "AAAA" })).toBe(
			false,
		);
		const other = await signer();
		expect(
			await verifyTelnyxSignature({ ...base, publicKey: other.publicKey }),
		).toBe(false);
	});
});

const envelope = (event_type: string, payload: unknown) => ({
	data: { event_type, id: "evt-1", payload },
});

describe("parseTelnyxEvent", () => {
	it("reads an inbound text", () => {
		expect(
			parseTelnyxEvent(
				envelope("message.received", {
					id: "m1",
					from: { phone_number: "+15551234567" },
					to: [{ phone_number: "+13012798944", status: "webhook_delivered" }],
					text: "STOP",
				}),
			),
		).toEqual({
			type: "received",
			eventId: "evt-1",
			messageId: "m1",
			from: "+15551234567",
			to: "+13012798944",
			text: "STOP",
		});
	});

	it("reads sent, delivered and failed", () => {
		const to = (status: string) => [{ phone_number: "+1555", status }];
		expect(
			parseTelnyxEvent(envelope("message.sent", { id: "m", to: to("sent") })),
		).toMatchObject({
			type: "status",
			status: "sent",
			errorCode: null,
		});
		expect(
			parseTelnyxEvent(
				envelope("message.finalized", { id: "m", to: to("delivered") }),
			),
		).toMatchObject({ status: "delivered" });
		expect(
			parseTelnyxEvent(
				envelope("message.finalized", {
					id: "m",
					to: to("delivery_unconfirmed"),
				}),
			),
		).toMatchObject({ status: "sent" });
		expect(
			parseTelnyxEvent(
				envelope("message.finalized", {
					id: "m",
					to: to("delivery_failed"),
					errors: [{ code: "40300", title: "Blocked", detail: "Opted out" }],
				}),
			),
		).toMatchObject({
			status: "failed",
			errorCode: "40300",
			error: "Opted out",
		});
	});

	it("never throws", () => {
		for (const junk of [
			null,
			undefined,
			5,
			"x",
			[],
			{},
			{ data: 1 },
			envelope("message.received", {}),
		]) {
			expect(parseTelnyxEvent(junk).type).toBe("other");
		}
		expect(parseTelnyxEvent(envelope("message.other", { id: "m" }))).toEqual({
			type: "other",
			eventId: "evt-1",
		});
	});
});

describe("keywordOf", () => {
	it("matches whole messages", () => {
		for (const w of [
			"STOP",
			" stop ",
			"Stop.",
			"stop all",
			"UNSUBSCRIBE",
			"quit!",
			"opt out",
			"end",
			"cancel",
		]) {
			expect(keywordOf(w)).toBe("stop");
		}
		expect(keywordOf("Start")).toBe("start");
		expect(keywordOf("unstop")).toBe("start");
		expect(keywordOf("help")).toBe("help");
		expect(keywordOf("INFO")).toBe("help");
	});
	it("ignores everything else", () => {
		for (const w of ["yes", "stop by later", "", "can't stop", "no"]) {
			expect(keywordOf(w)).toBeNull();
		}
	});
});

describe("inboundAction", () => {
	it("routes the carrier keywords", () => {
		expect(inboundAction("STOP")).toBe("block");
		expect(inboundAction(" stop. ")).toBe("block");
		expect(inboundAction("Start")).toBe("unblock");
		expect(inboundAction("help")).toBe("ignore");
	});
	it("forwards everything else, including a sentence that starts with one", () => {
		expect(inboundAction("running late!")).toBe("forward");
		expect(inboundAction("stop by later")).toBe("forward");
		expect(inboundAction("")).toBe("forward");
	});
});
