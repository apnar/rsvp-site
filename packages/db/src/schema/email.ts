import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { game } from "./game";

export const EMAIL_KINDS = [
	/** The five stages of the RSVP cycle, in the order they can fire. */
	"rsvp_call",
	"rsvp_nudge",
	"rsvp_confirmed",
	"rsvp_last_call",
	"rsvp_final",
	/** Anything an admin types on /admin/email. */
	"message",
	/** Contributions toward the costs: the call and the nag, both sent by hand from
	 *  /admin/contributions. */
	"contribution_call",
	"contribution_reminder",
	/**
	 * Legacy. Nothing writes these any more -- the RSVP cycle replaced the
	 * announce-on-booking email and the 9 AM reminder -- but rows from before
	 * it still carry them and the admin log renders them, so the union has to
	 * admit they exist.
	 */
	"announcement",
	"reminder",
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/**
 * Who a send went to. `active` is everybody on the list; `everyone` adds the
 * people who have stepped away for a while. Nobody deactivated is in either.
 */
export const EMAIL_AUDIENCES = ["active", "everyone"] as const;
export type EmailAudience = (typeof EMAIL_AUDIENCES)[number];

/** One row per list send (not per recipient), for the admin log and debugging. */
export const emailSend = sqliteTable(
	"email_send",
	{
		id: text("id").primaryKey(),
		kind: text("kind", { enum: EMAIL_KINDS }).notNull(),
		gameId: text("game_id").references(() => game.id, {
			onDelete: "set null",
		}),
		subject: text("subject").notNull(),
		audience: text("audience", { enum: EMAIL_AUDIENCES })
			.notNull()
			.default("active"),
		recipientCount: integer("recipient_count").notNull(),
		failedCount: integer("failed_count").notNull().default(0),
		/** JSON array of Brevo message ids, one per batch. */
		messageIds: text("message_ids").notNull().default("[]"),
		/** JSON array of { emails, error } for batches Brevo rejected. */
		errors: text("errors").notNull().default("[]"),
		sentBy: text("sent_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("email_send_game_idx").on(table.gameId)],
);
