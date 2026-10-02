import type { Address } from "./brevo";

/**
 * The verified sender in Brevo. The display name mirrors SITE_NAME in
 * apps/web/src/content/site.ts; change both together. `satisfies` rather than
 * a type annotation keeps `name` a plain string, so the email layout can use
 * it as the default kicker without a null check.
 */
export const SENDER = {
	name: "Botch RSVP",
	email: "info@rsvp.botch.com",
} satisfies Address;
