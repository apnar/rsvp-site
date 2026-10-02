/**
 * Thin client for Brevo's transactional email endpoint. Pure: takes the API
 * key and (optionally) a fetch implementation, so it runs in tests without
 * any Cloudflare bindings.
 */

export const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
export const BREVO_BLOCKED_CONTACTS =
	"https://api.brevo.com/v3/smtp/blockedContacts";

/** Brevo caps `messageVersions` at 99 per call (2000 recipients overall). */
export const MAX_VERSIONS_PER_CALL = 99;

export type Address = { email: string; name?: string | null };

/** A fully rendered email: subject plus HTML and plain-text bodies. */
export type Rendered = { subject: string; html: string; text: string };

/** One personalised copy: its recipients and the values for `{{ params.* }}`. */
export type MessageVersion = {
	to: Address[];
	params?: Record<string, string>;
};

export type BrevoRequest = {
	sender: Address;
	to?: Address[];
	messageVersions?: MessageVersion[];
	subject: string;
	htmlContent: string;
	textContent: string;
	replyTo?: Address;
	headers?: Record<string, string>;
	tags?: string[];
	params?: Record<string, string>;
};

export type SendOutcome =
	| { ok: true; messageId: string }
	| { ok: false; status: number; error: string };

const RETRY_DELAY_MS = 500;

function toBrevoAddress(a: Address) {
	return a.name ? { email: a.email, name: a.name } : { email: a.email };
}

/** Strip null names so Brevo does not reject the payload. */
export function serializeRequest(body: BrevoRequest): Record<string, unknown> {
	return {
		...body,
		sender: toBrevoAddress(body.sender),
		to: body.to?.map(toBrevoAddress),
		replyTo: body.replyTo ? toBrevoAddress(body.replyTo) : undefined,
		messageVersions: body.messageVersions?.map((v) => ({
			...v,
			to: v.to.map(toBrevoAddress),
		})),
	};
}

async function attempt(
	body: BrevoRequest,
	apiKey: string,
	fetchImpl: typeof fetch,
): Promise<SendOutcome> {
	let response: Response;
	try {
		response = await fetchImpl(BREVO_ENDPOINT, {
			method: "POST",
			headers: {
				"api-key": apiKey,
				accept: "application/json",
				"content-type": "application/json",
			},
			body: JSON.stringify(serializeRequest(body)),
		});
	} catch (error) {
		return {
			ok: false,
			status: 0,
			error: error instanceof Error ? error.message : String(error),
		};
	}
	if (response.status === 201 || response.status === 202) {
		const data = (await response.json().catch(() => ({}))) as {
			messageId?: string;
			messageIds?: string[];
		};
		return {
			ok: true,
			messageId: data.messageId ?? data.messageIds?.join(",") ?? "",
		};
	}
	const text = await response.text().catch(() => "");
	return {
		ok: false,
		status: response.status,
		error: text || response.statusText || `HTTP ${response.status}`,
	};
}

/** POST one request to Brevo, retrying once on rate limits and server errors. */
export async function postBrevo(
	body: BrevoRequest,
	opts: { apiKey: string; fetch?: typeof fetch },
): Promise<SendOutcome> {
	const fetchImpl = opts.fetch ?? fetch;
	const first = await attempt(body, opts.apiKey, fetchImpl);
	if (first.ok) return first;
	const retryable =
		first.status === 0 || first.status === 429 || first.status >= 500;
	if (!retryable) return first;
	await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
	return attempt(body, opts.apiKey, fetchImpl);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}
	return out;
}

/**
 * Remove an address from Brevo's transactional blocklist. Brevo puts people
 * there when they use the List-Unsubscribe header it adds to every email,
 * so someone who rejoins through the site must be unblocked or Brevo will
 * silently drop their mail. 404 means they were never blocked.
 */
export async function unblockContact(
	email: string,
	opts: { apiKey: string; fetch?: typeof fetch },
): Promise<{ ok: boolean; status: number }> {
	const fetchImpl = opts.fetch ?? fetch;
	try {
		const response = await fetchImpl(
			`${BREVO_BLOCKED_CONTACTS}/${encodeURIComponent(email)}`,
			{ method: "DELETE", headers: { "api-key": opts.apiKey } },
		);
		return {
			ok: response.status === 204 || response.status === 404,
			status: response.status,
		};
	} catch {
		return { ok: false, status: 0 };
	}
}
