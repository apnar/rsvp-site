import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { event } from "./event";

/**
 * Why a number gets no texts: its owner texted STOP (Telnyx refuses the
 * number from then on, across the whole messaging profile), or a carrier
 * said it is a landline or not a number at all.
 */
export const SMS_BLOCK_REASONS = ["stop", "landline", "invalid"] as const;
export type SmsBlockReason = (typeof SMS_BLOCK_REASONS)[number];

/**
 * Numbers nothing may be texted to. Keyed by the number, not the person:
 * an opt-out belongs to the phone, so it covers everybody who shares it and
 * anybody given it later. START from the phone deletes the row.
 */
export const smsBlock = sqliteTable("sms_block", {
	phone: text("phone").primaryKey(),
	reason: text("reason", { enum: SMS_BLOCK_REASONS }).notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
});

export const SMS_KINDS = [
	"invite",
	"nudge",
	"deadline_reminder",
	"day_before",
	"update",
	"cancel",
	"host_alert",
	"host_digest",
	/** A sign-in link somebody asked for by number on the login page. */
	"sign_in",
	/** The once-a-day answer to a text we can't read. */
	"reply",
	/** An admin's test to their own phone. */
	"test",
] as const;
export type SmsKind = (typeof SMS_KINDS)[number];

/**
 * `queued` until Telnyx's webhook says more: `sent` (a carrier took it),
 * then `delivered` or `failed`. A send Telnyx refused outright is `failed`
 * from the start and has no `telnyx_id`.
 */
export const SMS_STATUSES = ["queued", "sent", "delivered", "failed"] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];

/**
 * One row per text, unlike `email_send`: Telnyx reports each message's fate
 * on its own, and the guest list shows it per guest.
 */
export const smsSend = sqliteTable(
	"sms_send",
	{
		id: text("id").primaryKey(),
		telnyxId: text("telnyx_id").unique(),
		kind: text("kind", { enum: SMS_KINDS }).notNull(),
		eventId: text("event_id").references(() => event.id, {
			onDelete: "set null",
		}),
		userId: text("user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		phone: text("phone").notNull(),
		status: text("status", { enum: SMS_STATUSES }).notNull().default("queued"),
		/** Telnyx's error code, e.g. "40300" (opted out), "40010" (unregistered). */
		errorCode: text("error_code"),
		error: text("error"),
		parts: integer("parts").notNull().default(1),
		media: integer("media", { mode: "boolean" }).notNull().default(false),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("sms_send_event_user_idx").on(table.eventId, table.userId),
		index("sms_send_phone_idx").on(table.phone, table.createdAt),
	],
);

/**
 * The short `/t/<code>` links in texts, standing in for the long
 * `/api/auth/link?k=...&to=...` an email carries. A code signs its person
 * in, so it is a bearer credential like `link_token`; it holds a copy of
 * that token and works only while the two still match, which is what lets
 * replacing somebody's sign-in link retire every code sent to them too.
 */
export const textLink = sqliteTable(
	"text_link",
	{
		code: text("code").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		/** Where it lands, a path on the site ("/e/<id>"). */
		path: text("path").notNull(),
		linkToken: text("link_token").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("text_link_user_path_uidx").on(table.userId, table.path),
	],
);
