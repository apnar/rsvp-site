/// <reference types="@cloudflare/workers-types" />
/// <reference path="../env.d.ts" />
// On Cloudflare Workers the environment (vars, secrets and bindings such as
// the D1 database) is exposed by the `cloudflare:workers` module. The shape is
// declared in ../env.d.ts and must match apps/web/wrangler.jsonc.
import { env } from "cloudflare:workers";

export { env };

import { isLocal } from "./origin";

/**
 * Whether a missing mail or text key may mean "log instead of send". True
 * only on localhost; anywhere else a missing key is a mistake.
 */
export function allowDryRun(): boolean {
	return isLocal(env.BETTER_AUTH_URL);
}

/** Public origin used for links inside emails and texts. */
export function siteUrl(): string {
	return env.BETTER_AUTH_URL.replace(/\/$/, "");
}
