import type { FilledBy } from "@rsvp-site/db/details";
import { z } from "zod";

/**
 * Somebody asked for an address to be put on their record, and a link went
 * there to confirm it. The link carries the whole request, signed, so
 * nothing is stored until the address's owner presses the button: a typo
 * leaves no trace, and a stranger's inbox gets one email and no way in.
 */
export type EmailClaim = {
	userId: string;
	email: string;
	by: FilledBy;
	/** Epoch milliseconds. */
	expires: number;
};

/** Long enough for somebody who reads their email on Sundays. */
export const CLAIM_TTL_MS = 3 * 24 * 60 * 60_000;

const encoder = new TextEncoder();

// Signed under the site's one secret, so the input names its purpose: no
// other signature made with that secret can pass for one of these.
const PURPOSE = "email-claim";

const claimShape = z.tuple([
	z.string().min(1).max(64),
	z.string().min(3).max(254),
	z.enum(["self", "card"]),
	z.number().int(),
]);

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
	try {
		const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

export async function signEmailClaim(
	secret: string,
	claim: EmailClaim,
): Promise<string> {
	const body = toBase64Url(
		encoder.encode(
			JSON.stringify([claim.userId, claim.email, claim.by, claim.expires]),
		),
	);
	const mac = await crypto.subtle.sign(
		"HMAC",
		await hmacKey(secret),
		encoder.encode(`${PURPOSE}.${body}`),
	);
	return `${body}.${toBase64Url(new Uint8Array(mac))}`;
}

/**
 * The claim behind a link, "expired" when it ran out, or null when it was
 * never ours. `verify` compares in constant time.
 */
export async function readEmailClaim(
	secret: string,
	token: string,
	now: number,
): Promise<EmailClaim | "expired" | null> {
	const [body, mac, ...rest] = token.split(".");
	if (!body || !mac || rest.length > 0) return null;
	const signature = fromBase64Url(mac);
	if (!signature) return null;
	const ok = await crypto.subtle.verify(
		"HMAC",
		await hmacKey(secret),
		signature,
		encoder.encode(`${PURPOSE}.${body}`),
	);
	if (!ok) return null;
	const bytes = fromBase64Url(body);
	if (!bytes) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return null;
	}
	const fields = claimShape.safeParse(parsed);
	if (!fields.success) return null;
	const [userId, email, by, expires] = fields.data;
	if (expires < now) return "expired";
	return { userId, email, by, expires };
}
