import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { createContext } from "@rsvp-site/api/context";
import { appRouter } from "@rsvp-site/api/routers/index";
import { createAuth } from "@rsvp-site/auth";
import { env } from "@rsvp-site/env/server";
import { Hono } from "hono";
import { logger } from "hono/logger";

import { brevoWebhook } from "./brevo-webhook";
import { unsubscribe } from "./unsubscribe";

const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

/**
 * The Hono app that serves everything under /api. It runs inside the
 * TanStack Start Worker (see routes/api/$.ts), so it shares the origin with
 * the web app: no CORS and ordinary same-site cookies.
 */
export const app = new Hono().basePath("/api");

app.use(logger());

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

app.on(["GET", "POST"], "/auth/*", async (c) => {
	if (THROTTLED.has(c.req.path)) {
		const ip = c.req.header("cf-connecting-ip") ?? "local";
		const { success } = await env.AUTH_LIMITER.limit({
			key: `${c.req.path}:${ip}`,
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
		!/^(card-)?[0-9a-f-]{36}\.(jpg|png|webp)$/.test(name)
	) {
		return c.text("No such image.", 404);
	}
	return media(`designs/${eventId}/${name}`, c.req.header("if-none-match"));
});

app.route("/unsubscribe", unsubscribe);
app.route("/brevo/webhook", brevoWebhook);

app.get("/health", (c) => c.text("OK"));
