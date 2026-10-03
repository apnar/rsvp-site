import { z } from "zod";

/** Every per-event procedure takes this, and the host-event middleware reads it. */
export const idInput = z.object({ eventId: z.string().min(1) });

export const emailSchema = z
	.email("That doesn't look like an email address.")
	.max(254);
