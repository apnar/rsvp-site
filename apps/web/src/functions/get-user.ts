import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "@/middleware/auth";

/**
 * Who is signed in, and nothing else. The router context is serialised into
 * the page and server-function responses, where script can read it; the
 * session row's token, address and user agent belong behind the HttpOnly
 * cookie. Pages read id, name, email and role only.
 */
export type SessionUser = {
	id: string;
	name: string;
	email: string;
	role: string | null;
};

export type AppSession = { user: SessionUser } | null;

export const getUser = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }): Promise<AppSession> => {
		const user = context.session?.user;
		if (!user) return null;
		return {
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				role: typeof user.role === "string" ? user.role : null,
			},
		};
	});
