import { waitUntil } from "cloudflare:workers";
import { ORPCError } from "@orpc/server";
import { createAuth } from "@rsvp-site/auth";
import type { Db } from "@rsvp-site/db";
import { logError } from "@rsvp-site/db/errors";
import { splitName } from "@rsvp-site/db/names";
import {
	findOrCreatePeople,
	findPerson,
	findReachablePersonByEmail,
	listPeople,
} from "@rsvp-site/db/people";
import { normalizePhone, textablePhone } from "@rsvp-site/db/phone";
import { ROLES } from "@rsvp-site/db/schema/auth";
import { eventGuest, eventHost } from "@rsvp-site/db/schema/event";
import { deactivate, reactivate, setRole } from "@rsvp-site/db/status";
import { rotateLinkToken } from "@rsvp-site/db/tokens";
import { getMailer } from "@rsvp-site/email/worker";
import { count } from "drizzle-orm";
import { z } from "zod";

import { removePicture, setPicture } from "../avatar";
import { detailsPatch, saveDetails, saveEmail } from "../details";
import { erasePerson, removalPlan } from "../endings";
import { adminProcedure, publicProcedure } from "../index";
import { emailSchema, idSchema } from "../inputs";
import { callerIp, requireUnderLimit } from "../limits";
import { sendWelcome } from "../mail";
import { avatarFile } from "../media";
import { textSignIn } from "../texting";

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
				[{ email: input.email, ...splitName(input.name ?? "") }],
				"admin",
				{ id: context.me.id, host: false },
			);
			if (!person) {
				throw new ORPCError("BAD_REQUEST", { message: "No address given." });
			}
			if (person.status === "deactivated") {
				throw new ORPCError("BAD_REQUEST", {
					message: "They are deactivated. Reactivate them first.",
				});
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

	/** Change any of somebody's details, signed in or not. */
	update: adminProcedure
		.input(detailsPatch.extend({ userId: idSchema }))
		.handler(async ({ context, input }) => {
			const { userId, ...patch } = input;
			await requirePerson(context.db, userId);
			await saveDetails(context.db, userId, patch, null);
			return { ok: true };
		}),

	/** Put up somebody's picture for them, cropped in the admin's browser. */
	setPicture: adminProcedure
		.input(z.object({ userId: idSchema, file: avatarFile }))
		.handler(async ({ context, input }) => {
			await requirePerson(context.db, input.userId);
			return setPicture(
				context.db,
				context.env,
				input.userId,
				input.file,
				context.me.id,
			);
		}),

	removePicture: adminProcedure
		.input(z.object({ userId: idSchema }))
		.handler(async ({ context, input }) => {
			await requirePerson(context.db, input.userId);
			return removePicture(context.db, context.env, input.userId);
		}),

	/**
	 * Change somebody's address. An address that is already somebody else's
	 * is refused: merging two people is done by hand, not guessed at.
	 */
	setEmail: adminProcedure
		.input(z.object({ userId: idSchema, email: emailSchema }))
		.handler(async ({ context, input }) => {
			await requirePerson(context.db, input.userId);
			const outcome = await saveEmail(
				context.db,
				input.userId,
				input.email,
				null,
			);
			if (outcome === "taken") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Somebody else already has that address.",
				});
			}
			return { ok: true };
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

	/**
	 * What deleting somebody would do to the events they own, for the
	 * confirmation: which pass to a co-host, which go with them, and which
	 * stop it because guests are still expecting them.
	 */
	removal: adminProcedure
		.input(z.object({ userId: idSchema }))
		.handler(async ({ context, input }) => {
			await requirePerson(context.db, input.userId);
			const plan = await removalPlan(context.db, input.userId);
			return {
				handOff: plan.handOff.map((h) => ({
					title: h.event.title,
					to: h.to.name,
				})),
				erase: plan.erase.map((e) => e.title),
				blocking: plan.blocking.map((e) => e.title),
			};
		}),

	/**
	 * Gone for good, unlike a deactivation: their invitations, answers, address
	 * books and sessions go with the row, so they can be added again later as
	 * a stranger. Their events are handed off or erased as `removal` says.
	 */
	remove: adminProcedure
		.input(z.object({ userId: idSchema }))
		.handler(async ({ context, input }) => {
			if (input.userId === context.me.id) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Find another admin to do that to you.",
				});
			}
			await requirePerson(context.db, input.userId);
			// Planned again here rather than trusted from the preview: an event
			// may have gone out, or a co-host left, since it was shown.
			const plan = await removalPlan(context.db, input.userId);
			if (plan.blocking.length > 0) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Guests are still expecting ${plan.blocking.map((e) => e.title).join(", ")}. Cancel it or add a co-host first.`,
				});
			}
			await erasePerson(context.db, context.env, input.userId, plan);
			return { handedOff: plan.handOff.length, erased: plan.erase.length };
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
	 * "Text me my link", the same door by phone: the same answer whether or
	 * not the number is ours, the same per-caller limit, and a ten-minute
	 * cooldown per number (`textSignIn`), since every text costs money and
	 * lands on somebody's lock screen.
	 */
	requestTextLink: publicProcedure
		.input(z.object({ phone: z.string().trim().max(40) }))
		.handler(async ({ context, input }) => {
			const phone = textablePhone(normalizePhone(input.phone));
			if (!phone) {
				throw new ORPCError("BAD_REQUEST", {
					message: "That doesn't look like a US mobile number.",
				});
			}
			await requireUnderLimit(
				context.env.AUTH_LIMITER,
				`request-link:${callerIp(context.headers)}`,
			);
			const db = context.db;
			waitUntil(
				textSignIn(db, phone).catch((error) =>
					logError("sign-in text failed", error),
				),
			);
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
			await requireUnderLimit(
				context.env.AUTH_LIMITER,
				`request-link:${callerIp(context.headers)}`,
			);
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
						(error) => logError("sign-in link send failed", error),
					),
				);
			}
			return { ok: true };
		}),
};
