import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";
import { isAdmin } from "./run";

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

const requireAdmin = o.middleware(async ({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}
	if (!isAdmin(context.session.user)) {
		throw new ORPCError("FORBIDDEN", {
			message: "Admins only. Ask the host.",
		});
	}
	return next({
		context: {
			session: context.session,
		},
	});
});

export const adminProcedure = publicProcedure.use(requireAdmin);
