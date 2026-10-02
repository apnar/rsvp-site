import { ORPCError } from "@orpc/server";
import { createAuth } from "@rsvp-site/auth";
import { APIError } from "@rsvp-site/auth/errors";
import { account } from "@rsvp-site/db/schema/auth";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";

/**
 * A guest's own account. Passwords are optional here: the emailed links are
 * the way most people get in, and they keep working either way.
 */
export const accountRouter = {
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
