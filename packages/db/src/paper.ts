import { eq } from "drizzle-orm";

import type { createDb } from "./index";
import { user } from "./schema/auth";
import { event, eventGuest } from "./schema/event";

type Db = ReturnType<typeof createDb>;

/**
 * Whose printed QR code this is, and for which event. Null when the key
 * means nothing -- never issued, or replaced since the card was printed.
 */
export async function findPaperInvite(db: Db, token: string) {
	const row = await db
		.select({
			userId: user.id,
			role: user.role,
			status: user.status,
			eventId: event.id,
			eventStatus: event.status,
		})
		.from(eventGuest)
		.innerJoin(user, eq(user.id, eventGuest.userId))
		.innerJoin(event, eq(event.id, eventGuest.eventId))
		.where(eq(eventGuest.paperToken, token))
		.get();
	return row ?? null;
}
