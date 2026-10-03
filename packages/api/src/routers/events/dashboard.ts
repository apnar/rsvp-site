import { isAdmin } from "@rsvp-site/db/roles";
import { user } from "@rsvp-site/db/schema/auth";
import { event, eventGuest, eventHost } from "@rsvp-site/db/schema/event";
import {
	and,
	count,
	desc,
	eq,
	getTableColumns,
	gt,
	inArray,
	isNotNull,
	ne,
} from "drizzle-orm";
import { z } from "zod";

import { accessTo, byDate, cardsFor } from "../../events";
import { deciding, openSlots } from "../../headcount";
import { hostProcedure, personProcedure } from "../../index";
import { idInput } from "../../inputs";
import { todayOnSite } from "../../time";
import { invitePayload } from "./invite-payload";

/**
 * Every event column by name, so a join can select them flat. Read off the
 * table rather than listed, so a new column cannot be forgotten here.
 */
const eventColumns = getTableColumns(event);

export const dashboardRouter = {
	/**
	 * The host dashboard: the caller's events as cards, with the tiles and
	 * the latest replies across all of them. `all` lets an admin see every
	 * event on the site, not just their own.
	 */
	mine: hostProcedure
		.input(
			z.object({ all: z.boolean().default(false) }).default({ all: false }),
		)
		.handler(async ({ context, input }) => {
			const all = input.all && isAdmin(context.me);
			const rows = all
				? await context.db.select().from(event).all()
				: await context.db
						.select(eventColumns)
						.from(event)
						.innerJoin(eventHost, eq(eventHost.eventId, event.id))
						.where(eq(eventHost.userId, context.me.id))
						.all();
			const today = todayOnSite();
			const cards = await cardsFor(context.db, rows);
			const upcoming = cards
				.filter((c) => c.status !== "draft" && (c.date ?? "") >= today)
				.sort(byDate);
			const drafts = cards.filter((c) => c.status === "draft").sort(byDate);
			const past = cards
				.filter((c) => c.status !== "draft" && (c.date ?? "") < today)
				.sort(byDate)
				.reverse();

			const live = upcoming.filter((c) => c.status === "published");
			const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
			// Scoped by a subquery on the caller's hosted events, not an id list:
			// D1 caps bound parameters, and a long list would silently drop events.
			const scope = all
				? undefined
				: inArray(
						eventGuest.eventId,
						context.db
							.select({ id: eventHost.eventId })
							.from(eventHost)
							.where(eq(eventHost.userId, context.me.id)),
					);
			const [fresh, recent] = await Promise.all([
				context.db
					.select({
						guestId: eventGuest.id,
						eventId: eventGuest.eventId,
						name: user.name,
						response: eventGuest.response,
						adults: eventGuest.adults,
						kids: eventGuest.kids,
						respondedAt: eventGuest.respondedAt,
					})
					.from(eventGuest)
					.innerJoin(user, eq(user.id, eventGuest.userId))
					.where(and(scope, isNotNull(eventGuest.respondedAt)))
					.orderBy(desc(eventGuest.respondedAt))
					.limit(8)
					.all(),
				// Counted apart from the eight shown, which cap what it could say.
				context.db
					.select({ n: count() })
					.from(eventGuest)
					.where(and(scope, gt(eventGuest.respondedAt, since)))
					.get(),
			]);
			const titles = new Map(rows.map((r) => [r.id, r.title]));
			return {
				now: new Date().toISOString(),
				today,
				upcoming,
				drafts,
				past,
				tiles: {
					newReplies: recent?.n ?? 0,
					// A canceled party has nobody left to decide and nothing to bring.
					deciding: live.reduce((n, c) => n + deciding(c.totals), 0),
					openSlots: live.reduce((n, c) => n + openSlots(c.potluck), 0),
				},
				fresh: fresh.map((f) => ({
					...f,
					eventTitle: titles.get(f.eventId) ?? "",
				})),
			};
		}),

	/** The caller's own invitations, upcoming first, for "My invites". */
	invites: personProcedure.handler(async ({ context }) => {
		const rows = await context.db
			.select({ ...eventColumns, response: eventGuest.response })
			.from(eventGuest)
			.innerJoin(event, eq(event.id, eventGuest.eventId))
			.where(
				and(eq(eventGuest.userId, context.me.id), ne(event.status, "draft")),
			)
			.all();
		const cards = await cardsFor(context.db, rows);
		const today = todayOnSite();
		const response = new Map(rows.map((r) => [r.id, r.response]));
		const withMine = cards.map((c) => ({
			...c,
			myResponse: response.get(c.id) ?? null,
		}));
		return {
			today,
			upcoming: withMine.filter((c) => (c.date ?? "") >= today).sort(byDate),
			past: withMine
				.filter((c) => (c.date ?? "") < today)
				.sort(byDate)
				.reverse(),
		};
	}),

	/** The invitation page: for guests, and for hosts seeing it as a guest. */
	invite: personProcedure.input(idInput).handler(async ({ context, input }) => {
		const access = await accessTo(context.db, context.me, input.eventId);
		return invitePayload(context.db, context.me, access);
	}),
};
