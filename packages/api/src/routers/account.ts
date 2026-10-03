import { ORPCError } from "@orpc/server";
import { createAuth } from "@rsvp-site/auth";
import { APIError } from "@rsvp-site/auth/errors";
import { findPerson, resubscribe, unsubscribe } from "@rsvp-site/db/people";
import { account, user } from "@rsvp-site/db/schema/auth";
import { getMailer } from "@rsvp-site/email/worker";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { personProcedure, protectedProcedure } from "../index";

/**
 * Somebody's own account. Passwords are optional here: the emailed links are
 * the way most people get in, and they keep working either way.
 */
export const accountRouter = {
	/** Who the caller is, from D1 rather than the five-minute session cache. */
	me: personProcedure.handler(async ({ context }) => {
		const me = context.me;
		return {
			id: me.id,
			name: me.name,
			email: me.email,
			emailVerified: me.emailVerified,
			role: me.role,
			unsubscribedAt: me.unsubscribedAt,
			unsubscribeReason: me.unsubscribeReason,
		};
	}),

	/** The name hosts and other guests see. */
	setName: personProcedure
		.input(z.object({ name: z.string().trim().min(1, "Name?").max(60) }))
		.handler(async ({ context, input }) => {
			await context.db
				.update(user)
				.set({ name: input.name })
				.where(eq(user.id, context.me.id));
			return { ok: true };
		}),

	/**
	 * Email on or off. Turning it back on also lifts Brevo's blocklist, or the
	 * account would read as subscribed and stay quietly undeliverable.
	 */
	setEmail: personProcedure
		.input(z.object({ on: z.boolean() }))
		.handler(async ({ context, input }) => {
			if (input.on) {
				await resubscribe(context.db, context.me.id);
				// A name-only guest's address reads blank; there is nothing to unblock.
				if (context.me.email) await getMailer().unblock(context.me.email);
			} else {
				await unsubscribe(context.db, { id: context.me.id }, "self");
			}
			const me = await findPerson(context.db, context.me.id);
			return { unsubscribedAt: me?.unsubscribedAt ?? null };
		}),

	/**
	 * Whether the caller has a password at all. Asked of the `account` table
	 * directly: `listUserAccounts` strips the password, and a credential row
	 * can exist without one.
	 */
	hasPassword: protectedProcedure.handler(async ({ context }) => {
		const row = await context.db
			.select({ id: account.id })
			.from(account)
			.where(
				and(
					eq(account.userId, context.session.user.id),
					eq(account.providerId, "credential"),
					isNotNull(account.password),
				),
			)
			.get();
		return { hasPassword: Boolean(row) };
	}),

	/** Set a first password. Changing an existing one goes through the client. */
	setPassword: protectedProcedure
		.input(z.object({ newPassword: z.string().min(8) }))
		.handler(async ({ context, input }) => {
			try {
				await createAuth().api.setPassword({
					body: { newPassword: input.newPassword },
					headers: context.headers,
				});
			} catch (error) {
				// PASSWORD_TOO_SHORT, PASSWORD_ALREADY_SET and friends.
				if (error instanceof APIError) {
					throw new ORPCError("BAD_REQUEST", {
						message: error.message || "That password did not take.",
					});
				}
				throw error;
			}
			return { hasPassword: true };
		}),
};
