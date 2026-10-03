import type { Db } from "@rsvp-site/db";
import { findPersonByLinkToken } from "@rsvp-site/db/tokens";
import { safeReturnPath } from "@rsvp-site/email";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";

/**
 * Sign-in by link. Every link we email somebody carries their `link_token`;
 * clicking one is how a guest gets in, no password ever. The token is a
 * bearer credential, which is why the emails say not to forward them and why
 * a cover photo's URL never carries one.
 *
 * Served at `/api/auth/link?k=<token>&to=<path>`. GET, so Better Auth's
 * origin check does not apply. The param is `k`, not `callbackURL`: that
 * name is spoken for.
 */
export function emailLink({ db }: { db: Db }) {
	return {
		id: "email-link",
		endpoints: {
			signInByEmailLink: createAuthEndpoint(
				"/link",
				{
					method: "GET",
					query: z.object({
						k: z.string().min(1),
						to: z.string().optional(),
					}),
				},
				async (ctx) => {
					// context.baseURL ends in /api/auth; links land on the site itself.
					const site = new URL(ctx.context.baseURL).origin;
					const person = await findPersonByLinkToken(db, ctx.query.k);
					if (!person) {
						throw ctx.redirect(`${site}/login?error=link`);
					}

					// Unsubscribing stops the email, not the sign-in. Deactivated is
					// the other story, and this endpoint has to say so itself -- it
					// mints its own session, so the admin plugin's ban check is not
					// the thing standing between a revoked guest and the address of
					// the party.
					if (person.status === "deactivated") {
						throw ctx.redirect(`${site}/login?error=revoked`);
					}

					// The token proved who they are; the session needs Better
					// Auth's own shape of them, which only its adapter builds.
					let user = await ctx.context.internalAdapter.findUserById(person.id);
					if (!user) {
						// A `user` row is what the token hangs off, so this cannot
						// happen -- unless somebody deleted the row by hand.
						throw ctx.redirect(`${site}/login?error=link`);
					}
					if (!user.emailVerified) {
						// Clicking a link we mailed to that address proves it. Better
						// Auth's own magic-link would wipe their password here; we
						// keep it, because these are real guests.
						user =
							(await ctx.context.internalAdapter.updateUser(user.id, {
								emailVerified: true,
							})) ?? user;
					}

					// No second argument: it means "don't remember me" and would cut
					// the session to a day.
					const session = await ctx.context.internalAdapter.createSession(
						user.id,
					);
					await setSessionCookie(ctx, { session, user });
					throw ctx.redirect(
						new URL(safeReturnPath(ctx.query.to), site).toString(),
					);
				},
			),
			/**
			 * Where QR codes on cards printed before /p/<key> pointed. A key
			 * no longer signs anybody in -- the host holds it, so it must not
			 * be a way into the guest's account -- so this only forwards to
			 * the card's own page, which opens that one invitation. Nothing is
			 * looked up here: the page says "no such event" for a bad key.
			 */
			signInByPaper: createAuthEndpoint(
				"/paper",
				{
					method: "GET",
					query: z.object({ k: z.string().min(1).max(64) }),
				},
				async (ctx) => {
					const site = new URL(ctx.context.baseURL).origin;
					throw ctx.redirect(`${site}/p/${encodeURIComponent(ctx.query.k)}`);
				},
			),
		},
		rateLimit: [
			{ pathMatcher: (path: string) => path === "/link", window: 60, max: 10 },
			{ pathMatcher: (path: string) => path === "/paper", window: 60, max: 10 },
		],
	} satisfies BetterAuthPlugin;
}
