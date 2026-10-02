/// <reference types="@cloudflare/workers-types" />
/// <reference path="../env.d.ts" />
// On Cloudflare Workers the environment (vars, secrets and bindings such as
// the D1 database) is exposed by the `cloudflare:workers` module. The shape is
// declared in ../env.d.ts and must match apps/web/wrangler.jsonc.
export { env } from "cloudflare:workers";
