import { os } from "@orpc/server";
import type { Person } from "@rsvp-site/db/people";

import type { Context } from "./context";
import { hostAccessTo, refuseCanceled } from "./events";

// Declared against the context `hostProcedure` has by now (the caller as D1
// has them), so it can only be `.use`d after it.
const o = os.$context<Context & { me: Person }>();

/**
 * For procedures that act on one event as its host: `.input(idInput...)`
 * then `.use(withHostEvent)`. Puts `access` and `event` on the context. A
 * stranger gets the same NOT_FOUND as a wrong id, and an admin passes.
 *
 * It runs after input validation, which is why it is a middleware to `.use`
 * after `.input` rather than part of `hostProcedure`.
 */
export const withHostEvent = o.middleware(
	async ({ context, next }, input: { eventId: string }) => {
		const access = await hostAccessTo(context.db, context.me, input.eventId);
		return next({ context: { access, event: access.event } });
	},
);

/** `withHostEvent`, and a canceled event is refused: it is read-only. */
export const withLiveHostEvent = o.middleware(
	async ({ context, next }, input: { eventId: string }) => {
		const access = await hostAccessTo(context.db, context.me, input.eventId);
		refuseCanceled(access.event);
		return next({ context: { access, event: access.event } });
	},
);
