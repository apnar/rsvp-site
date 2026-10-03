import { eq } from "drizzle-orm";

import type { Db } from "./index";
import { user } from "./schema/auth";
import { eventGuest } from "./schema/event";

/**
 * A fresh key for a printed card: 16 hex characters, 64 bits. Half a
 * sign-in token, because a card's key reads and answers one invitation and
 * signs nobody in, and guessing 64 bits online is hopeless; the shorter
 * URL is what lets the QR code carry stronger error correction at the same
 * size. Lower case, like every key stored; `paperCardUrl` upper-cases it
 * for the code. `paperInvites` issues the same shape in SQL.
 */
export function newPaperToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The invitation a printed QR code stands for, with its guest's name and
 * standing. Null when the key means nothing -- never issued, or replaced
 * since the card was printed. Keys are stored lower case and the QR code
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
