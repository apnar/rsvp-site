import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import { createContext } from "@rsvp-site/api/context";
import { appRouter } from "@rsvp-site/api/routers/index";
import { createAuth } from "@rsvp-site/auth";
import { logError } from "@rsvp-site/db/errors";
import { env } from "@rsvp-site/env/server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";

import { brevoWebhook } from "./brevo-webhook";
import { telnyxWebhook } from "./telnyx-webhook";
import { unsubscribe } from "./unsubscribe";

const rpcHandler = new RPCHandler(appRouter, {
	// Cookies are SameSite=Lax, and every other botch.com site is the same
	// site, so a form posted from one would arrive signed in. The client
	// sends a header no cross-origin form can.
	plugins: [new SimpleCsrfProtectionHandlerPlugin()],
	interceptors: [
		onError((error) => {
			// NOT_FOUND, FORBIDDEN and the like are answers, not faults.
			if (error instanceof ORPCError && error.status < 500) return;
			logError("rpc", error);
		}),
	],
});

/**
 * The Hono app that serves everything under /api. It runs inside the
 * TanStack Start Worker (see routes/api/$.ts), so it shares the origin with
 * the web app: no CORS and ordinary same-site cookies.
 */
export const app = new Hono().basePath("/api");

// Workers Logs already records every request with its status; the line
// per request is for the dev console only.
if (import.meta.env.DEV) app.use(logger());

// Hono's default handler logs whatever was thrown, whole, and a failed
// query's message carries its parameters. The route's pattern, not its
// path, names it: an unsubscribe path holds a token.
app.onError((error, c) => {
	if (error instanceof HTTPException) return error.getResponse();
	logError(`${c.req.method} ${c.req.routePath}`, error);
	return c.text("Something went wrong.", 500);
});

/**
 * The doors somebody could knock on all night: guessing passwords, mailing
 * resets to strangers, trying sign-in keys. Better Auth limits these too,
 * but in memory, and every Worker isolate has its own.
 */
const THROTTLED = new Set([
	"/api/auth/sign-in/email",
	"/api/auth/request-password-reset",
	"/api/auth/reset-password",
	"/api/auth/change-password",
	"/api/auth/link",
	"/api/auth/paper",
]);

/**
 * The path as the limiter should see it. Better Auth strips trailing
 * slashes before it looks at a path (its own `normalizePathname`), and a
 * proxy or a future option could make it forgiving about more, so this
 * folds case, repeated and trailing slashes and percent-escapes too: every
 * spelling of a door lands in the door's bucket, and being stricter than
 * Better Auth only ever throttles a request it would have refused.
 */
export function throttleKey(rawUrl: string): string {
	let path: string;
	try {
		path = new URL(rawUrl).pathname;
	} catch {
		return "/";
	}
	try {
		path = decodeURIComponent(path);
	} catch {
		// A malformed escape: keep it as typed; Better Auth 404s it anyway.
	}
	return (
		path
			.toLowerCase()
			.replace(/\/{2,}/g, "/")
			.replace(/\/+$/, "") || "/"
	);
}

app.on(["GET", "POST"], "/auth/*", async (c) => {
	const door = throttleKey(c.req.url);
	if (THROTTLED.has(door)) {
		const ip = c.req.header("cf-connecting-ip") ?? "local";
		const { success } = await env.AUTH_LIMITER.limit({
			key: `${door}:${ip}`,
		});
		if (!success) {
			return c.text("Too many tries. Wait a minute and try again.", 429);
		}
	}
	return createAuth().handler(c.req.raw);
});

app.all("/rpc/*", async (c, next) => {
	const result = await rpcHandler.handle(c.req.raw, {
		prefix: "/api/rpc",
		context: await createContext({ req: c.req.raw }),
	});
	if (result.matched) {
		return c.newResponse(result.response.body, result.response);
	}
	await next();
});

/**
 * Streams an image from R2. Public and token-free by design: the same URLs
 * go into emails, where mail proxies fetch them. Keys are random and never
 * reused -- a new photo gets a new key -- so the response can be cached for
 * good.
 */
async function media(key: string, etag: string | undefined): Promise<Response> {
	const object = await env.MEDIA.get(key, {
		onlyIf: etag ? { etagDoesNotMatch: etag.replaceAll('"', "") } : undefined,
	});
	if (!object) return new Response("No such image.", { status: 404 });
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	headers.set("cache-control", "public, max-age=31536000, immutable");
	headers.set("x-content-type-options", "nosniff");
	if (!("body" in object)) return new Response(null, { status: 304, headers });
	headers.set("content-length", String(object.size));
	return new Response(object.body, { headers });
}

app.get("/covers/:name", async (c) => {
	const name = c.req.param("name");
	if (!/^[\w-]+\.(jpg|png|webp)$/.test(name)) {
		return c.text("No such cover.", 404);
	}
	return media(`covers/${name}`, c.req.header("if-none-match"));
});

/** A design's images and its card, under designs/<event id>/. */
app.get("/designs/:eventId/:name", async (c) => {
	const { eventId, name } = c.req.param();
	if (
		!/^[0-9a-f-]{36}$/.test(eventId) ||
		!/^(card-)?[0-9a-f-]{36}(-mms)?\.(jpg|png|webp)$/.test(name)
	) {
		return c.text("No such image.", 404);
	}
	return media(`designs/${eventId}/${name}`, c.req.header("if-none-match"));
});

/** Profile pictures, under avatars/. */
app.get("/avatars/:name", async (c) => {
	const name = c.req.param("name");
	if (!/^[0-9a-f-]{36}\.jpg$/.test(name)) {
		return c.text("No such picture.", 404);
	}
	return media(`avatars/${name}`, c.req.header("if-none-match"));
});

app.route("/unsubscribe", unsubscribe);
app.route("/brevo/webhook", brevoWebhook);
app.route("/telnyx/webhook", telnyxWebhook);

app.get("/health", (c) => c.text("OK"));
