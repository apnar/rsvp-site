import { eq } from "drizzle-orm";

import type { Db } from "./index";
import { user } from "./schema/auth";
import { eventGuest } from "./schema/event";

/**
 * The invitation a printed QR code stands for, with its guest's name and
 * standing. Null when the key means nothing -- never issued, or its guest
 * taken off the list since. Keys are stored lower case and the QR code
 * carries them upper case.
 */
export async function findPaperInvite(db: Db, token: string) {
	const row = await db
		.select({
			guest: eventGuest,
			name: user.name,
			firstName: user.firstName,
			lastName: user.lastName,
			status: user.status,
		})
		.from(eventGuest)
		.innerJoin(user, eq(user.id, eventGuest.userId))
		.where(eq(eventGuest.paperToken, token.toLowerCase()))
		.get();
	return row ?? null;
}
