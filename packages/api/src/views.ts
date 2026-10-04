import type { Db } from "@rsvp-site/db";
import { eventGuest } from "@rsvp-site/db/schema/event";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { VIEW_REFRESH_MS, viewedGuestId } from "./event-rules";
import type { Access } from "./events";

/**
 * Stamp the caller's invitation as on their screen. The browser calls this
 * once the page has rendered, never the page's read: mail clients and link
 * scanners fetch an emailed link on their own, and those fetches must not
 * look like a guest who opened it. A view never fails anything, so it
 * reports nothing back.
 */
export async function recordView(
	db: Db,
	access: Pick<Access, "isHost" | "guest">,
	now: Date = new Date(),
): Promise<void> {
	const id = viewedGuestId(access);
	if (!id) return;
	const stale = new Date(now.getTime() - VIEW_REFRESH_MS);
	await db
		.update(eventGuest)
		.set({
			viewedAt: sql`coalesce(${eventGuest.viewedAt}, ${now.getTime()})`,
			lastViewedAt: now,
		})
		.where(
			and(
				eq(eventGuest.id, id),
				or(isNull(eventGuest.lastViewedAt), lt(eventGuest.lastViewedAt, stale)),
			),
		);
}
