import { ORPCError } from "@orpc/server";
import { inBook, remember } from "@rsvp-site/db/address-book";
import { insertChunks } from "@rsvp-site/db/batch";
import {
	findOrCreatePeople,
	type Person,
	parseAddresses,
} from "@rsvp-site/db/people";
import { canHost, isAdmin } from "@rsvp-site/db/roles";
import { user } from "@rsvp-site/db/schema/auth";
import {
	contact,
	contactGroup,
	contactGroupMember,
} from "@rsvp-site/db/schema/contact";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { hostProcedure } from "../index";
import { idSchema } from "../inputs";

const groupInput = z.object({ groupId: idSchema });
const nameSchema = z.string().trim().min(1, "Name it.").max(80);
const emailsSchema = z.string().max(20_000);

/**
 * A group the caller may touch: their own, or anybody's for an admin. A
 * stranger's group is "no such group", the same as a wrong id.
 */
async function ownGroup(
	context: Pick<Context, "db"> & { me: Pick<Person, "id" | "role"> },
	groupId: string,
) {
	const row = await context.db
		.select()
		.from(contactGroup)
		.where(eq(contactGroup.id, groupId))
		.get();
	if (!row || (row.ownerId !== context.me.id && !isAdmin(context.me))) {
		throw new ORPCError("NOT_FOUND", { message: "No such group." });
	}
	return row;
}

/** Addresses into people, and those people into the host's book. */
async function addToBook(
	context: Pick<Context, "db">,
	ownerId: string,
	raw: string,
): Promise<string[]> {
	const emails = parseAddresses(raw);
	if (emails.length > 500) {
		throw new ORPCError("BAD_REQUEST", { message: "Add them 500 at a time." });
	}
	const people = (await findOrCreatePeople(context.db, emails, "host")).filter(
		(p) => p.status !== "deactivated",
	);
	const ids = people.map((p) => p.id);
	await remember(context.db, ownerId, ids);
	return ids.filter((id) => id !== ownerId);
}

/** Put people in a group; they must be in the group owner's book already. */
async function join(
	context: Pick<Context, "db">,
	groupId: string,
	userIds: readonly string[],
): Promise<number> {
	let added = 0;
	const members = userIds.map((userId) => ({ groupId, userId }));
	for (const slice of insertChunks(contactGroupMember, members)) {
		const rows = await context.db
			.insert(contactGroupMember)
			.values(slice)
			.onConflictDoNothing()
			.returning({ userId: contactGroupMember.userId })
			.all();
		added += rows.length;
	}
	return added;
}

/**
 * A host's address book and the groups made from it. Private: other hosts
 * never see either, because a host's address book is not the site's.
 */
export const contactsRouter = {
	/**
	 * The caller's book -- everybody they have invited or added -- with the
	 * groups each person is in, and the groups themselves.
	 */
	book: hostProcedure.handler(async ({ context }) => {
		const [people, groups] = await Promise.all([
			context.db
				.select({
					userId: user.id,
					name: user.name,
					email: user.email,
					noEmail: user.noEmail,
					unsubscribedAt: user.unsubscribedAt,
					role: user.role,
					status: user.status,
				})
				.from(contact)
				.innerJoin(user, eq(user.id, contact.userId))
				.where(eq(contact.ownerId, context.me.id))
				.orderBy(asc(user.name))
				.all(),
			context.db
				.select({ id: contactGroup.id, name: contactGroup.name })
				.from(contactGroup)
				.where(eq(contactGroup.ownerId, context.me.id))
				.orderBy(asc(contactGroup.name))
				.all(),
		]);
		// Joined to the caller's groups rather than filtered by an id list,
		// which D1's bound-parameter cap would break for a long list of groups.
		const members = await context.db
			.select({
				groupId: contactGroupMember.groupId,
				userId: contactGroupMember.userId,
			})
			.from(contactGroupMember)
			.innerJoin(contactGroup, eq(contactGroup.id, contactGroupMember.groupId))
			.where(eq(contactGroup.ownerId, context.me.id))
			.all();
		return {
			people: people.map(({ unsubscribedAt, role, status, ...p }) => ({
				...p,
				// Who could be a co-host: hosts and admins who are still in.
				canHost: canHost({ role }) && status !== "deactivated",
				// A placeholder address is never shown, not even to its host.
				email: p.noEmail ? "" : p.email,
				unsubscribed: unsubscribedAt !== null,
				groupIds: members
					.filter((m) => m.userId === p.userId)
					.map((m) => m.groupId),
			})),
			groups: groups.map((g) => ({
				...g,
				count: members.filter((m) => m.groupId === g.id).length,
			})),
		};
	}),

	/** Add people to the book by address, without inviting them to anything. */
	addPeople: hostProcedure
		.input(z.object({ emails: emailsSchema.min(1) }))
		.handler(async ({ context, input }) => {
			const ids = await addToBook(context, context.me.id, input.emails);
			return { added: ids.length };
		}),

	/**
	 * Take somebody out of the book, and so out of every group of the
	 * caller's. Events they are already invited to keep them.
	 */
	removePerson: hostProcedure
		.input(z.object({ userId: idSchema }))
		.handler(async ({ context, input }) => {
			const mine = context.db
				.select({ id: contactGroup.id })
				.from(contactGroup)
				.where(eq(contactGroup.ownerId, context.me.id));
			await context.db.batch([
				context.db
					.delete(contactGroupMember)
					.where(
						and(
							eq(contactGroupMember.userId, input.userId),
							inArray(contactGroupMember.groupId, mine),
						),
					),
				context.db
					.delete(contact)
					.where(
						and(
							eq(contact.ownerId, context.me.id),
							eq(contact.userId, input.userId),
						),
					),
			]);
			return { ok: true };
		}),

	/** A new group, from people in the book and/or new addresses. */
	create: hostProcedure
		.input(
			z.object({
				name: nameSchema,
				emails: emailsSchema.default(""),
				userIds: z.array(idSchema).max(1000).default([]),
			}),
		)
		.handler(async ({ context, input }) => {
			// People first, the group after: addToBook refuses a request that is
			// too big, and that must not leave an empty group behind.
			const known = await inBook(context.db, context.me.id, input.userIds);
			const typed = input.emails.trim()
				? await addToBook(context, context.me.id, input.emails)
				: [];
			const id = crypto.randomUUID();
			await context.db
				.insert(contactGroup)
				.values({ id, ownerId: context.me.id, name: input.name });
			const added = await join(context, id, [...new Set([...known, ...typed])]);
			return { id, added };
		}),

	rename: hostProcedure
		.input(groupInput.extend({ name: nameSchema }))
		.handler(async ({ context, input }) => {
			const row = await ownGroup(context, input.groupId);
			await context.db
				.update(contactGroup)
				.set({ name: input.name })
				.where(eq(contactGroup.id, row.id));
			return { ok: true };
		}),

	/** Delete a group. Its people stay in the book and on their events. */
	remove: hostProcedure
		.input(groupInput)
		.handler(async ({ context, input }) => {
			const row = await ownGroup(context, input.groupId);
			await context.db.delete(contactGroup).where(eq(contactGroup.id, row.id));
			return { ok: true };
		}),

	/** New addresses straight into a group (and so into the book). */
	addMembers: hostProcedure
		.input(groupInput.extend({ emails: emailsSchema.min(1) }))
		.handler(async ({ context, input }) => {
			const row = await ownGroup(context, input.groupId);
			const ids = await addToBook(context, row.ownerId, input.emails);
			return { added: await join(context, row.id, ids) };
		}),

	/**
	 * Put somebody from the book in a group, or take them out. Groups are
	 * made from the book: somebody not in it cannot be put in a group.
	 */
	setMember: hostProcedure
		.input(groupInput.extend({ userId: idSchema, member: z.boolean() }))
		.handler(async ({ context, input }) => {
			const row = await ownGroup(context, input.groupId);
			if (input.member) {
				const known = await inBook(context.db, row.ownerId, [input.userId]);
				if (!known.has(input.userId)) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Add them to the address book first.",
					});
				}
				await join(context, row.id, [input.userId]);
			} else {
				await context.db
					.delete(contactGroupMember)
					.where(
						and(
							eq(contactGroupMember.groupId, row.id),
							eq(contactGroupMember.userId, input.userId),
						),
					);
			}
			return { ok: true };
		}),
};
