import { ORPCError } from "@orpc/server";
import type { Db } from "@rsvp-site/db";
import { batchAll, insertChunks } from "@rsvp-site/db/batch";
import { listFamilies } from "@rsvp-site/db/families";
import { user } from "@rsvp-site/db/schema/auth";
import { family, familyMember } from "@rsvp-site/db/schema/family";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../index";
import { idSchema } from "../inputs";
import { typedPeople } from "../typed-people";

const familyInput = z.object({ familyId: idSchema });
const nameSchema = z.string().trim().min(1, "Name it.").max(80);

async function requireFamily(db: Db, familyId: string) {
	const row = await db
		.select()
		.from(family)
		.where(eq(family.id, familyId))
		.get();
	if (!row) throw new ORPCError("NOT_FOUND", { message: "No such family." });
	return row;
}

/**
 * Households, kept by admins. A family decides who may answer for whom,
 * so no host edits one; `shared` is what lets hosts add it to their lists.
 */
export const familiesRouter = {
	/** Every family, with its members. */
	list: adminProcedure.handler(({ context }) =>
		listFamilies(context.db, { onlyShared: false }),
	),

	create: adminProcedure
		.input(z.object({ name: nameSchema, shared: z.boolean().default(false) }))
		.handler(async ({ context, input }) => {
			const id = crypto.randomUUID();
			await context.db
				.insert(family)
				.values({ id, name: input.name, shared: input.shared });
			return { id };
		}),

	rename: adminProcedure
		.input(familyInput.extend({ name: nameSchema }))
		.handler(async ({ context, input }) => {
			const row = await requireFamily(context.db, input.familyId);
			await context.db
				.update(family)
				.set({ name: input.name })
				.where(eq(family.id, row.id));
			return { ok: true };
		}),

	setShared: adminProcedure
		.input(familyInput.extend({ shared: z.boolean() }))
		.handler(async ({ context, input }) => {
			const row = await requireFamily(context.db, input.familyId);
			await context.db
				.update(family)
				.set({ shared: input.shared })
				.where(eq(family.id, row.id));
			return { ok: true };
		}),

	/** Delete a family. Its people stay, and so do their invitations. */
	remove: adminProcedure
		.input(familyInput)
		.handler(async ({ context, input }) => {
			const row = await requireFamily(context.db, input.familyId);
			await context.db.delete(family).where(eq(family.id, row.id));
			return { ok: true };
		}),

	/**
	 * Put people in a family: existing people by id, and typed lines --
	 * an address, or a bare name for somebody with none (a small child).
	 * Somebody already in another family is not moved; they come back in
	 * `elsewhere`, so moving them is a deliberate remove and add.
	 */
	addMembers: adminProcedure
		.input(
			familyInput.extend({
				userIds: z.array(idSchema).max(100).default([]),
				lines: z.string().max(20_000).default(""),
				child: z.boolean().default(false),
			}),
		)
		.handler(async ({ context, input }) => {
			const row = await requireFamily(context.db, input.familyId);
			const [typed, picked] = await Promise.all([
				typedPeople(context.db, input.lines, {
					source: "admin",
					by: { id: context.me.id, host: false },
					keepName: () => true,
					cap: {
						max: 100,
						extra: input.userIds.length,
						message: () => "That's a lot of family. Add them 100 at a time.",
					},
				}),
				input.userIds.length
					? context.db
							.select({ id: user.id, status: user.status })
							.from(user)
							.where(inArray(user.id, input.userIds))
							.all()
					: [],
			]);
			const ids = [
				...new Set([
					...typed.ids,
					...picked.filter((p) => p.status !== "deactivated").map((p) => p.id),
				]),
			];
			// One batch; the PK on user_id is what keeps a person in one family.
			const inserted = await batchAll(
				context.db,
				insertChunks(
					familyMember,
					ids.map((userId) => ({
						userId,
						familyId: row.id,
						child: input.child,
					})),
				).map((slice) =>
					context.db
						.insert(familyMember)
						.values(slice)
						.onConflictDoNothing()
						.returning({ userId: familyMember.userId }),
				),
			);
			const landed = new Set(inserted.flat().map((r) => r.userId));
			const missed = ids.filter((id) => !landed.has(id));
			const elsewhere = missed.length
				? await context.db
						.select({
							familyId: family.id,
							name: user.name,
							familyName: family.name,
						})
						.from(familyMember)
						.innerJoin(family, eq(family.id, familyMember.familyId))
						.innerJoin(user, eq(user.id, familyMember.userId))
						.where(inArray(familyMember.userId, missed))
						.all()
				: [];
			return {
				added: landed.size,
				// Already in this family is not news; another one is.
				elsewhere: elsewhere
					.filter((e) => e.familyId !== row.id)
					.map(({ name, familyName }) => ({ name, familyName })),
				invalid: Boolean(input.lines.trim()) && typed.lineCount === 0,
			};
		}),

	removeMember: adminProcedure
		.input(familyInput.extend({ userId: idSchema }))
		.handler(async ({ context, input }) => {
			await context.db
				.delete(familyMember)
				.where(
					and(
						eq(familyMember.familyId, input.familyId),
						eq(familyMember.userId, input.userId),
					),
				);
			return { ok: true };
		}),

	/** A child counts as a kid when a relative answers for them. */
	setChild: adminProcedure
		.input(familyInput.extend({ userId: idSchema, child: z.boolean() }))
		.handler(async ({ context, input }) => {
			await context.db
				.update(familyMember)
				.set({ child: input.child })
				.where(
					and(
						eq(familyMember.familyId, input.familyId),
						eq(familyMember.userId, input.userId),
					),
				);
			return { ok: true };
		}),
};
