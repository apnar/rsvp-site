import { runEventMail } from "@rsvp-site/api/jobs/event-mail";
import { createDb } from "@rsvp-site/db";
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
		return handler.fetch(request, requestOpts);
	},
});

export default {
	fetch: entry.fetch,

	/**
	 * Cron Trigger (wrangler.jsonc `triggers.crons`, every half hour). Sends
	 * each event's due reminders and host digests; `@rsvp-site/api/schedule`
	 * says what is due when. Test locally with
	 * `curl "http://localhost:3001/cdn-cgi/local/scheduled?cron=0+*+*+*+*"`.
	 */
	async scheduled(
		controller: { scheduledTime: number; cron: string },
		_env: unknown,
		ctx: { waitUntil(promise: Promise<unknown>): void },
	) {
		const now = new Date(controller.scheduledTime);
		ctx.waitUntil(
			runEventMail(createDb(), now).then(
				(result) =>
					result.length > 0 &&
					console.log("event mail", JSON.stringify(result)),
				(error) => console.error("event mail failed", error),
			),
		);
	},
};
