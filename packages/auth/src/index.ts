import { createDb } from "@rsvp-site/db";
import { markClaimed } from "@rsvp-site/db/details";
import { logError } from "@rsvp-site/db/errors";
import { findPerson } from "@rsvp-site/db/people";
import * as schema from "@rsvp-site/db/schema/auth";
import { rotateLinkToken, stampTokens } from "@rsvp-site/db/tokens";
import { resetPasswordEmail, scrubEmails } from "@rsvp-site/email";
import { getMailer } from "@rsvp-site/email/worker";
import { env } from "@rsvp-site/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { emailLink } from "./link";

/** Better Auth signs cookies with it; 32 characters is its own `openssl rand -base64 32` advice. */
const SECRET_MIN_LENGTH = 32;

export function createAuth() {
	// Better Auth only refuses its built-in default secret when NODE_ENV is
	// "production", which Workers never set, so a missing secret here would
	// sign every session cookie with a value printed in its source. Fail the
	// request instead.
	if (
		!env.BETTER_AUTH_SECRET ||
		env.BETTER_AUTH_SECRET.length < SECRET_MIN_LENGTH
	) {
		throw new Error(
			`BETTER_AUTH_SECRET must be set and at least ${SECRET_MIN_LENGTH} characters`,
		);
	}
	const db = createDb();

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",

			schema: schema,
		}),
		emailAndPassword: {
			enabled: true,
			// Nobody signs themselves up: a host, a group or a share link adds
			// the address, and an emailed link is the way in.
			disableSignUp: true,
			// Verification is encouraged, not enforced: nobody gets locked out of
			// the headcount over a missed email.
			requireEmailVerification: false,
			sendResetPassword: async ({ user, url }) => {
				// Better Auth hands over its own shape of the person, without the
				// columns that say whether they can be mailed at all. A name-only
				// paper guest has a placeholder address, and an unsubscribed one
				// asked for no email; neither gets a reset, and the endpoint
				// answers the same either way, so nothing is given away.
				const row = await findPerson(db, user.id);
				if (!row || row.noEmail || row.unsubscribedAt) return;
				const outcome = await getMailer().sendOne(
					{ email: user.email, name: user.name },
					resetPasswordEmail({ name: user.name, url }),
					{ tags: ["auth", "reset-password"] },
				);
				if (!outcome.ok) {
					console.error(
						"reset password email failed",
						outcome.status,
						scrubEmails(outcome.error),
					);
				}
			},
			// Somebody resetting a password is locking others out, so every
			// session goes with it (inside Better Auth's own write) ...
			revokeSessionsOnPasswordReset: true,
			// ... and so does the sign-in token in every email already sent,
			// which would otherwise still open the account the reset was meant
			// to close. Never fails the reset: the password is already saved.
			onPasswordReset: async ({ user }) => {
				try {
					await rotateLinkToken(db, user.id);
				} catch (error) {
					logError("link rotation after password reset failed", error);
				}
			},
		},
		// Better Auth's own limiter is on only when NODE_ENV is "production",
		// which Workers never set, and it counts per isolate anyway. Off
		// explicitly, so nobody reads the config and thinks it covers
		// anything: AUTH_LIMITER in apps/web/src/server/app.ts is the only
		// limit on these doors.
		rateLimit: { enabled: false },
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
							logError("token stamp failed", error);
						}
					},
				},
			},
			session: {
				create: {
					// The first session claims the record: from then on only they
					// and an admin change their details. Here rather than in each
					// way in (the emailed link, a password, a reset), so a new one
					// can't forget it. Never fails the sign-in.
					after: async (session) => {
						try {
							await markClaimed(db, session.userId);
						} catch (error) {
							logError("claim stamp failed", error);
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
			// No cookie cache: every request asks D1 whether its session still
			// stands. With one, a revoked session (sign out everywhere, a new
			// link, a deactivation) kept working for as long as the cookie's
			// copy lasted, which is the window those exist to close. A session
			// read is one indexed row.
			cookieCache: { enabled: false },
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		// Every write to a person goes through people.ts, which keeps
		// `banned` and `status` together and the roles to the three this site
		// has. These endpoints write people their own way, so they answer 404
		// over HTTP; the server can still call what it needs (setting a
		// password) through `auth.api`. The session and account endpoints
		// below are ones nothing here calls: sessions are ended through
		// `rotateLinkToken`, there are no social providers, and
		// `/verify-password` would be a password oracle for whoever got in on
		// a forwarded sign-in link.
		disabledPaths: [
			"/account-info",
			"/admin/ban-user",
			"/admin/create-user",
			"/admin/get-user",
			"/admin/has-permission",
			"/admin/impersonate-user",
			"/admin/list-users",
			"/admin/list-user-sessions",
			"/admin/remove-user",
			"/admin/revoke-user-session",
			"/admin/revoke-user-sessions",
			"/admin/set-role",
			"/admin/set-user-password",
			"/admin/stop-impersonating",
			"/admin/unban-user",
			"/admin/update-user",
			"/change-email",
			"/delete-user",
			"/delete-user/callback",
			"/get-access-token",
			"/link-social",
			"/list-accounts",
			"/list-sessions",
			"/refresh-token",
			"/revoke-other-sessions",
			"/revoke-session",
			"/revoke-sessions",
			"/send-verification-email",
			"/sign-up/email",
			"/unlink-account",
			"/update-session",
			"/update-user",
			"/verify-email",
			"/verify-password",
		],
		advanced: {
			// Behind Cloudflare the caller is cf-connecting-ip; x-forwarded-for
			// is whatever the caller says it is.
			ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
		},
		plugins: [
			admin({ adminRoles: ["admin"], defaultRole: "user" }),
			emailLink({ db }),
			// Must stay last.
			tanstackStartCookies(),
		],
	});
}
