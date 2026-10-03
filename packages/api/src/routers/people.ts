import { waitUntil } from "cloudflare:workers";
import { ORPCError } from "@orpc/server";
import { createAuth } from "@rsvp-site/auth";
import type { Db } from "@rsvp-site/db";
import {
	deactivate,
	findOrCreatePeople,
	findPerson,
	findReachablePersonByEmail,
	listPeople,
	reactivate,
	rotateLinkToken,
	setRole,
} from "@rsvp-site/db/people";
import { ROLES, user } from "@rsvp-site/db/schema/auth";
import { eventGuest, eventHost } from "@rsvp-site/db/schema/event";
import { getMailer } from "@rsvp-site/email/worker";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, publicProcedure } from "../index";
import { emailSchema, idSchema } from "../inputs";
import { sendWelcome } from "../mail";

const nameSchema = z.string().trim().max(60, "Shorter name, please.");
const reasonSchema = z.string().trim().max(200, "Keep it short.").optional();

async function requirePerson(db: Db, userId: string) {
	const person = await findPerson(db, userId);
	if (!person) {
		throw new ORPCError("NOT_FOUND", { message: "Nobody by that id." });
	}
	return person;
}

/** Everybody, managed by admins: who they are, what they may do, whether they're in. */
export const peopleRouter = {
	/** Everybody, with how many events they host and are invited to. */
	list: adminProcedure.handler(async ({ context }) => {
		const [people, hosting, invited] = await Promise.all([
			listPeople(context.db),
			context.db
				.select({ userId: eventHost.userId, n: count() })
				.from(eventHost)
				.groupBy(eventHost.userId)
				.all(),
			context.db
				.select({ userId: eventGuest.userId, n: count() })
				.from(eventGuest)
				.groupBy(eventGuest.userId)
				.all(),
		]);
		const h = new Map(hosting.map((r) => [r.userId, r.n]));
		const g = new Map(invited.map((r) => [r.userId, r.n]));
		return people.map((p) => ({
			...p,
			hosting: h.get(p.id) ?? 0,
			invited: g.get(p.id) ?? 0,
		}));
	}),

	/**
	 * Add somebody by address, with a role, and email them their way in.
	 * An address already on the site is not an error: its role is set and a
	 * fresh link goes out, which is what an admin typing it in wanted.
	 */
	add: adminProcedure
		.input(
			z.object({
				email: emailSchema,
				name: nameSchema.optional(),
				role: z.enum(ROLES).default("user"),
			}),
		)
		.handler(async ({ context, input }) => {
			const [person] = await findOrCreatePeople(
				context.db,
				[input.email],
				"admin",
			);
			if (!person) {
				throw new ORPCError("BAD_REQUEST", { message: "No address given." });
			}
			if (person.status === "deactivated") {
				throw new ORPCError("BAD_REQUEST", {
					message: "They are deactivated. Reactivate them first.",
				});
			}
			if (person.created && input.name) {
				await context.db
					.update(user)
					.set({ name: input.name })
					.where(eq(user.id, person.id));
			}
			if (input.role !== "user" || person.created) {
				await setRole(context.db, person.id, input.role);
			}
			await getMailer().unblock(person.email);
			const outcome = await sendWelcome(context.db, person.id, {
				email: person.email,
				name: input.name || person.name,
			});
			return {
				id: person.id,
				created: person.created,
				emailed: outcome.ok,
				dryRun: getMailer().dryRun,
			};
		}),

	/**
	 * Make somebody a user, a host or an admin. Not yourself: the last admin
	 * demoting themselves would leave nobody able to undo it.
	 */
	setRole: adminProcedure
		.input(z.object({ userId: idSchema, role: z.enum(ROLES) }))
		.handler(async ({ context, input }) => {
			if (input.userId === context.me.id) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Ask another admin to change your own role.",
				});
			}
			await requirePerson(context.db, input.userId);
			await setRole(context.db, input.userId, input.role);
			return { ok: true };
		}),

	/** Send someone their sign-in link again. */
	sendLink: adminProcedure
		.input(z.object({ userId: idSchema }))
		.handler(async ({ context, input }) => {
			const person = await requirePerson(context.db, input.userId);
			if (person.status === "deactivated") {
				throw new ORPCError("BAD_REQUEST", {
					message: "They are deactivated. Reactivate them first.",
				});
			}
			const outcome = await sendWelcome(context.db, person.id, person);
			if (!outcome.ok) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: `Brevo said no: ${outcome.error}`,
				});
			}
			return { ok: true, dryRun: getMailer().dryRun };
		}),

	/**
	 * Replace somebody's sign-in token and end their sessions: every link
	 * already emailed to them stops working. For a leaked or forwarded
	 * email. They get back in with a new link (`sendLink`). Says nothing of
	 * the token itself.
	 */
	newLink: adminProcedure
		.input(z.object({ userId: idSchema }))
		.handler(async ({ context, input }) => {
			await requirePerson(context.db, input.userId);
			await rotateLinkToken(context.db, input.userId);
			await createAuth().api.revokeUserSessions({
				body: { userId: input.userId },
				headers: context.headers,
			});
			return { ok: true };
		}),

	/**
	 * Out: no email of any kind, no way in, every session killed. The only
	 * thing that sets Better Auth's `banned`, which closes the password door.
	 */
	deactivate: adminProcedure
		.input(z.object({ userId: idSchema, reason: reasonSchema }))
		.handler(async ({ context, input }) => {
			if (input.userId === context.me.id) {
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

	/** Undo a deactivation; the only path that clears `banned`. */
	reactivate: adminProcedure
		.input(z.object({ userId: idSchema }))
		.handler(async ({ context, input }) => {
			const person = await requirePerson(context.db, input.userId);
			if (person.status !== "deactivated") {
				throw new ORPCError("BAD_REQUEST", {
					message: "They are not deactivated.",
				});
			}
			await reactivate(context.db, input.userId);
			return { ok: true };
		}),

	/**
	 * "Email me my link" from the login page. Says the same thing whether or
	 * not the address is one of ours, and refuses to be a mail cannon: each
	 * address at most every ten minutes, and each caller a few tries a
	 * minute, or a script could walk the whole list.
	 */
	requestLink: publicProcedure
		.input(z.object({ email: emailSchema }))
		.handler(async ({ context, input }) => {
			const ip = context.headers.get("cf-connecting-ip") ?? "local";
			const { success } = await context.env.AUTH_LIMITER.limit({
				key: `request-link:${ip}`,
			});
			if (!success) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "Too many tries. Wait a minute and try again.",
				});
			}
			const row = await findReachablePersonByEmail(context.db, input.email);
			const cooledOff =
				!row?.linkSentAt || Date.now() - row.linkSentAt.getTime() > 10 * 60_000;
			if (row && cooledOff) {
				// In the background, so an address with an account doesn't answer
				// measurably slower than one without. Errors are logged, never
				// surfaced: the caller was told the same thing either way.
				const db = context.db;
				waitUntil(
					sendWelcome(db, row.id, { email: input.email, name: null }).catch(
						(error) => console.error("sign-in link send failed", error),
					),
				);
			}
			return { ok: true };
		}),
};
