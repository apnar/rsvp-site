import type { Db } from "@rsvp-site/db";
import {
	ARRIVAL_COOKIE,
	ARRIVAL_MAX_AGE,
	LINK_ARRIVALS,
} from "@rsvp-site/db/arrival";
import { findPersonByLinkToken } from "@rsvp-site/db/tokens";
import { escapeHtml, safeReturnPath } from "@rsvp-site/email";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";

/**
 * The page shown instead of signing somebody in over a session they already
 * hold (see the endpoint). Plain HTML with nothing but the two names and a
 * link back to this same URL: no script, no new parameter, nothing an
 * attacker could add to skip it. Not cached, because it names people.
 */
function switchPage(input: {
	linkName: string;
	currentName: string;
	href: string;
}): Response {
	const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Switch accounts?</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5;">
<h1 style="font-size:1.25rem;">Switch accounts?</h1>
<p>This link signs you in as <strong>${escapeHtml(input.linkName)}</strong>. You're currently signed in as <strong>${escapeHtml(input.currentName)}</strong>.</p>
<p><a href="${escapeHtml(input.href)}">Continue as ${escapeHtml(input.linkName)}</a></p>
</body>
</html>`;
	return new Response(body, {
		status: 200,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}

/**
 * Sign-in by link. Every link we email somebody carries their `link_token`;
 * clicking one is how a guest gets in, no password ever. The token is a
 * bearer credential, which is why the emails say not to forward them and why
 * a cover photo's URL never carries one.
 *
 * Served at `/api/auth/link?k=<token>&to=<path>`. GET, so Better Auth's
 * origin check does not apply. The param is `k`, not `callbackURL`: that
 * name is spoken for. `via=text` marks the redirect from a text's `/t/`
 * link; anything else came in an email.
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
						// A mangled one must not cost the guest their sign-in.
						via: z.enum(LINK_ARRIVALS).optional().catch(undefined),
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

					// Login CSRF: anybody with an account could put their own link
					// on another site, and whoever followed it would be signed in
					// as them without noticing, then answer or type an address into
					// the attacker's account. A link opened from a mail client
					// arrives with no session, or the reader's own, and goes
					// straight through; one that arrives cross-site over somebody
					// else's session gets a page that says so and a same-origin
					// link to this very URL, which the browser then sends as
					// same-origin. Only the lookup is done here: the current
					// session is neither refreshed nor touched.
					if (ctx.headers?.get("sec-fetch-site") === "cross-site") {
						const current = await getSessionFromCtx(ctx, {
							disableRefresh: true,
						});
						if (current && current.user.id !== person.id) {
							const here = new URL(`${ctx.context.baseURL}/link`);
							here.searchParams.set("k", ctx.query.k);
							if (ctx.query.to) here.searchParams.set("to", ctx.query.to);
							if (ctx.query.via) here.searchParams.set("via", ctx.query.via);
							return switchPage({
								linkName: person.name,
								currentName: current.user.name,
								href: here.toString(),
							});
						}
					}

					// The token proved who they are; the session needs Better
					// Auth's own shape of them, which only its adapter builds.
					let user = await ctx.context.internalAdapter.findUserById(person.id);
					if (!user) {
						// A `user` row is what the token hangs off, so this cannot
						// happen -- unless somebody deleted the row by hand.
						throw ctx.redirect(`${site}/login?error=link`);
					}
					// Clicking a link we mailed to that address proves it; a link
					// from a text proves the phone, and a placeholder is no address.
					const mailed = ctx.query.via !== "text" && !person.noEmail;
					if (mailed && !user.emailVerified) {
						// Better Auth's own magic-link would wipe their password
						// here; we keep it, because these are real guests.
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
					// So hosts can see the invitation was opened from this link
					// (see `arrivalOf`).
					ctx.setCookie(ARRIVAL_COOKIE, ctx.query.via ?? "email", {
						path: "/",
						httpOnly: true,
						sameSite: "lax",
						secure: site.startsWith("https:"),
						maxAge: ARRIVAL_MAX_AGE,
					});
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
		// No `rateLimit` entry: Better Auth's limiter is switched off in
		// createAuth (it would only run under NODE_ENV=production, and per
		// isolate at that). Both doors are throttled by AUTH_LIMITER in
		// apps/web/src/server/app.ts, which is the only limit on them.
	} satisfies BetterAuthPlugin;
}
