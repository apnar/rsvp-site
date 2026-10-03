import { env } from "@rsvp-site/env/server";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export function createDb() {
	return drizzle(env.DB, { schema });
}

/** What `createDb()` returns, for helpers that take the handle as a parameter. */
export type Db = ReturnType<typeof createDb>;
