import { game } from "@rsvp-site/db/schema/game";
import { gym } from "@rsvp-site/db/schema/gym";
import { permit } from "@rsvp-site/db/schema/permit";
import { rsvp } from "@rsvp-site/db/schema/rsvp";
import { asc, desc, eq, gte, lt, sql } from "drizzle-orm";

import type { Context } from "./context";
import { CLOCK_STAGES } from "./cycle";
import {
	addDays,
	formatGameDate,
	formatGameTime,
	runInstant,
	todayInRunTimezone,
} from "./run";

type Db = Context["db"];

/** Base query: games with their gym, permit summary and current In count. */
function selectGames(db: Db) {
	return (
		db
			.select({
				id: game.id,
				date: game.date,
				startTime: game.startTime,
				endTime: game.endTime,
				notes: game.notes,
				status: game.status,
				callAt: game.callAt,
				nudgeAt: game.nudgeAt,
				confirmedAt: game.confirmedAt,
				lastCallAt: game.lastCallAt,
				decidedAt: game.decidedAt,
				lastEmailAt: game.lastEmailAt,
				gym: {
					id: gym.id,
					name: gym.name,
					address: gym.address,
					notes: gym.notes,
				},
				permit: {
					id: permit.id,
					label: permit.label,
					fileName: permit.fileName,
				},
				inCount: sql<number>`(select count(*) from ${rsvp} where ${rsvp.gameId} = ${game.id} and ${rsvp.response} = 'in')`,
			})
			.from(game)
			// The gym join is inner: `game.gym_id` is NOT NULL, so a game without
			// one cannot exist, and every caller gets to treat `gym` as present.
			.innerJoin(gym, eq(game.gymId, gym.id))
			.leftJoin(permit, eq(game.permitId, permit.id))
	);
}

type GameRow = Awaited<
	ReturnType<ReturnType<typeof selectGames>["all"]>
>[number];

export function decorateGame(row: GameRow) {
	return {
		...row,
		permit: row.permit?.id ? row.permit : null,
		/** Where to tell people to go: the venue, and the street it is on. */
		location: row.gym.address
			? `${row.gym.name}, ${row.gym.address}`
			: row.gym.name,
		/**
		 * Every moment of this game's cycle as a UTC instant, worked out once
		 * here so nothing downstream -- least of all a browser -- has to know
		 * what timezone the venue is in.
		 */
		cycle: {
			startsAt: runInstant(row.date, row.startTime).toISOString(),
			stages: CLOCK_STAGES.map((stage) => ({
				key: stage.key,
				at: runInstant(
					addDays(row.date, stage.dayOffset),
					stage.at as string,
				).toISOString(),
				doneAt: (row[stage.column] as Date | null)?.toISOString() ?? null,
			})),
		},
		dateLabel: formatGameDate(row.date),
		timeLabel: row.endTime
			? `${formatGameTime(row.startTime)} - ${formatGameTime(row.endTime)}`
			: formatGameTime(row.startTime),
		isPast: row.date < todayInRunTimezone(),
	};
}

export type GameSummary = ReturnType<typeof decorateGame>;

export async function findNextGame(db: Db) {
	const row = await selectGames(db)
		.where(gte(game.date, todayInRunTimezone()))
		.orderBy(asc(game.date), asc(game.startTime))
		.get();
	return row ? decorateGame(row) : null;
}

export async function findGame(db: Db, id: string) {
	const row = await selectGames(db).where(eq(game.id, id)).get();
	return row ? decorateGame(row) : null;
}

export async function listGames(db: Db, pastLimit = 5) {
	const today = todayInRunTimezone();
	const upcoming = await selectGames(db)
		.where(gte(game.date, today))
		.orderBy(asc(game.date), asc(game.startTime))
		.all();
	const past = await selectGames(db)
		.where(lt(game.date, today))
		.orderBy(desc(game.date), desc(game.startTime))
		.limit(pastLimit)
		.all();
	return {
		upcoming: upcoming.map(decorateGame),
		past: past.map(decorateGame),
	};
}
