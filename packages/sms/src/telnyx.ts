const TELNYX_MESSAGES = "https://api.telnyx.com/v2/messages";

const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 500;

type TextRequest = {
	from: string;
	to: string;
	text: string;
	media_urls?: string[];
	type: "SMS" | "MMS";
};

export type TextOutcome =
	| { ok: true; id: string; parts: number }
	| { ok: false; status: number; code: string | null; error: string };

/** A picture makes it an MMS; Telnyx rejects media on a plain SMS. */
export function textRequest(m: {
	from: string;
	to: string;
	text: string;
	mediaUrl?: string | null;
}): TextRequest {
	const base = { from: m.from, to: m.to, text: m.text };
	return m.mediaUrl
		? { ...base, media_urls: [m.mediaUrl], type: "MMS" }
		: { ...base, type: "SMS" };
}

async function attempt(
	body: TextRequest,
	apiKey: string,
	fetchImpl: typeof fetch,
): Promise<TextOutcome> {
	let response: Response;
	try {
		response = await fetchImpl(TELNYX_MESSAGES, {
			method: "POST",
			headers: {
				authorization: `Bearer ${apiKey}`,
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch (error) {
		return {
			ok: false,
			status: 0,
			code: null,
			error: error instanceof Error ? error.message : "Network error",
		};
	}
	const raw = await response.text().catch(() => "");
	let json: unknown = null;
	try {
		json = raw ? JSON.parse(raw) : null;
	} catch {
		json = null;
	}
	if (response.ok) {
		const data = (json as { data?: { id?: unknown; parts?: unknown } } | null)
			?.data;
		return {
			ok: true,
			id: typeof data?.id === "string" ? data.id : "",
			parts: typeof data?.parts === "number" && data.parts > 0 ? data.parts : 1,
		};
	}
	const first = (
		json as {
			errors?: { code?: unknown; title?: unknown; detail?: unknown }[];
		} | null
	)?.errors?.[0];
	const code =
		first?.code === undefined || first.code === null
			? null
			: String(first.code);
	const message =
		(typeof first?.detail === "string" && first.detail) ||
		(typeof first?.title === "string" && first.title) ||
		raw ||
		response.statusText ||
		`HTTP ${response.status}`;
	return { ok: false, status: response.status, code, error: message };
}

/**
 * POST one message to Telnyx, retrying once when Telnyx said it did nothing:
 * 429 and 503 turn a request away before it is processed. A timeout, a
 * dropped connection or another 5xx may come after Telnyx accepted the
 * message, and a retry then texts the person twice; those are reported as
 * failures for a host to look at.
 */
export async function postMessage(
	body: TextRequest,
	opts: { apiKey: string; fetch?: typeof fetch },
): Promise<TextOutcome> {
	const fetchImpl = opts.fetch ?? fetch;
	const first = await attempt(body, opts.apiKey, fetchImpl);
	if (first.ok) return first;
	if (first.status !== 429 && first.status !== 503) return first;
	await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
	return attempt(body, opts.apiKey, fetchImpl);
}

/**
 * What an error code says about the number itself, so the site stops texting
 * it: the person opted out, it is a landline, or it is not a number at all.
 * Anything else (spend limits, carrier filtering) is about us, not them.
 */
export function blockFor(
	code: string | null,
): "stop" | "landline" | "invalid" | null {
	switch (code) {
		case "40300":
			return "stop";
		case "40001":
			return "landline";
		case "40310":
		case "40311":
			return "invalid";
		default:
			return null;
	}
}

/** A short reason a host can read next to a guest whose text failed. */
export function describeCode(code: string | null): string {
	switch (code) {
		case "40300":
			return "replied STOP";
		case "40001":
			return "landline";
		case "40310":
		case "40311":
			return "not a valid number";
		case "40010":
			return "number not registered yet";
		case "40333":
			return "daily spend limit reached";
		case "40002":
		case "40003":
			return "carrier flagged as spam";
		default:
			return "couldn't be delivered";
	}
}
