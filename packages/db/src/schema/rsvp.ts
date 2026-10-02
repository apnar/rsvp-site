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
 * What somebody said. `maybe` is the game-time decision this run has always
 * had informally: it keeps you on the emails and counts toward nothing.
 */
export const RSVP_RESPONSES = ["in", "maybe", "out"] as const;
export type RsvpResponse = (typeof RSVP_RESPONSES)[number];

/**
 * One row per name per game. Deleting a game removes its headcount.
 */
export const rsvp = sqliteTable(
	"rsvp",
	{
		id: text("id").primaryKey(),
		gameId: text("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		/** Lower-cased, whitespace-collapsed name used for uniqueness. */
		nameKey: text("name_key").notNull(),
		response: text("response", { enum: RSVP_RESPONSES })
			.notNull()
			.default("in"),
		/** Set when the person was signed in when they added the name. */
		userId: text("user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		/**
		 * Who typed this name in. Load-bearing twice over: it decides who may
		 * change a guest's answer, and when a run is called off it is the only
		 * way to reach a guest at all -- guests have no inbox, so we tell the
		 * person who put them on the sheet and let them pass it on.
		 * Null on rows that predate the column; nobody knows who added those.
		 */
		addedBy: text("added_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("rsvp_game_name_uidx").on(table.gameId, table.nameKey),
		index("rsvp_game_idx").on(table.gameId),
	],
);
