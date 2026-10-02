import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { game } from "./game";

/**
 * Who the opening call reckoned with, snapshotted the moment it went out.
 *
 * Without this there is no honest way to ask whether somebody answers the
 * calls to play. `user` holds one status and no history, so a break last
 * March is unrecoverable by tonight; and a man added in April cannot be
 * marked down for the three runs he was never asked about. So stage 01
 * writes down the roster it found -- one row per person, `on_break` for the
 * ones it deliberately skipped -- and the response rate is counted against
 * that, the same way the contribution ledger is a snapshot of the list at
 * send time rather than a live view of it.
 *
 * A game whose call never went out has no rows here, which is right: nobody
 * was asked, so nobody's record moves.
 */
export const gameInvite = sqliteTable(
	"game_invite",
	{
		id: text("id").primaryKey(),
		gameId: text("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/**
		 * They were stepped away when the ask went out, so no email reached
		 * them and their silence is not silence. Counted and reported on its
		 * own rather than quietly dropped, because "away for four of the last
		 * ten" is the thing an admin actually wants to know.
		 */
		onBreak: integer("on_break", { mode: "boolean" }).notNull().default(false),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		// The stage claim already makes one snapshot per game, but a send that
		// Brevo rejects outright gives the stage back and the next pass writes
		// this again; the insert leans on this index to stay idempotent.
		uniqueIndex("game_invite_game_user_uidx").on(table.gameId, table.userId),
		index("game_invite_user_idx").on(table.userId),
	],
);
