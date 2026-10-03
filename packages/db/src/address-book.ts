import { and, eq, inArray } from "drizzle-orm";

import { batchAll, inChunks, insertChunks, mapChunks } from "./batch";
import type { Db } from "./index";
import { contact, contactGroup, contactGroupMember } from "./schema/contact";

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

/**
 * Point an address book entry at somebody else: the host changed a
 * contact's email to one that is already a person's. The entry and its
 * group memberships move, as one batch; events already sent keep whoever
 * they were sent to, and the person left behind is not touched.
 */
export async function repointEntry(
	db: Db,
	ownerId: string,
	fromId: string,
	toId: string,
): Promise<void> {
	const groups = await db
		.select({ groupId: contactGroupMember.groupId })
		.from(contactGroupMember)
		.innerJoin(contactGroup, eq(contactGroup.id, contactGroupMember.groupId))
		.where(
			and(
				eq(contactGroup.ownerId, ownerId),
				eq(contactGroupMember.userId, fromId),
			),
		)
		.all();
	const ids = groups.map((g) => g.groupId);
	await db.batch([
		db.insert(contact).values({ ownerId, userId: toId }).onConflictDoNothing(),
		...insertChunks(
			contactGroupMember,
			ids.map((groupId) => ({ groupId, userId: toId })),
		).map((slice) =>
			db.insert(contactGroupMember).values(slice).onConflictDoNothing(),
		),
		...inChunks(ids).map((slice) =>
			db
				.delete(contactGroupMember)
				.where(
					and(
						eq(contactGroupMember.userId, fromId),
						inArray(contactGroupMember.groupId, slice),
					),
				),
		),
		db
			.delete(contact)
			.where(and(eq(contact.ownerId, ownerId), eq(contact.userId, fromId))),
	]);
}
