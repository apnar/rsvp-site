import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { inBook } from "./address-book";
import { mapChunks } from "./batch";
import type { Db } from "./index";
import { notDeactivated } from "./people";
import { isAdmin } from "./roles";
import { user } from "./schema/auth";
import {
	contactGroup,
	contactGroupMember,
	contactGroupShare,
} from "./schema/contact";
import { eventGuest } from "./schema/event";
import { family, familyMember } from "./schema/family";

/**
 * Who is in which family, and what follows from it. Every read of family
 * membership is here, as the address book's are in `address-book.ts`:
 * answering for somebody else hangs on it, so it is checked one way.
 */

/**
 * The invitations on this event of the people in this person's family:
 * the ones they may answer for. Never themselves, never anybody
 * deactivated, and only relatives who are actually on the list -- a family
 * where the host invited two of four answers for those two.
 */
export async function relativesOnEvent(
	db: Db,
	eventId: string,
	userId: string,
) {
	// Two aliases of one table: written as a join so drizzle qualifies every
	// column (a correlated `sql` subquery here would compare a table's
	// columns with themselves; see CLAUDE.md).
	const mine = alias(familyMember, "mine");
	const kin = alias(familyMember, "kin");
	return db
		.select({
			id: eventGuest.id,
			userId: eventGuest.userId,
			name: user.name,
			response: eventGuest.response,
			adults: eventGuest.adults,
			kids: eventGuest.kids,
			child: kin.child,
		})
		.from(mine)
		.innerJoin(kin, eq(kin.familyId, mine.familyId))
		.innerJoin(
			eventGuest,
			and(eq(eventGuest.userId, kin.userId), eq(eventGuest.eventId, eventId)),
		)
		.innerJoin(user, eq(user.id, kin.userId))
		.where(
			and(eq(mine.userId, userId), ne(kin.userId, userId), notDeactivated()),
		)
		.all();
}

/** In any family: then only an admin, or they themselves, edit their details. */
export async function inAnyFamily(db: Db, userId: string): Promise<boolean> {
	const row = await db
		.select({ userId: familyMember.userId })
		.from(familyMember)
		.where(eq(familyMember.userId, userId))
		.get();
	return row !== undefined;
}

/**
 * Which of these people a host may put on a list by id: anybody in their
 * own book, in a family they can see (shared ones; all of them for an
 * admin), or in a group that is theirs or shared with them. A guessed id adds
 * nobody, and nobody deactivated is added however they were reached.
 */
export async function pickable(
	db: Db,
	me: { id: string; role: string | null },
	userIds: readonly string[],
): Promise<Set<string>> {
	const ids = [...new Set(userIds)];
	if (ids.length === 0) return new Set();
	const admin = isAdmin(me);
	const [book, viaFamily, viaGroup, active] = await Promise.all([
		inBook(db, me.id, ids),
		mapChunks(ids, (slice) =>
			db
				.select({ userId: familyMember.userId })
				.from(familyMember)
				.innerJoin(family, eq(family.id, familyMember.familyId))
				.where(
					and(
						inArray(familyMember.userId, slice),
						admin ? undefined : eq(family.shared, true),
					),
				)
				.all(),
		),
		mapChunks(ids, (slice) =>
			db
				.select({ userId: contactGroupMember.userId })
				.from(contactGroupMember)
				.innerJoin(
					contactGroup,
					eq(contactGroup.id, contactGroupMember.groupId),
				)
				.where(
					and(
						inArray(contactGroupMember.userId, slice),
						or(
							eq(contactGroup.ownerId, me.id),
							inArray(contactGroup.id, sharedWith(db, me.id)),
						),
					),
				)
				.all(),
		),
		mapChunks(ids, (slice) =>
			db
				.select({ id: user.id })
				.from(user)
				.where(and(inArray(user.id, slice), notDeactivated()))
				.all(),
		),
	]);
	const reachable = new Set([
		...book,
		...viaFamily.map((r) => r.userId),
		...viaGroup.map((r) => r.userId),
	]);
	return new Set(active.map((r) => r.id).filter((id) => reachable.has(id)));
}

export type FamilyMemberRow = {
	id: string;
	name: string;
	email: string;
	noEmail: boolean;
	child: boolean;
};

/**
 * Families with their members, deactivated people left out. `onlyShared`
 * is what a host sees; an admin sees every one.
 */
export async function listFamilies(db: Db, opts: { onlyShared: boolean }) {
	const [families, members] = await Promise.all([
		db
			.select({ id: family.id, name: family.name, shared: family.shared })
			.from(family)
			.where(opts.onlyShared ? eq(family.shared, true) : undefined)
			.orderBy(asc(family.name))
			.all(),
		db
			.select({
				familyId: familyMember.familyId,
				id: user.id,
				name: user.name,
				email: user.email,
				noEmail: user.noEmail,
				child: familyMember.child,
			})
			.from(familyMember)
			.innerJoin(family, eq(family.id, familyMember.familyId))
			.innerJoin(user, eq(user.id, familyMember.userId))
			.where(
				and(
					notDeactivated(),
					opts.onlyShared ? eq(family.shared, true) : undefined,
				),
			)
			.orderBy(asc(familyMember.child), asc(user.name))
			.all(),
	]);
	const byFamily = new Map<string, FamilyMemberRow[]>();
	for (const { familyId, ...m } of members) {
		// A placeholder address is never shown.
		const row = { ...m, email: m.noEmail ? "" : m.email };
		const list = byFamily.get(familyId);
		if (list) list.push(row);
		else byFamily.set(familyId, [row]);
	}
	return families.map((f) => ({ ...f, members: byFamily.get(f.id) ?? [] }));
}

/** The ids of the groups an admin has shared with this host, as a subquery. */
function sharedWith(db: Db, hostId: string) {
	return db
		.select({ id: contactGroupShare.groupId })
		.from(contactGroupShare)
		.where(eq(contactGroupShare.userId, hostId));
}

/**
 * Groups an admin has shared with this host, with their members, for their
 * picker. Their own are left out: they already have those.
 */
export async function sharedGroups(db: Db, hostId: string) {
	const owner = alias(user, "owner");
	const [groups, members] = await Promise.all([
		db
			.select({
				id: contactGroup.id,
				name: contactGroup.name,
				ownerName: owner.name,
			})
			.from(contactGroup)
			.innerJoin(owner, eq(owner.id, contactGroup.ownerId))
			.where(
				and(
					inArray(contactGroup.id, sharedWith(db, hostId)),
					ne(contactGroup.ownerId, hostId),
				),
			)
			.orderBy(asc(contactGroup.name))
			.all(),
		db
			.select({
				groupId: contactGroupMember.groupId,
				id: user.id,
				name: user.name,
			})
			.from(contactGroupMember)
			.innerJoin(contactGroup, eq(contactGroup.id, contactGroupMember.groupId))
			.innerJoin(user, eq(user.id, contactGroupMember.userId))
			.where(
				and(
					inArray(contactGroup.id, sharedWith(db, hostId)),
					ne(contactGroup.ownerId, hostId),
					notDeactivated(),
				),
			)
			.orderBy(asc(user.name))
			.all(),
	]);
	const byGroup = new Map<string, { id: string; name: string }[]>();
	for (const { groupId, ...m } of members) {
		const list = byGroup.get(groupId);
		if (list) list.push(m);
		else byGroup.set(groupId, [m]);
	}
	return groups.map((g) => ({ ...g, members: byGroup.get(g.id) ?? [] }));
}
