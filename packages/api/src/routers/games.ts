import { ORPCError } from "@orpc/server";
import { game } from "@rsvp-site/db/schema/game";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isUniqueViolation } from "../db-errors";
import { findGame, findNextGame, listGames } from "../games";
import { adminProcedure, protectedProcedure } from "../index";

const dateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.");
const timeSchema = z
	.string()
	.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM.");

const gameInput = z.object({
	date: dateSchema,
	startTime: timeSchema,
	endTime: timeSchema.nullable().optional(),
	gymId: z.string().min(1, "Pick a venue."),
	notes: z.string().trim().max(300).nullable().optional(),
	permitId: z.string().min(1).nullable().optional(),
});

export const gamesRouter = {
	/**
	 * The next game on or after today, or null when no venue is booked. Guests
	 * only: where and when the event is stays off the marketing site.
	 */
	next: protectedProcedure.handler(({ context }) => findNextGame(context.db)),

	/** Upcoming games plus a few recent ones, for the schedule page. */
	list: protectedProcedure.handler(({ context }) => listGames(context.db)),

	create: adminProcedure
		.input(gameInput)
		.handler(async ({ context, input }) => {
			const id = crypto.randomUUID();
			try {
				await context.db.insert(game).values({
					id,
					date: input.date,
					startTime: input.startTime,
					endTime: input.endTime ?? null,
					gymId: input.gymId,
					notes: input.notes || null,
					permitId: input.permitId ?? null,
					createdBy: context.session.user.id,
				});
			} catch (error) {
				if (isUniqueViolation(error)) {
					throw new ORPCError("CONFLICT", {
						message: "There is already an event at that date and time.",
					});
				}
				throw error;
			}
			return findGame(context.db, id);
		}),

	update: adminProcedure
		.input(gameInput.partial().extend({ id: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const { id, ...changes } = input;
			const existing = await findGame(context.db, id);
			if (!existing) {
				throw new ORPCError("NOT_FOUND", { message: "No such event." });
			}
			await context.db
				.update(game)
				.set({
					...(changes.date !== undefined && { date: changes.date }),
					...(changes.startTime !== undefined && {
						startTime: changes.startTime,
					}),
					...(changes.endTime !== undefined && {
						endTime: changes.endTime ?? null,
					}),
					...(changes.gymId !== undefined && { gymId: changes.gymId }),
					...(changes.notes !== undefined && { notes: changes.notes || null }),
					...(changes.permitId !== undefined && {
						permitId: changes.permitId ?? null,
					}),
				})
				.where(eq(game.id, id));
			return findGame(context.db, id);
		}),

	remove: adminProcedure
		.input(z.object({ id: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			await context.db.delete(game).where(eq(game.id, input.id));
			return { ok: true };
		}),
};
