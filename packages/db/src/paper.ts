import { eq } from "drizzle-orm";

import type { Db } from "./index";
import { user } from "./schema/auth";
import { eventGuest } from "./schema/event";

/**
 * The invitation a printed QR code stands for, with its guest's name and
 * standing. Null when the key means nothing -- never issued, or replaced
 * since the card was printed.
 */
export async function findPaperInvite(db: Db, token: string) {
	const row = await db
		.select({ guest: eventGuest, name: user.name, status: user.status })
		.from(eventGuest)
		.innerJoin(user, eq(user.id, eventGuest.userId))
		.where(eq(eventGuest.paperToken, token))
		.get();
	return row ?? null;
}
