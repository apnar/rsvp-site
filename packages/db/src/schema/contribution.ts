import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { emailSend } from "./email";

/** What a billed person's row can say. Nothing else is a valid mark. */
export const CONTRIBUTION_STATUSES = ["unpaid", "paid", "excused"] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

/**
 * One call for contributions. `closed_at` null is the open call -- the one an
 * admin is actively tracking -- and there is only ever one of those; see the
 * partial unique index below.
 */
export const contributionCall = sqliteTable(
	"contribution_call",
	{
		id: text("id").primaryKey(),
		/** The email subject and the heading on the page. */
		subject: text("subject").notNull(),
		/** The admin's own paragraphs. */
		body: text("body").notNull(),
		/** Whole dollars, per person. */
		amount: integer("amount").notNull(),
		/** One line: "Venmo @host, or cash at the door." */
		instructions: text("instructions").notNull(),
		/** Null until the call actually goes out; see `openCall`/`attachSend`. */
		sendId: text("send_id").references(() => emailSend.id, {
			onDelete: "set null",
		}),
		openedBy: text("opened_by").references(() => user.id, {
			onDelete: "set null",
		}),
		openedAt: integer("opened_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		/** Bumped only by a real reminder send, like `game.last_email_at`. */
		lastRemindedAt: integer("last_reminded_at", { mode: "timestamp_ms" }),
		/** Null means open. Set once, by `closeCall`, and never cleared. */
		closedAt: integer("closed_at", { mode: "timestamp_ms" }),
	},
	(t) => [
		index("contribution_call_opened_idx").on(t.openedAt),
		/**
		 * The backstop for the double-click that the router's "a call is
		 * already open" check in words cannot catch. It has to be on the
		 * EXPRESSION `(closed_at is null)`, not on the column: SQLite treats
		 * NULLs as distinct from each other in a unique index, so
		 * `UNIQUE(closed_at)` would happily admit any number of open calls
		 * (every one of them null) and enforce nothing.
		 */
		uniqueIndex("contribution_call_open_uidx")
			.on(sql`(${t.closedAt} is null)`)
			.where(sql`${t.closedAt} is null`),
	],
);

/**
 * The ledger: one row per person billed on a call, snapshotted at send time.
 * Who owes is who was on the active list when the call went out, not who is
 * active now -- somebody added next week does not owe for an event they never
 * came to.
 */
export const contribution = sqliteTable(
	"contribution",
	{
		id: text("id").primaryKey(),
		callId: text("call_id")
			.notNull()
			.references(() => contributionCall.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		status: text("status", { enum: CONTRIBUTION_STATUSES })
			.notNull()
			.default("unpaid"),
		markedAt: integer("marked_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(t) => [
		uniqueIndex("contribution_call_user_uidx").on(t.callId, t.userId),
		index("contribution_user_idx").on(t.userId),
	],
);
