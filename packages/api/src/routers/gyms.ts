import { ORPCError } from "@orpc/server";
import { game } from "@rsvp-site/db/schema/game";
import { gym } from "@rsvp-site/db/schema/gym";
import { permit, permitGym } from "@rsvp-site/db/schema/permit";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { isUniqueViolation } from "../db-errors";
import { adminProcedure } from "../index";

const gymInput = z.object({
	name: z.string().trim().min(1, "What is it called?").max(80),
	address: z
		.string()
		.trim()
		.min(1, "The whole address. People are driving there.")
		.max(200),
	notes: z.string().trim().max(500).nullable().optional(),
});

export const gymsRouter = {
	/**
	 * Every venue, alphabetical, with the permits that cover it and when it
	 * was last booked. The booking form reads `lastBookedAt` to pick its
	 * default, so this is the one query behind the whole Gyms tab.
	 */
	list: adminProcedure.handler(async ({ context }) => {
		// Join and aggregate rather than two correlated subqueries: drizzle
		// only writes table-qualified column names when a query has a join, so
		// `where ${game.gymId} = ${gym.id}` in a subquery off a lone `from gym`
		// comes out as `where "gym_id" = "id"` -- both read as columns of the
		// subquery's own table, and every gym counts zero games.
		const gyms = await context.db
			.select({
				id: gym.id,
				name: gym.name,
				address: gym.address,
				notes: gym.notes,
				createdAt: gym.createdAt,
				gameCount: sql<number>`count(${game.id})`,
				/** When a game here was last booked -- not when it was played. */
				lastBookedAt: sql<number | null>`max(${game.createdAt})`,
			})
			.from(gym)
			.leftJoin(game, eq(game.gymId, gym.id))
			.groupBy(gym.id)
			.orderBy(asc(gym.name))
			.all();

		const coverage = await context.db
			.select({
				gymId: permitGym.gymId,
				id: permit.id,
				label: permit.label,
				fileName: permit.fileName,
			})
			.from(permitGym)
			.innerJoin(permit, eq(permitGym.permitId, permit.id))
			.orderBy(asc(permit.label))
			.all();

		return gyms.map((row) => ({
			...row,
			lastBookedAt: row.lastBookedAt ? new Date(row.lastBookedAt) : null,
			permits: coverage
				.filter((c) => c.gymId === row.id)
				.map(({ gymId: _gymId, ...p }) => p),
		}));
	}),

	create: adminProcedure.input(gymInput).handler(async ({ context, input }) => {
		const id = crypto.randomUUID();
		try {
			await context.db.insert(gym).values({
				id,
				name: input.name,
				address: input.address,
				notes: input.notes || null,
				createdBy: context.session.user.id,
			});
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ORPCError("CONFLICT", {
					message: "There is already a venue by that name.",
				});
			}
			throw error;
		}
		return { id };
	}),

	update: adminProcedure
		.input(gymInput.partial().extend({ id: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const { id, ...changes } = input;
			try {
				const result = await context.db
					.update(gym)
					.set({
						...(changes.name !== undefined && { name: changes.name }),
						...(changes.address !== undefined && { address: changes.address }),
						...(changes.notes !== undefined && {
							notes: changes.notes || null,
						}),
					})
					.where(eq(gym.id, id))
					.run();
				if (result.meta.changes === 0) {
					throw new ORPCError("NOT_FOUND", { message: "No such venue." });
				}
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new ORPCError("CONFLICT", {
						message: "There is already a venue by that name.",
					});
				}
				throw error;
			}
			return { id };
		}),

	/**
	 * Only while nothing is booked there. The FK says `restrict`, but D1 would
	 * answer that with a constraint error, and "you have three games there"
	 * is the sentence an admin can actually act on. Permit coverage is not in
	 * the way: those rows are paperwork and go with it.
	 */
	remove: adminProcedure
		.input(z.object({ id: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const booked = await context.db
				.select({ count: sql<number>`count(*)` })
				.from(game)
				.where(eq(game.gymId, input.id))
				.get();
			if (booked && booked.count > 0) {
				throw new ORPCError("CONFLICT", {
					message:
						booked.count === 1
							? "An event is booked there. Delete or move it first."
							: `${booked.count} events are booked there. Delete or move them first.`,
				});
			}
			await context.db.delete(gym).where(eq(gym.id, input.id));
			return { ok: true };
		}),
};
