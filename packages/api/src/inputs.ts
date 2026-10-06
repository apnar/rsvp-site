import { z } from "zod";

/** Every id a caller names. Bounded, so a megabyte "id" never reaches a query or a log. */
export const idSchema = z.string().min(1).max(64);

/** Every per-event procedure takes this, and the host-event middleware reads it. */
export const idInput = z.object({ eventId: idSchema });

export const emailSchema = z
	.email("That doesn't look like an email address.")
	.max(254);

/** What a group or a family is called. */
export const nameSchema = z.string().trim().min(1, "Name it.").max(80);

/** A paper card's key or a share link's token, bounded like an id. */
export const tokenSchema = z.string().min(1).max(64);
export const tokenInput = z.object({ token: tokenSchema });

/** The signed, stateless token of an email-confirmation link: longer than a key. */
export const signedTokenInput = z.object({
	token: z.string().min(1).max(1024),
});
