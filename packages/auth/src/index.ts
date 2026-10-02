import { createDb } from "@rsvp-site/db";
import { stampTokens } from "@rsvp-site/db/people";
import * as schema from "@rsvp-site/db/schema/auth";
import { resetPasswordEmail, verifyEmail } from "@rsvp-site/email";
import { getMailer } from "@rsvp-site/email/worker";
import { env } from "@rsvp-site/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { emailLink } from "./link";

export function createAuth() {
	const db = createDb();

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",

			schema: schema,
		}),
		trustedOrigins: [env.BETTER_AUTH_URL],
		emailAndPassword: {
			enabled: true,
			// Nobody signs themselves up any more: an admin adds the address and
			// the welcome email carries the way in.
			disableSignUp: true,
			// Verification is encouraged, not enforced: nobody gets locked out of
			// the headcount over a missed email.
			requireEmailVerification: false,
			sendResetPassword: async ({ user, url }) => {
				const outcome = await getMailer().sendOne(
					{ email: user.email, name: user.name },
					resetPasswordEmail({ name: user.name, url }),
					{ tags: ["auth", "reset-password"] },
				);
				if (!outcome.ok) {
					console.error("reset password email failed", outcome);
				}
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				const outcome = await getMailer().sendOne(
					{ email: user.email, name: user.name },
					verifyEmail({ name: user.name, url }),
					{ tags: ["auth", "verify-email"] },
				);
				if (!outcome.ok) {
					console.error("verification email failed", outcome);
				}
			},
		},
		databaseHooks: {
			user: {
				create: {
					// Every person needs a sign-in token and a footer token, and
					// making that a property of the table rather than of one call
					// site means no code path can produce somebody with no way in.
					// Better Auth drops fields it does not know about, so these
					// cannot be set in the insert itself.
					after: async (user) => {
						try {
							await stampTokens(db, user.id);
						} catch (error) {
							// Hooks run after the transaction commits, so a throw
							// here would surface as a failed sign-up with a real row
							// already written. ensureLinkToken picks up the slack.
							console.error("token stamp failed", error);
						}
					},
				},
			},
		},
		session: {
			// Half a year, rolling. Guests sign in from an email link once and
			// then stop thinking about it.
			expiresIn: 60 * 60 * 24 * 180,
			updateAge: 60 * 60 * 24,
			// The session cookie carries the user for five minutes, so ordinary
			// navigation costs no D1 read. A role changed by SQL takes that long
			// to show up.
			cookieCache: { enabled: true, maxAge: 5 * 60 },
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		plugins: [
			admin({ adminRoles: ["admin"], defaultRole: "user" }),
			emailLink({ db }),
			// Must stay last.
			tanstackStartCookies(),
		],
	});
}
