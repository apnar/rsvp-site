import { ORPCError } from "@orpc/server";
import {
	effectiveStatus,
	findPersonState,
	listRecipients,
} from "@rsvp-site/db/people";
import { user } from "@rsvp-site/db/schema/auth";
import { RSVP_RESPONSES, rsvp } from "@rsvp-site/db/schema/rsvp";
import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import { guestSuggestions, splitAudience } from "../audience";
import type { Context } from "../context";
import { CONFIRM_AT, PLAY_AT } from "../cycle";
import { findGame, findNextGame, type GameSummary } from "../games";
import { protectedProcedure } from "../index";
import { confirmIfReady } from "../jobs/rsvp-cycle";
import { CAPACITY, isAdmin, nameKeyOf } from "../run";

const nameSchema = z
	.string()
	.trim()
	.min(1, "Put a name in.")
	.max(40, "That is not a name, that is a paragraph.");

const answerSchema = z.enum(RSVP_RESPONSES);

async function listGame(
	db: Context["db"],
	game: GameSummary,
	userId: string | null,
) {
	const rows = await db
		.select({
			id: rsvp.id,
			name: rsvp.name,
			nameKey: rsvp.nameKey,
			response: rsvp.response,
			userId: rsvp.userId,
			addedBy: rsvp.addedBy,
			addedByName: user.name,
		})
		.from(rsvp)
		// Left, not inner: `added_by` is null on every row that predates the
		// column, and those names still have to appear on the sheet.
		.leftJoin(user, eq(rsvp.addedBy, user.id))
		.where(eq(rsvp.gameId, game.id))
		.orderBy(asc(rsvp.createdAt));

	// Asked of D1, not of `session.user`: the session cookie caches the user
	// for five minutes, and a stale copy here would leave somebody who just
	// stepped away still able to take a spot.
	const state = userId ? await findPersonState(db, userId) : null;

	// Who has not said a word. Only the server can work this out -- the client
	// never sees a user id -- and it is the number the 2 PM prod is about.
	const active = await listRecipients(db, "active");
	const split = splitAudience(
		rows.map((r) => ({
			name: r.name,
			nameKey: r.nameKey,
			userId: r.userId,
			addedBy: r.addedBy,
			response: r.response,
		})),
		active.map((p) => ({ id: p.id, name: p.name ?? "" })),
	);

	// Who this person has brought before. Their own history only, and never a
	// name that is already on tonight's sheet -- the box would just refuse it.
	const brought = userId
		? await db
				.select({ name: rsvp.name, nameKey: rsvp.nameKey })
				.from(rsvp)
				.where(
					and(
						eq(rsvp.addedBy, userId),
						isNull(rsvp.userId),
						ne(rsvp.gameId, game.id),
					),
				)
				.orderBy(desc(rsvp.createdAt))
				.limit(40)
		: [];

	return {
		game,
		capacity: CAPACITY,
		confirmAt: CONFIRM_AT,
		playAt: PLAY_AT,
		/** The caller's own row, so the board can mark it "you". */
		me: (userId && rows.find((r) => r.userId === userId)?.id) || null,
		/** The caller's own state, so the board knows which button to show. */
		viewer: state
			? {
					status: effectiveStatus(state),
					suspendedUntil: state.suspendedUntil,
					reason: state.statusReason,
				}
			: null,
		counts: {
			in: split.yes,
			maybe: split.maybe,
			out: split.out,
			silent: split.silent,
		},
		silentNames: split.silentNames,
		/** Names to offer back in the guest box, most recently brought first. */
		guestSuggestions: guestSuggestions(
			brought,
			rows.map((r) => r.nameKey),
			6,
		),
		/**
		 * The instant this payload was built. The countdown seeds its clock
		 * from this so the server render and the first client render agree;
		 * see apps/web/src/hooks/use-countdown.ts.
		 */
		now: new Date().toISOString(),
		rsvps: rows.map((r) => ({
			id: r.id,
			name: r.name,
			response: r.response,
			/** Whether the caller is allowed to change this one. */
			mine: canSet(r, userId, false),
			/** Somebody with no account, whom another guest is vouching for. */
			guest: r.userId === null,
			/**
			 * Who put them on the sheet, so the room knows whose guest it is
			 * and who to ask when they do not turn up. Null on a member's own
			 * row and on guest rows that predate the column.
			 */
			addedByName: r.userId === null ? r.addedByName : null,
		})),
	};
}

export type Headcount = Awaited<ReturnType<typeof listGame>>;

/**
 * Whose answer is whose. You answer for yourself and for guests you put on
 * the sheet; an admin answers for anybody. Another guest's row is theirs.
 *
 * A guest row with no `addedBy` predates the column, so nobody owns it and
 * anybody may sort it out.
 */
function canSet(
	row: { userId: string | null; addedBy: string | null },
	userId: string | null,
	admin: boolean,
): boolean {
	if (admin) return true;
	if (!userId) return false;
	if (row.userId === userId) return true;
	if (row.userId === null)
		return row.addedBy === userId || row.addedBy === null;
	return false;
}

async function statusOf(db: Context["db"], userId: string) {
	const state = await findPersonState(db, userId);
	return state ? effectiveStatus(state) : "active";
}

/** Anybody deactivated is simply not here, cached session or not. */
async function requireHere(db: Context["db"], userId: string) {
	if ((await statusOf(db, userId)) === "deactivated") {
		throw new ORPCError("FORBIDDEN", {
			message: "That account is deactivated.",
		});
	}
}

async function requireSpot(db: Context["db"], userId: string) {
	const status = await statusOf(db, userId);
	if (status === "deactivated") {
		throw new ORPCError("FORBIDDEN", {
			message: "That account is deactivated.",
		});
	}
	if (status === "suspended") {
		throw new ORPCError("BAD_REQUEST", {
			message: "You're taking a break. Say you're back first.",
		});
	}
}

async function requireGame(db: Context["db"], id: string) {
	const game = await findGame(db, id);
	if (!game) {
		throw new ORPCError("NOT_FOUND", {
			message: "That event is not on the schedule.",
		});
	}
	if (game.status === "canceled") {
		throw new ORPCError("BAD_REQUEST", {
			message: "That event is off. Nothing to answer.",
		});
	}
	return game;
}

/** The whole payload, freshly counted, after a write. */
async function reread(context: Context, gameId: string, fallback: GameSummary) {
	return listGame(
		context.db,
		(await findGame(context.db, gameId)) ?? fallback,
		context.session?.user.id ?? null,
	);
}

export const rsvpRouter = {
	/** Headcount for a game; defaults to the next game. Null when nothing is booked. */
	list: protectedProcedure
		.input(z.object({ gameId: z.string().min(1).optional() }))
		.handler(async ({ context, input }) => {
			const game = input.gameId
				? await findGame(context.db, input.gameId)
				: await findNextGame(context.db);
			return game ? listGame(context.db, game, context.session.user.id) : null;
		}),

	/**
	 * Your own answer. What the buttons in every cycle email eventually call,
	 * and the only write on that path -- the email link lands on a page, and
	 * the page waits for a tap.
	 */
	respond: protectedProcedure
		.input(z.object({ gameId: z.string().min(1), answer: answerSchema }))
		.handler(async ({ context, input }) => {
			const game = await requireGame(context.db, input.gameId);
			const me = context.session.user;
			// Saying no never needs a spot; saying yes does.
			if (input.answer === "out") {
				await requireHere(context.db, me.id);
			} else {
				await requireSpot(context.db, me.id);
			}

			const mine = await context.db
				.select({ id: rsvp.id })
				.from(rsvp)
				.where(and(eq(rsvp.gameId, game.id), eq(rsvp.userId, me.id)))
				.get();

			if (mine) {
				await context.db
					.update(rsvp)
					.set({ response: input.answer })
					.where(eq(rsvp.id, mine.id));
			} else {
				// Somebody may have typed your name in already, back when the box
				// took any name. Claim it rather than colliding with the unique
				// index.
				const nameKey = nameKeyOf(me.name);
				const claimed = await context.db
					.select({ id: rsvp.id })
					.from(rsvp)
					.where(and(eq(rsvp.gameId, game.id), eq(rsvp.nameKey, nameKey)))
					.get();
				if (claimed) {
					await context.db
						.update(rsvp)
						.set({ response: input.answer, userId: me.id })
						.where(eq(rsvp.id, claimed.id));
				} else {
					await context.db.insert(rsvp).values({
						id: crypto.randomUUID(),
						gameId: game.id,
						name: me.name,
						nameKey,
						response: input.answer,
						userId: me.id,
						addedBy: me.id,
					});
				}
			}

			// The tenth yes turns the lights on immediately rather than at the
			// next cron pass. Awaited rather than deferred: nothing plumbs an
			// execution context to oRPC, and the cron would catch it anyway.
			await confirmIfReady(context.db, game.id);
			return reread(context, game.id, game);
		}),

	/**
	 * Put a guest's name in. They arrive In; that is what adding means.
	 *
	 * Guests only. Everybody on the list has their own buttons and their own
	 * emails, and typing a regular's name in for them takes the answer out of
	 * their hands -- it also marks them answered, so the 2 PM prod skips the
	 * one person who has not actually said anything.
	 */
	add: protectedProcedure
		.input(z.object({ gameId: z.string().min(1), name: nameSchema }))
		.handler(async ({ context, input }) => {
			const game = await requireGame(context.db, input.gameId);
			const me = context.session.user;
			await requireHere(context.db, me.id);

			const name = input.name.replace(/\s+/g, " ");
			const nameKey = nameKeyOf(name);

			// "everyone" rather than "active": somebody sitting a month out is
			// still on the roster, and dragging them back as a guest is not how
			// a break ends. An admin keeps the old behaviour -- somebody has to
			// be able to fix the sheet by hand.
			if (!isAdmin(me)) {
				const roster = await listRecipients(context.db, "everyone");
				// Their spelling, not whatever was typed into the box.
				const listed = roster.find((p) => nameKeyOf(p.name ?? "") === nameKey);
				if (listed) {
					throw new ORPCError("BAD_REQUEST", {
						message: `${listed.name} is on the list. They answer for themselves.`,
					});
				}
			}

			const existing = await context.db
				.select({ id: rsvp.id, userId: rsvp.userId, addedBy: rsvp.addedBy })
				.from(rsvp)
				.where(and(eq(rsvp.gameId, game.id), eq(rsvp.nameKey, nameKey)))
				.get();

			if (existing) {
				// Re-adding a name must not overwrite a deliberate answer that
				// is not yours to overwrite. Somebody who said Out stays Out
				// until they say otherwise -- otherwise a typo could push the
				// count to ten and fire the confirmation email.
				if (!canSet(existing, me.id, isAdmin(me))) {
					throw new ORPCError("FORBIDDEN", {
						message: `${name} answered for themselves. Leave it.`,
					});
				}
				await context.db
					.update(rsvp)
					.set({
						response: "in",
						...(existing.addedBy === null && { addedBy: me.id }),
					})
					.where(eq(rsvp.id, existing.id));
			} else {
				await context.db.insert(rsvp).values({
					id: crypto.randomUUID(),
					gameId: game.id,
					name,
					nameKey,
					response: "in",
					userId: null,
					addedBy: me.id,
				});
			}

			await confirmIfReady(context.db, game.id);
			return reread(context, game.id, game);
		}),

	/**
	 * Set one name's answer. Idempotent on purpose: the old toggle flipped a
	 * boolean, which has no meaning with three states and lands anywhere at
	 * all when two people tap the same card at once.
	 */
	setResponse: protectedProcedure
		.input(
			z.object({
				gameId: z.string().min(1),
				id: z.string().min(1),
				answer: answerSchema,
			}),
		)
		.handler(async ({ context, input }) => {
			const game = await requireGame(context.db, input.gameId);
			const me = context.session.user;
			await requireHere(context.db, me.id);

			const row = await context.db
				.select({
					id: rsvp.id,
					name: rsvp.name,
					userId: rsvp.userId,
					addedBy: rsvp.addedBy,
				})
				.from(rsvp)
				.where(and(eq(rsvp.id, input.id), eq(rsvp.gameId, game.id)))
				.get();
			if (!row) {
				throw new ORPCError("NOT_FOUND", {
					message: "That name is not on this event's sheet.",
				});
			}
			if (!canSet(row, me.id, isAdmin(me))) {
				throw new ORPCError("FORBIDDEN", {
					message: `That's ${row.name}'s to answer.`,
				});
			}
			if (row.userId === me.id && input.answer !== "out") {
				await requireSpot(context.db, me.id);
			}

			await context.db
				.update(rsvp)
				.set({ response: input.answer })
				.where(eq(rsvp.id, row.id));

			await confirmIfReady(context.db, game.id);
			return reread(context, game.id, game);
		}),

	/**
	 * Take a guest back off the sheet. Only a guest, and only yours.
	 *
	 * A member's row is never deleted by anybody -- an answer they gave is
	 * theirs to change, and "out" is how they say it. A guest has no way to
	 * say anything, so whoever vouched for them has to be able to undo it.
	 */
	removeGuest: protectedProcedure
		.input(z.object({ gameId: z.string().min(1), id: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const game = await requireGame(context.db, input.gameId);
			if (game.decidedAt) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Called at 7:31. The sheet is a record now.",
				});
			}
			const me = context.session.user;
			await requireHere(context.db, me.id);

			const row = await context.db
				.select({
					id: rsvp.id,
					name: rsvp.name,
					userId: rsvp.userId,
					addedBy: rsvp.addedBy,
				})
				.from(rsvp)
				.where(and(eq(rsvp.id, input.id), eq(rsvp.gameId, game.id)))
				.get();
			if (!row) {
				throw new ORPCError("NOT_FOUND", {
					message: "That name is not on this event's sheet.",
				});
			}
			if (row.userId !== null) {
				throw new ORPCError("FORBIDDEN", {
					message: `${row.name} is on the list. They take themselves off.`,
				});
			}
			if (!canSet(row, me.id, isAdmin(me))) {
				throw new ORPCError("FORBIDDEN", {
					message: `${row.name} is not yours to take off.`,
				});
			}

			await context.db.delete(rsvp).where(eq(rsvp.id, row.id));

			// No confirmIfReady: this can only lower the count, and stage 03
			// fires once and never un-fires.
			return reread(context, game.id, game);
		}),
};
