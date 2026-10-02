import { ORPCError } from "@orpc/server";
import { createAuth } from "@rsvp-site/auth";
import { APIError } from "@rsvp-site/auth/errors";
import {
	deactivate,
	effectiveStatus,
	findPersonState,
	findReachablePersonByEmail,
	listPeople,
	notDeactivated,
	reactivate,
	suspend,
	unsuspend,
} from "@rsvp-site/db/people";
import { user } from "@rsvp-site/db/schema/auth";
import { game } from "@rsvp-site/db/schema/game";
import { rsvp } from "@rsvp-site/db/schema/rsvp";
import { getMailer } from "@rsvp-site/email/worker";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { adminProcedure, protectedProcedure, publicProcedure } from "../index";
import { readResponseRates } from "../invites";
import { sendWelcome } from "../mail";
import { NO_RESPONSES } from "../responses";
import { formatGameDate, isAdmin, todayInRunTimezone } from "../run";

const emailSchema = z.email("That is not an email address.").max(254);
const nameSchema = z.string().trim().max(40, "Shorter name, please.");
/** Short on purpose: this is "travelling, back in a month", not a letter. */
const reasonSchema = z.string().trim().max(200, "Keep it short.").optional();

const suspendInput = z.object({
	userId: z.string().min(1).optional(),
	reason: reasonSchema,
	/** Milliseconds since the epoch. Absent means "until they say otherwise". */
	until: z.number().int().positive().optional(),
});

/**
 * Resolve who a self-or-admin action is aimed at. Acting on yourself is
 * always allowed; acting on anybody else is an admin's business.
 */
function targetOf(context: Context, userId: string | undefined): string {
	const me = context.session?.user;
	if (!me) throw new ORPCError("UNAUTHORIZED");
	if (!userId || userId === me.id) return me.id;
	if (!isAdmin(me)) {
		throw new ORPCError("FORBIDDEN", {
			message: "That is not your account to pause.",
		});
	}
	return userId;
}

async function requirePerson(db: Context["db"], userId: string) {
	const state = await findPersonState(db, userId);
	if (!state)
		throw new ORPCError("NOT_FOUND", { message: "Nobody by that id." });
	return state;
}

/**
 * Everybody who plays. One table, one status: the mailing list and the roster
 * are the same list of people, and stepping away is a state on it rather than
 * a row in some other table.
 */
export const peopleRouter = {
	/** The caller's own status, for the dashboard and the RSVP board. */
	me: protectedProcedure.handler(async ({ context }) => {
		const state = await requirePerson(context.db, context.session.user.id);
		return {
			status: effectiveStatus(state),
			suspendedUntil: state.suspendedUntil,
			reason: state.statusReason,
		};
	}),

	/**
	 * Step away for a while. Self-service, or an admin doing it for somebody
	 * who phoned it in. Never touches a deactivated account.
	 */
	suspend: protectedProcedure
		.input(suspendInput)
		.handler(async ({ context, input }) => {
			const userId = targetOf(context, input.userId);
			const state = await requirePerson(context.db, userId);
			if (state.status === "deactivated") {
				throw new ORPCError("BAD_REQUEST", {
					message: "That account is deactivated. Reactivate it first.",
				});
			}
			await suspend(context.db, {
				userId,
				reason: input.reason,
				until: input.until ? new Date(input.until) : null,
				by: userId === context.session.user.id ? "self" : "admin",
			});
			return { ok: true };
		}),

	/** Back on the list. Lifts a suspension only; a ban needs an admin. */
	unsuspend: protectedProcedure
		.input(z.object({ userId: z.string().min(1).optional() }))
		.handler(async ({ context, input }) => {
			const userId = targetOf(context, input.userId);
			const state = await requirePerson(context.db, userId);
			if (state.status === "deactivated") {
				throw new ORPCError("FORBIDDEN", {
					message:
						"That account is deactivated. An admin has to reactivate it.",
				});
			}
			await unsuspend(context.db, userId);
			// They may be on Brevo's blocklist from a webhook drop; without this
			// they would be "active" and quietly undeliverable. Their address,
			// not the caller's -- an admin can do this for somebody else.
			await getMailer().unblock(state.email);
			return { ok: true };
		}),

	/**
	 * Everybody, with the record of how they have answered the last few calls
	 * to play hung off each row. Admin only, like the rest of `list`: how
	 * often a man ignores his email is not something the roster page tells
	 * the other guests about him.
	 */
	list: adminProcedure.handler(async ({ context }) => {
		const [people, rates] = await Promise.all([
			listPeople(context.db),
			readResponseRates(context.db),
		]);
		return people.map((person) => ({
			...person,
			responses: rates.get(person.id) ?? NO_RESPONSES,
		}));
	}),

	/**
	 * The roster, for guests rather than admins: who is in the group and how
	 * many events they have actually turned up for. Deliberately thinner than
	 * `list` -- no addresses, no tokens, no reason for somebody's break -- so
	 * that being a guest does not hand you the mailing list.
	 *
	 * Attendance is counted from `rsvp` rows the person claimed as themselves
	 * (`user_id`), still marked In, on a game that has already happened. A name
	 * typed in as a guest has no `user_id` and belongs to nobody, which is
	 * the honest answer: we know somebody came, not who.
	 */
	roster: protectedProcedure.handler(async ({ context }) => {
		const today = todayInRunTimezone();
		const rows = await context.db
			.select({
				id: user.id,
				name: user.name,
				role: user.role,
				status: user.status,
				suspendedUntil: user.suspendedUntil,
				createdAt: user.createdAt,
				// count(game.id), not count(rsvp.id): the second join is what
				// filters out games that have not been played yet, and a row
				// counted off `rsvp` would keep the ones it dropped.
				games: sql<number>`count(${game.id})`,
				lastPlayed: sql<string | null>`max(${game.date})`,
			})
			.from(user)
			.leftJoin(rsvp, and(eq(rsvp.userId, user.id), eq(rsvp.response, "in")))
			.leftJoin(game, and(eq(game.id, rsvp.gameId), lt(game.date, today)))
			.where(notDeactivated())
			.groupBy(user.id)
			// Ranked by attendance, as the page has always claimed.
			.orderBy(desc(sql`count(${game.id})`), asc(user.createdAt))
			.all();

		const meId = context.session.user.id;
		return rows.map((row, index) => ({
			id: row.id,
			num: String(index + 1).padStart(2, "0"),
			name: row.name,
			isAdmin: row.role === "admin",
			isYou: row.id === meId,
			away: effectiveStatus(row) === "suspended",
			since: row.createdAt.getUTCFullYear(),
			games: row.games,
			lastPlayed: row.lastPlayed ? formatGameDate(row.lastPlayed) : null,
		}));
	}),

	/** Add somebody and email them their way in. Admin only. */
	add: adminProcedure
		.input(z.object({ email: emailSchema, name: nameSchema.optional() }))
		.handler(async ({ context, input }) => {
			const email = input.email.trim().toLowerCase();
			const name = input.name?.trim() || email.split("@")[0] || email;
			let userId: string;
			try {
				// The admin plugin lower-cases the address, rejects a duplicate and
				// applies the default role. Password is optional -- most guests
				// never set one -- and it sends no verification email, so nothing
				// races the welcome. The create hook stamps their tokens.
				const result = await createAuth().api.createUser({
					// `source` and `status` are left to their column defaults
					// ("admin", "active"), which is exactly this path. Better Auth
					// drops fields it does not know about, so setting them here
					// would look like it worked and quietly do nothing.
					body: { email, name, data: { emailVerified: false } },
					headers: context.headers,
				});
				userId = result.user.id;
			} catch (error) {
				if (error instanceof APIError) {
					throw new ORPCError("CONFLICT", {
						message: "That address is already on the list.",
					});
				}
				throw error;
			}
			await getMailer().unblock(email);
			const outcome = await sendWelcome(context.db, userId, { email, name });
			return {
				id: userId,
				emailed: outcome.ok,
				dryRun: getMailer().dryRun,
			};
		}),

	/** Send someone their sign-in link again. Admin only. */
	sendLink: adminProcedure
		.input(z.object({ userId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const people = await listPeople(context.db);
			const row = people.find((p) => p.id === input.userId);
			if (!row) {
				throw new ORPCError("NOT_FOUND", { message: "Nobody by that id." });
			}
			if (row.status === "deactivated") {
				throw new ORPCError("BAD_REQUEST", {
					message: "They are deactivated. Reactivate them first.",
				});
			}
			const outcome = await sendWelcome(context.db, row.id, row);
			if (!outcome.ok) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: `Brevo said no: ${outcome.error}`,
				});
			}
			return { ok: true, dryRun: getMailer().dryRun };
		}),

	/**
	 * Out of the group: no email of any kind, no way in, every session killed.
	 * Admin only, and the only thing that sets Better Auth's `banned`, which is
	 * what closes the password door.
	 */
	deactivate: adminProcedure
		.input(z.object({ userId: z.string().min(1), reason: reasonSchema }))
		.handler(async ({ context, input }) => {
			if (input.userId === context.session.user.id) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Find another admin to do that to you.",
				});
			}
			await requirePerson(context.db, input.userId);
			await deactivate(context.db, input);
			await createAuth().api.revokeUserSessions({
				body: { userId: input.userId },
				headers: context.headers,
			});
			return { ok: true };
		}),

	/** Undo a deactivation. Admin only; the only path that clears `banned`. */
	reactivate: adminProcedure
		.input(z.object({ userId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const state = await requirePerson(context.db, input.userId);
			if (state.status !== "deactivated") {
				throw new ORPCError("BAD_REQUEST", {
					message: "They are not deactivated.",
				});
			}
			await reactivate(context.db, input.userId);
			return { ok: true };
		}),

	/**
	 * "Email me my link" from the login page. Says the same thing whether or
	 * not the address is one of ours, and refuses to be a mail cannon. Serves
	 * suspended people too: mailing themselves a link is how they come back.
	 */
	requestLink: publicProcedure
		.input(z.object({ email: emailSchema }))
		.handler(async ({ context, input }) => {
			const row = await findReachablePersonByEmail(context.db, input.email);
			const cooledOff =
				!row?.linkSentAt || Date.now() - row.linkSentAt.getTime() > 10 * 60_000;
			if (row && cooledOff) {
				await sendWelcome(context.db, row.id, {
					email: input.email,
					name: null,
				});
			}
			return { ok: true };
		}),
};
