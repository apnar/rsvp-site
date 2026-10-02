import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { gym } from "./gym";
import { permit } from "./permit";

/**
 * Where a game stands. `scheduled` until the RSVP cycle decides: `confirmed`
 * the moment ten say yes (or at the final call with eight), `canceled` at the
 * final call with fewer.
 */
export const GAME_STATUSES = ["scheduled", "confirmed", "canceled"] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

/** A booked event. Only exists once a venue has been booked. */
export const game = sqliteTable(
	"game",
	{
		id: text("id").primaryKey(),
		/** YYYY-MM-DD in the venue's timezone. */
		date: text("date").notNull(),
		/** HH:MM, 24-hour. */
		startTime: text("start_time").notNull(),
		endTime: text("end_time"),
		/**
		 * The venue. Required: a game is a booked venue at a time, and there is
		 * no such thing as one without a place. `restrict` rather than
		 * `set null` for the same reason -- a gym with games on it cannot be
		 * deleted, and the router says so in words before D1 has to.
		 */
		gymId: text("gym_id")
			.notNull()
			.references(() => gym.id, { onDelete: "restrict" }),
		notes: text("notes"),
		permitId: text("permit_id").references(() => permit.id, {
			onDelete: "set null",
		}),
		createdBy: text("created_by").references(() => user.id, {
			onDelete: "set null",
		}),

		status: text("status", { enum: GAME_STATUSES })
			.notNull()
			.default("scheduled"),

		/*
		 * One stamp per stage of the RSVP cycle. Each means the stage is
		 * RESOLVED, not that an email went out: a stage skipped because its
		 * condition was not met is stamped too, or the job would retry it
		 * every half hour for the rest of the day. What actually went out
		 * lives in `email_send`, one row per send, keyed by `game_id`.
		 */
		callAt: integer("call_at", { mode: "timestamp_ms" }),
		nudgeAt: integer("nudge_at", { mode: "timestamp_ms" }),
		/** Also the answer to "when did we hit ten". Write-once. */
		confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
		lastCallAt: integer("last_call_at", { mode: "timestamp_ms" }),
		/** Stamped even when the 7:30 email is deliberately suppressed. */
		decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
		/**
		 * When a cycle email actually left the building. Separate from the
		 * stamps above because the spacing rule between sends is about
		 * inboxes, not bookkeeping -- a stage that resolved without sending
		 * must not push the next one an hour and a half out.
		 */
		lastEmailAt: integer("last_email_at", { mode: "timestamp_ms" }),

		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("game_date_time_uidx").on(table.date, table.startTime),
		index("game_date_idx").on(table.date),
		index("game_gym_idx").on(table.gymId),
	],
);
