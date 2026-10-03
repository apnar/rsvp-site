/// <reference types="@cloudflare/workers-types" />

// Keep in sync with the `vars`, secrets and bindings in apps/web/wrangler.jsonc.
export interface CloudflareEnv {
	/** D1 database binding. */
	DB: D1Database;
	/**
	 * R2 bucket: cover photos under `covers/`, and design images and card
	 * pictures under `designs/<event id>/`. Served at /api/<key>.
	 */
	MEDIA: R2Bucket;
	/**
	 * Workers rate limiter for the share-link email form, keyed by IP, so a
	 * public page cannot be used to mail strangers in bulk.
	 */
	JOIN_LIMITER: RateLimit;
	/**
	 * Workers rate limiter for the sign-in doors (password, reset, emailed
	 * link), keyed by path and IP.
	 */
	AUTH_LIMITER: RateLimit;
	/** Secret: `wrangler secret put BETTER_AUTH_SECRET` (or .dev.vars locally). */
	BETTER_AUTH_SECRET: string;
	/** Public origin of the deployed Worker (wrangler.jsonc `vars`). */
	BETTER_AUTH_URL: string;
	/**
	 * Secret: `wrangler secret put BREVO_API_KEY` (or .dev.vars locally).
	 * Optional: without it emails are logged to the console, not sent.
	 */
	BREVO_API_KEY?: string;
	/**
	 * Secret: `wrangler secret put BREVO_WEBHOOK_SECRET`. Bearer token Brevo
	 * sends to /api/brevo/webhook. Without it the webhook route answers 404.
	 */
	BREVO_WEBHOOK_SECRET?: string;
}

declare module "cloudflare:workers" {
	namespace Cloudflare {
		interface Env extends CloudflareEnv {}
	}
}
