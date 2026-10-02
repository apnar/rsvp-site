import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { event } from "./event";

export const EMAIL_KINDS = [
	/** The invitation itself, sent when a host publishes or adds people. */
	"invite",
	/** To people who have not answered, a set number of days before the deadline. */
	"deadline_reminder",
	/** To yeses and maybes, the day before. */
	"day_before",
	/** Date, time or place changed; to everyone who has not said no. */
	"update",
	"cancel",
	/** A host pressing "Nudge" on the people who have not answered. */
	"nudge",
	/** To an event's hosts: one reply, or the day's replies. */
	"host_alert",
	"host_digest",
	/** The sign-in link somebody asked for on a share-link page. */
	"join_link",
	"welcome",
	/** Anything an admin types on /admin/email. */
	"message",
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/**
 * Who a send went to. `guests` is some or all of one event's list; `everyone`
 * is every active person who has not unsubscribed. `active` is the old name
 * for `everyone`, kept because the column's default and old rows use it.
 */
export const EMAIL_AUDIENCES = ["guests", "everyone", "active"] as const;
export type EmailAudience = (typeof EMAIL_AUDIENCES)[number];

/** One row per list send (not per recipient), for the admin log and debugging. */
export const emailSend = sqliteTable(
	"email_send",
	{
		id: text("id").primaryKey(),
		kind: text("kind", { enum: EMAIL_KINDS }).notNull(),
		eventId: text("event_id").references(() => event.id, {
			onDelete: "set null",
		}),
		subject: text("subject").notNull(),
		audience: text("audience", { enum: EMAIL_AUDIENCES })
			.notNull()
			.default("everyone"),
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
	(table) => [index("email_send_event_idx").on(table.eventId)],
);
