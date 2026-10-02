import { ORPCError, os } from "@orpc/server";
import { findPerson } from "@rsvp-site/db/people";
import { canHost, isAdmin } from "@rsvp-site/db/roles";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({
		context: {
			session: context.session,
		},
	});
});

export const protectedProcedure = publicProcedure.use(requireAuth);

/**
 * The caller as D1 has them now. The session cookie caches the user for
 * five minutes, so a demoted host would otherwise keep hosting that long;
 * anything that grants power reads the row instead.
 */
const withPerson = protectedProcedure.use(async ({ context, next }) => {
	const me = await findPerson(context.db, context.session.user.id);
	if (!me || me.status === "deactivated") {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({ context: { me } });
});

export const hostProcedure = withPerson.use(async ({ context, next }) => {
	if (!canHost(context.me)) {
		throw new ORPCError("FORBIDDEN", {
			message: "Only hosts can do that. Ask an admin to make you one.",
		});
	}
	return next();
});

export const adminProcedure = withPerson.use(async ({ context, next }) => {
	if (!isAdmin(context.me)) {
		throw new ORPCError("FORBIDDEN", { message: "Admins only." });
	}
	return next();
});

/** Signed in and re-read from D1, for procedures that branch on the role. */
export const personProcedure = withPerson;
