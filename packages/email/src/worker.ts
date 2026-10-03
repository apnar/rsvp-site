import { env } from "@rsvp-site/env/server";

import { createMailer, type Mailer } from "./mailer";
import { SENDER } from "./sender";

/**
 * The mailer for this Worker. Without BREVO_API_KEY (the usual local setup)
 * it logs every email to the console instead of sending it -- on localhost
 * only. Anywhere else a missing key fails each send rather than reporting
 * success and writing sign-in links into the Worker's logs.
 */
export function getMailer(): Mailer {
	return createMailer({
		apiKey: env.BREVO_API_KEY,
		sender: SENDER,
		allowDryRun: isLocal(env.BETTER_AUTH_URL),
	});
}

function isLocal(origin: string): boolean {
	try {
		const { hostname } = new URL(origin);
		return hostname === "localhost" || hostname === "127.0.0.1";
	} catch {
		return false;
	}
}

/** Public origin used for links inside emails. */
export function siteUrl(): string {
	return env.BETTER_AUTH_URL.replace(/\/$/, "");
}
