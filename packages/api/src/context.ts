import { createAuth } from "@rsvp-site/auth";
import { createDb } from "@rsvp-site/db";
import { env } from "@rsvp-site/env/server";

export async function createContext({ req }: { req: Request }) {
	const session = await createAuth().api.getSession({
		headers: req.headers,
	});
	return {
		session,
		// Kept so procedures can call Better Auth's server-only endpoints as
		// the caller (setting a password, for one).
		headers: req.headers,
		db: createDb(),
		env,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
