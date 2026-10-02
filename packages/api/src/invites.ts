/**
 * The snapshot of who the opening call reckoned with, and the record read
 * back off it. The arithmetic is next door in `responses.ts` and pure; this
 * file is only the reading and the writing.
 */

import { listRosterState } from "@rsvp-site/db/people";
import { game } from "@rsvp-site/db/schema/game";
import { gameInvite } from "@rsvp-site/db/schema/invite";
import { rsvp } from "@rsvp-site/db/schema/rsvp";
import { and, desc, inArray, isNotNull, lt } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Context } from "./context";
import {
	type Answer,
	RESPONSE_WINDOW,
	type ResponseRate,
	tallyResponses,
} from "./responses";
import { todayInRunTimezone } from "./run";

type Db = Context["db"];

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size)
		out.push(items.slice(i, i + size));
	return out;
}

/**
 * Write down the roster the opening call found, before the call goes out.
 *
 * Idempotent, and it has to be: a send Brevo rejects outright gives the stage
 * back, and the next pass comes through here again. One batch, chunked the
 * way the contribution ledger is for D1's parameter cap.
 */
export async function recordInvites(
	db: Db,
	gameId: string,
	now: Date = new Date(),
): Promise<number> {
	const roster = await listRosterState(db, now);
	if (roster.length === 0) return 0;
	const statements = chunk(roster, 20).map((people) =>
		db
			.insert(gameInvite)
			.values(
				people.map((person) => ({
					id: crypto.randomUUID(),
					gameId,
					userId: person.id,
					onBreak: person.onBreak,
				})),
			)
			.onConflictDoNothing(),
	);
	const [first, ...rest] = statements;
	if (!first) return 0;
	await db.batch([first, ...rest] as [
		BatchItem<"sqlite">,
		...BatchItem<"sqlite">[],
	]);
	return roster.length;
}

/**
 * The last few runs that actually asked the list something, newest first.
 *
 * A game whose opening call never resolved is not in here -- it asked nobody,
 * so nobody's record should move for it. Nor is one still ahead of us, whose
 * answers are not all in. A run called off does count: the question went out,
 * and not answering it is exactly the thing being measured.
 */
async function recentCalledGames(
	db: Db,
	today: string,
	limit: number,
): Promise<string[]> {
	const rows = await db
		.select({ id: game.id })
		.from(game)
		.where(and(lt(game.date, today), isNotNull(game.callAt)))
		.orderBy(desc(game.date), desc(game.startTime))
		.limit(limit)
		.all();
	return rows.map((row) => row.id);
}

/** How everybody has answered the last `limit` calls, keyed by person. */
export async function readResponseRates(
	db: Db,
	now: Date = new Date(),
	limit: number = RESPONSE_WINDOW,
): Promise<Map<string, ResponseRate>> {
	const gameIds = await recentCalledGames(db, todayInRunTimezone(now), limit);
	if (gameIds.length === 0) return new Map();

	const [invites, answers] = await Promise.all([
		db
			.select({
				gameId: gameInvite.gameId,
				userId: gameInvite.userId,
				onBreak: gameInvite.onBreak,
			})
			.from(gameInvite)
			.where(inArray(gameInvite.gameId, gameIds))
			.all(),
		// Guest rows carry no `user_id` and belong to nobody, so they are not
		// anybody's answer.
		db
			.select({
				gameId: rsvp.gameId,
				userId: rsvp.userId,
				response: rsvp.response,
			})
			.from(rsvp)
			.where(and(inArray(rsvp.gameId, gameIds), isNotNull(rsvp.userId)))
			.all(),
	]);

	return tallyResponses(
		invites,
		answers.filter((row): row is Answer => row.userId !== null),
	);
}
