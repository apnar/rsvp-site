import { and, eq, inArray } from "drizzle-orm";

import type { createDb } from "./index";
import { contact } from "./schema/contact";

type Db = ReturnType<typeof createDb>;

/**
 * Put people in a host's address book. Called wherever a host adds somebody
 * -- to an event, to a group, or to the book itself -- so the book is simply
 * everybody they have chosen. Idempotent, and never lists the host in
 * their own book.
 */
export async function remember(
	db: Db,
	ownerId: string,
	userIds: readonly string[],
): Promise<void> {
	const ids = [...new Set(userIds)].filter((id) => id !== ownerId);
	for (let i = 0; i < ids.length; i += 30) {
		await db
			.insert(contact)
			.values(ids.slice(i, i + 30).map((userId) => ({ ownerId, userId })))
			.onConflictDoNothing();
	}
}

/** Which of these people are in the host's book; the rest are refused. */
export async function inBook(
	db: Db,
	ownerId: string,
	userIds: readonly string[],
): Promise<Set<string>> {
	const found = new Set<string>();
	const ids = [...new Set(userIds)];
	for (let i = 0; i < ids.length; i += 90) {
		const rows = await db
			.select({ userId: contact.userId })
			.from(contact)
			.where(
				and(
					eq(contact.ownerId, ownerId),
					inArray(contact.userId, ids.slice(i, i + 90)),
				),
			)
			.all();
		for (const r of rows) found.add(r.userId);
	}
	return found;
}
