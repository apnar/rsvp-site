import { allowDryRun, env } from "@rsvp-site/env/server";

import { createTexter, type Texter } from "./texter";

/**
 * The texter for this Worker. Without TELNYX_API_KEY (the usual local setup)
 * it logs every text to the console instead of sending it -- on localhost
 * only. Anywhere else a missing key fails each send rather than reporting
 * success and writing sign-in links into the Worker's logs.
 */
export function getTexter(): Texter {
	return createTexter({
		apiKey: env.TELNYX_API_KEY,
		from: env.TELNYX_FROM,
		allowDryRun: allowDryRun(),
	});
}

/** Base64 Ed25519 key Telnyx signs webhooks with; undefined means no webhook. */
export function telnyxPublicKey(): string | undefined {
	return env.TELNYX_PUBLIC_KEY || undefined;
}

/** The number texts come from, E.164. */
export function textingFrom(): string {
	return env.TELNYX_FROM;
}
