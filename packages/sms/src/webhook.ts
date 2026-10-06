const encoder = new TextEncoder();

function fromBase64(value: string): Uint8Array<ArrayBuffer> | null {
	try {
		const bin = atob(value.trim());
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	} catch {
		return null;
	}
}

/**
 * Telnyx signs `<timestamp>|<raw body>` with Ed25519. The timestamp window
 * stops a captured delivery being replayed later; it is checked both ways so
 * a skewed clock cannot open it up either. Never throws: anything wrong with
 * the input is simply "not verified".
 */
export async function verifyTelnyxSignature(opts: {
	publicKey: string;
	signature: string | null | undefined;
	timestamp: string | null | undefined;
	rawBody: string;
	now?: Date;
	toleranceSeconds?: number;
}): Promise<boolean> {
	try {
		const { publicKey, signature, timestamp, rawBody } = opts;
		if (!publicKey || !signature || !timestamp) return false;
		if (!/^\d{1,12}$/.test(timestamp.trim())) return false;
		const nowSeconds = (opts.now ?? new Date()).getTime() / 1000;
		const tolerance = opts.toleranceSeconds ?? 300;
		if (Math.abs(nowSeconds - Number(timestamp)) > tolerance) return false;
		const keyBytes = fromBase64(publicKey);
		const sig = fromBase64(signature);
		if (!keyBytes || !sig || keyBytes.length !== 32 || sig.length !== 64) {
			return false;
		}
		const key = await crypto.subtle.importKey(
			"raw",
			keyBytes,
			{ name: "Ed25519" },
			false,
			["verify"],
		);
		return await crypto.subtle.verify(
			{ name: "Ed25519" },
			key,
			sig,
			encoder.encode(`${timestamp.trim()}|${rawBody}`),
		);
	} catch {
		return false;
	}
}

export type TelnyxEvent =
	| {
			type: "received";
			eventId: string;
			messageId: string;
			from: string;
			to: string;
			text: string;
	  }
	| {
			type: "status";
			eventId: string;
			messageId: string;
			status: "sent" | "delivered" | "failed";
			errorCode: string | null;
			error: string | null;
	  }
	| { type: "other"; eventId: string | null };

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Obj)
		: null;
}

function str(value: unknown): string | null {
	return typeof value === "string" && value ? value : null;
}

export function parseTelnyxEvent(body: unknown): TelnyxEvent {
	const data = obj(obj(body)?.data);
	const eventId = str(data?.id);
	const type = str(data?.event_type);
	const payload = obj(data?.payload);
	const messageId = str(payload?.id);
	if (!data || !type || !payload || !eventId || !messageId) {
		return { type: "other", eventId };
	}
	const firstTo = Array.isArray(payload.to) ? obj(payload.to[0]) : null;

	if (type === "message.received") {
		const from = str(obj(payload.from)?.phone_number);
		const to = str(firstTo?.phone_number);
		if (!from || !to) return { type: "other", eventId };
		return {
			type: "received",
			eventId,
			messageId,
			from,
			to,
			text: typeof payload.text === "string" ? payload.text : "",
		};
	}

	if (type === "message.sent" || type === "message.finalized") {
		let status: "sent" | "delivered" | "failed" = "sent";
		if (type === "message.finalized") {
			const s = str(firstTo?.status);
			if (s === "delivered") status = "delivered";
			else if (s === "sending_failed" || s === "delivery_failed") {
				status = "failed";
			}
		}
		const err = Array.isArray(payload.errors) ? obj(payload.errors[0]) : null;
		const code = err?.code;
		return {
			type: "status",
			eventId,
			messageId,
			status,
			errorCode:
				typeof code === "string" || typeof code === "number"
					? String(code)
					: null,
			error: str(err?.detail) ?? str(err?.title),
		};
	}
	return { type: "other", eventId };
}

const STOPS = new Set([
	"STOP",
	"STOPALL",
	"STOP ALL",
	"UNSUBSCRIBE",
	"CANCEL",
	"END",
	"QUIT",
	"REVOKE",
	"OPTOUT",
	"OPT OUT",
]);
const STARTS = new Set(["START", "UNSTOP"]);
const HELPS = new Set(["HELP", "INFO"]);

/**
 * The carrier-mandated keywords, whole message only: "stop by later" is a
 * guest talking. YES is deliberately not here, it is an RSVP word.
 */
export function keywordOf(text: string): "stop" | "start" | "help" | null {
	const word = text
		.trim()
		.toUpperCase()
		.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "")
		.replace(/\s+/g, " ");
	if (STOPS.has(word)) return "stop";
	if (STARTS.has(word)) return "start";
	if (HELPS.has(word)) return "help";
	return null;
}

/**
 * What the site does with a text somebody sent us. Telnyx sends the
 * profile's own HELP answer, so that one is nothing for us to do; anything
 * that isn't a carrier keyword is a person writing, to forward.
 */
export function inboundAction(
	text: string,
): "block" | "unblock" | "ignore" | "forward" {
	const keyword = keywordOf(text);
	if (keyword === "stop") return "block";
	if (keyword === "start") return "unblock";
	if (keyword === "help") return "ignore";
	return "forward";
}
