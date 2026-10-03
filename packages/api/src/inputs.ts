import { z } from "zod";

/** Every id a caller names. Bounded, so a megabyte "id" never reaches a query or a log. */
export const idSchema = z.string().min(1).max(64);

/** Every per-event procedure takes this, and the host-event middleware reads it. */
export const idInput = z.object({ eventId: idSchema });

export const emailSchema = z
	.email("That doesn't look like an email address.")
	.max(254);
