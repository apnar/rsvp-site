import { and, eq, inArray } from "drizzle-orm";

import { batchAll, insertChunks, mapChunks } from "./batch";
import type { Db } from "./index";
import { contact } from "./schema/contact";

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
	const rows = ids.map((userId) => ({ ownerId, userId }));
	await batchAll(
		db,
		insertChunks(contact, rows).map((slice) =>
			db.insert(contact).values(slice).onConflictDoNothing(),
		),
	);
}

/** Which of these people are in the host's book; the rest are refused. */
export async function inBook(
	db: Db,
	ownerId: string,
	userIds: readonly string[],
): Promise<Set<string>> {
	const rows = await mapChunks([...new Set(userIds)], (slice) =>
		db
			.select({ userId: contact.userId })
			.from(contact)
			.where(and(eq(contact.ownerId, ownerId), inArray(contact.userId, slice)))
			.all(),
	);
	return new Set(rows.map((r) => r.userId));
}
