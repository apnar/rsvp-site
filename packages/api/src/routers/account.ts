import { ORPCError } from "@orpc/server";
import { createAuth } from "@rsvp-site/auth";
import { APIError } from "@rsvp-site/auth/errors";
import { findPerson } from "@rsvp-site/db/people";
import { account } from "@rsvp-site/db/schema/auth";
import { resubscribe, unsubscribe } from "@rsvp-site/db/status";
import { rotateLinkToken } from "@rsvp-site/db/tokens";
import { getMailer } from "@rsvp-site/email/worker";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { removePicture, setPicture } from "../avatar";
import { detailsPatch, saveDetails } from "../details";
import { personProcedure } from "../index";
import { avatarFile } from "../media";

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
			image: me.image,
			firstName: me.firstName,
			lastName: me.lastName,
			phone: me.phone,
			addressLine1: me.addressLine1,
			addressLine2: me.addressLine2,
			city: me.city,
			region: me.region,
			postalCode: me.postalCode,
			country: me.country,
			email: me.email,
			emailVerified: me.emailVerified,
			role: me.role,
			unsubscribedAt: me.unsubscribedAt,
			unsubscribeReason: me.unsubscribeReason,
		};
	}),

	/**
	 * Their own details: the name hosts and other guests see, and the phone
	 * and address their hosts may use. Signing in made the record theirs.
	 */
	setDetails: personProcedure
		.input(detailsPatch)
		.handler(async ({ context, input }) => {
			await saveDetails(context.db, context.me.id, input, false);
			return { ok: true };
		}),

	/** Their own picture, already cropped in the browser. */
	setPicture: personProcedure
		.input(z.object({ file: avatarFile }))
		.handler(({ context, input }) =>
			setPicture(
				context.db,
				context.env,
				context.me.id,
				input.file,
				context.me.id,
			),
		),

	removePicture: personProcedure.handler(({ context }) =>
		removePicture(context.db, context.env, context.me.id),
	),

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
	 * Lock everybody else out of this account: the sign-in token in every
	 * email already sent stops working and every session, this one included,
	 * ends. For a forwarded email or a lost phone. The caller signs back in
	 * with a fresh link, so the page must send them to the login screen.
	 */
	signOutEverywhere: personProcedure.handler(async ({ context }) => {
		await rotateLinkToken(context.db, context.me.id);
		await createAuth().api.revokeSessions({ headers: context.headers });
		return { ok: true };
	}),

	/**
	 * Whether the caller has a password at all. Asked of the `account` table
	 * directly: `listUserAccounts` strips the password, and a credential row
	 * can exist without one.
	 */
	hasPassword: personProcedure.handler(async ({ context }) => {
		const row = await context.db
			.select({ id: account.id })
			.from(account)
			.where(
				and(
					eq(account.userId, context.me.id),
					eq(account.providerId, "credential"),
					isNotNull(account.password),
				),
			)
			.get();
		return { hasPassword: Boolean(row) };
	}),

	/** Set a first password. Changing an existing one goes through the client. */
	setPassword: personProcedure
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
