import { env } from "@rsvp-site/env/server";

import { createMailer, type Mailer } from "./mailer";
import { SENDER } from "./sender";

/**
 * The mailer for this Worker. Without BREVO_API_KEY (the usual local setup)
 * it logs every email to the console instead of sending it.
 */
export function getMailer(): Mailer {
	return createMailer({ apiKey: env.BREVO_API_KEY, sender: SENDER });
}

/** Public origin used for links inside emails. */
export function siteUrl(): string {
	return env.BETTER_AUTH_URL.replace(/\/$/, "");
}
