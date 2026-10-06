import { runEventMail } from "@rsvp-site/api/jobs/event-mail";
import { callerIp } from "@rsvp-site/api/limits";
import { pruneTelnyxEvents } from "@rsvp-site/api/texting";
import { createDb } from "@rsvp-site/db";
import { logError } from "@rsvp-site/db/errors";
import { redeemTextLink } from "@rsvp-site/db/text-links";
import { env } from "@rsvp-site/env/server";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

/**
 * Custom server entry. TanStack Start picks this up automatically in place
 * of its default one, and the Cloudflare Vite plugin ships its default
 * export as the Worker module, which is why `scheduled` can live here too.
 *
 * The site answers on more than one host (rsvp.botch.com and the
 * workers.dev URL) but Better Auth only trusts BETTER_AUTH_URL, so
 * every other host gets a permanent redirect to the canonical origin.
 */
const canonical = new URL(env.BETTER_AUTH_URL);

const entry = createServerEntry({
	async fetch(request, requestOpts) {
		const url = new URL(request.url);
		if (url.host !== canonical.host) {
			url.protocol = canonical.protocol;
			url.host = canonical.host;
			return Response.redirect(url.toString(), 301);
		}
		const code = /^\/t\/([0-9A-Za-z]{12})\/?$/.exec(url.pathname)?.[1];
		if (code && request.method === "GET") {
			return withSecurityHeaders(await textLink(request, code));
		}
		return withSecurityHeaders(await handler.fetch(request, requestOpts));
	},
});

/**
 * A `/t/<code>` link from a text: the short stand-in for an email's
 * `/api/auth/link?k=...&to=...`, which is where it sends the browser, so
 * signing in, the deactivated check and `safeReturnPath` are that door's
 * alone. A code is as good as the sign-in token, so guessing at them is
 * throttled like the other doors, and one minted under a token that has
 * since been replaced opens nothing.
 */
async function textLink(request: Request, code: string): Promise<Response> {
	const ip = callerIp(request.headers);
	const { success } = await env.AUTH_LIMITER.limit({ key: `/t:${ip}` });
	if (!success) return new Response("Too many tries.", { status: 429 });
	let found: Awaited<ReturnType<typeof redeemTextLink>> = null;
	try {
		found = await redeemTextLink(createDb(), code);
	} catch (error) {
		// Logged here, without the code: thrown, the error would carry it.
		logError("text link", error);
	}
	const to = found
		? `/api/auth/link?k=${found.linkToken}&to=${encodeURIComponent(found.path)}&via=text`
		: "/login?error=link";
	return new Response(null, {
		status: 302,
		headers: { location: to, "cache-control": "no-store" },
	});
}

/**
 * Nothing here is meant to be framed (the RSVP buttons and the admin pages
 * would be clickjacking bait), sniffed into another type, or announced in
 * a Referer to other sites.
 */
function withSecurityHeaders(response: Response): Response {
	const out = new Response(response.body, response);
	out.headers.set("x-frame-options", "DENY");
	out.headers.set("content-security-policy", "frame-ancestors 'none'");
	out.headers.set("x-content-type-options", "nosniff");
	out.headers.set("referrer-policy", "same-origin");
	return out;
}

export default {
	fetch: entry.fetch,

	/**
	 * Cron Trigger (wrangler.jsonc `triggers.crons`, every half hour). Sends
	 * each event's due reminders and host digests; `@rsvp-site/api/schedule`
	 * says what is due when. Test locally with
	 * `curl "http://localhost:3001/cdn-cgi/local/scheduled?cron=0+*+*+*+*"`.
	 */
	async scheduled(controller, _env, ctx) {
		const now = new Date(controller.scheduledTime);
		const db = createDb();
		ctx.waitUntil(
			pruneTelnyxEvents(db, now).catch((error) =>
				logError("telnyx event prune failed", error),
			),
		);
		ctx.waitUntil(
			runEventMail(db, now).then(
				(result) =>
					result.length > 0 &&
					console.log("event mail", JSON.stringify(result)),
				(error) => logError("event mail failed", error),
			),
		);
	},
} satisfies ExportedHandler<Cloudflare.Env>;
