import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@rsvp-site/api/context";
import { appRouter } from "@rsvp-site/api/routers/index";
import { createAuth } from "@rsvp-site/auth";
import { createDb } from "@rsvp-site/db";
import { permit } from "@rsvp-site/db/schema/permit";
import { env } from "@rsvp-site/env/server";
import { eq } from "drizzle-orm";
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

const openApiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
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

app.on(["GET", "POST"], "/auth/*", (c) => createAuth().handler(c.req.raw));

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

app.all("/reference/*", async (c, next) => {
	const result = await openApiHandler.handle(c.req.raw, {
		prefix: "/api/reference",
		context: await createContext({ req: c.req.raw }),
	});
	if (result.matched) {
		return c.newResponse(result.response.body, result.response);
	}
	await next();
});

/**
 * Streams a permit PDF from R2. Readable by anyone with the link, by design:
 * the point is to show it to venue staff from whatever phone is handy.
 * Add `?download=1` to get an attachment instead of an inline view.
 */
app.get("/permits/:id/file", async (c) => {
	const row = await createDb()
		.select({
			r2Key: permit.r2Key,
			fileName: permit.fileName,
			contentType: permit.contentType,
		})
		.from(permit)
		.where(eq(permit.id, c.req.param("id")))
		.get();
	if (!row) return c.text("No such permit.", 404);

	const object = await env.PERMITS.get(row.r2Key);
	if (!object) return c.text("Permit file is missing.", 404);

	const disposition = c.req.query("download") ? "attachment" : "inline";
	const safeName = row.fileName.replace(/[^\w.\- ]+/g, "_");
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("content-type", row.contentType);
	headers.set("content-length", String(object.size));
	headers.set("etag", object.httpEtag);
	headers.set("cache-control", "public, max-age=3600");
	headers.set("content-disposition", `${disposition}; filename="${safeName}"`);
	return new Response(object.body, { headers });
});

app.route("/unsubscribe", unsubscribe);
app.route("/brevo/webhook", brevoWebhook);

app.get("/health", (c) => c.text("OK"));
