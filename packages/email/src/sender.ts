import type { Address } from "./brevo";
import { SITE_LABEL } from "./render";

/**
 * The verified sender in Brevo. The display name mirrors SITE_NAME in
 * apps/web/src/content/site.ts; change both together. `satisfies` rather than
 * a type annotation keeps `name` a plain string.
 */
export const SENDER = {
	name: SITE_LABEL,
	email: "info@rsvp.botch.com",
} satisfies Address;
