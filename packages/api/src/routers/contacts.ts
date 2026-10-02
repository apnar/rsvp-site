import { ORPCError } from "@orpc/server";
import { findOrCreatePeople, parseAddresses } from "@rsvp-site/db/people";
import { isAdmin } from "@rsvp-site/db/roles";
import { user } from "@rsvp-site/db/schema/auth";
import { contactGroup, contactGroupMember } from "@rsvp-site/db/schema/contact";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { hostProcedure } from "../index";

const groupInput = z.object({ groupId: z.string().min(1) });
const nameSchema = z.string().trim().min(1, "Name it.").max(80);

/**
 * A group the caller may touch: their own, or anybody's for an admin. A
 * stranger's group is "no such group", the same as a wrong id.
 */
async function ownGroup(
	context: Pick<Context, "db"> & { me: { id: string; role: string } },
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

/**
 * A host's own named lists of people. Private: other hosts never see them,
 * because a host's address book is not the site's.
 */
export const contactsRouter = {
	/** The caller's groups, each with its members. */
	list: hostProcedure.handler(async ({ context }) => {
		const groups = await context.db
			.select()
			.from(contactGroup)
			.where(eq(contactGroup.ownerId, context.me.id))
			.orderBy(asc(contactGroup.name))
			.all();
		const members = groups.length
			? await context.db
					.select({
						groupId: contactGroupMember.groupId,
						userId: user.id,
						name: user.name,
						email: user.email,
						unsubscribed: user.unsubscribedAt,
					})
					.from(contactGroupMember)
					.innerJoin(user, eq(user.id, contactGroupMember.userId))
					.where(
						inArray(
							contactGroupMember.groupId,
							groups.map((g) => g.id),
						),
					)
					.orderBy(asc(user.name))
					.all()
			: [];
		return groups.map((g) => ({
			id: g.id,
			name: g.name,
			members: members
				.filter((m) => m.groupId === g.id)
				.map(({ groupId: _, unsubscribed, ...m }) => ({
					...m,
					unsubscribed: unsubscribed !== null,
				})),
		}));
	}),

	create: hostProcedure
		.input(
			z.object({
				name: nameSchema,
				emails: z.string().max(20_000).default(""),
			}),
		)
		.handler(async ({ context, input }) => {
			const id = crypto.randomUUID();
			await context.db
				.insert(contactGroup)
				.values({ id, ownerId: context.me.id, name: input.name });
			const added = await addMembers(context, id, input.emails);
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

	/** Delete a group. Its people stay on any event they were added to. */
	remove: hostProcedure
		.input(groupInput)
		.handler(async ({ context, input }) => {
			const row = await ownGroup(context, input.groupId);
			await context.db.delete(contactGroup).where(eq(contactGroup.id, row.id));
			return { ok: true };
		}),

	addMembers: hostProcedure
		.input(groupInput.extend({ emails: z.string().min(1).max(20_000) }))
		.handler(async ({ context, input }) => {
			const row = await ownGroup(context, input.groupId);
			return { added: await addMembers(context, row.id, input.emails) };
		}),

	removeMember: hostProcedure
		.input(groupInput.extend({ userId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const row = await ownGroup(context, input.groupId);
			await context.db
				.delete(contactGroupMember)
				.where(
					and(
						eq(contactGroupMember.groupId, row.id),
						eq(contactGroupMember.userId, input.userId),
					),
				);
			return { ok: true };
		}),
};

async function addMembers(
	context: Pick<Context, "db">,
	groupId: string,
	raw: string,
): Promise<number> {
	const emails = parseAddresses(raw);
	if (emails.length > 500) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Add them 500 at a time.",
		});
	}
	const people = (await findOrCreatePeople(context.db, emails, "host")).filter(
		(p) => p.status !== "deactivated",
	);
	let added = 0;
	for (let i = 0; i < people.length; i += 30) {
		const rows = await context.db
			.insert(contactGroupMember)
			.values(people.slice(i, i + 30).map((p) => ({ groupId, userId: p.id })))
			.onConflictDoNothing()
			.returning({ userId: contactGroupMember.userId })
			.all();
		added += rows.length;
	}
	return added;
}
