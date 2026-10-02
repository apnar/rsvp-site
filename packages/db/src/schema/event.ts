import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/**
 * - `draft` -- only its hosts can see it, and nothing has been mailed.
 * - `published` -- invitations have gone out; guests can open it.
 * - `canceled` -- still readable by its guests, so the cancellation itself
 *   has somewhere to point, but nothing more is sent.
 */
export const EVENT_STATUSES = ["draft", "published", "canceled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** How a host hears about replies: not at all, one email each, or one a day. */
export const HOST_ALERTS = ["off", "each", "daily"] as const;
export type HostAlerts = (typeof HOST_ALERTS)[number];

const createdAt = () =>
	integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull();
const updatedAt = () =>
	integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull();

/**
 * One party. `date` is a `YYYY-MM-DD` string and the times `HH:MM`, all on
 * the site's clock (America/New_York) -- compare them with the helpers in
 * `@rsvp-site/api/time`, never with `Date`.
 */
export const event = sqliteTable(
	"event",
	{
		id: text("id").primaryKey(),
		/**
		 * The secret in the event's open share link (`/i/<token>`). Separate
		 * from `id` so a host can retire a link that got out of hand without
		 * breaking the links in invitations already sent.
		 */
		shareToken: text("share_token").notNull().unique(),
		title: text("title").notNull(),
		/** Free text under the title: "The King Farm Swim Team parents". */
		hostLine: text("host_line").notNull().default(""),
		/** Null only while a draft has no date yet. */
		date: text("date"),
		startTime: text("start_time"),
		endTime: text("end_time"),
		location: text("location").notNull().default(""),
		details: text("details").notNull().default(""),
		/** R2 key of the cover photo, served token-free at /api/covers/<key>. */
		coverKey: text("cover_key"),
		status: text("status", { enum: EVENT_STATUSES }).notNull().default("draft"),
		rsvpDeadline: text("rsvp_deadline"),

		/** How many people beyond the guest themselves; 0 turns plus-ones off. */
		maxPlusOnes: integer("max_plus_ones").notNull().default(4),
		askKids: integer("ask_kids", { mode: "boolean" }).notNull().default(true),
		askDietary: integer("ask_dietary", { mode: "boolean" })
			.notNull()
			.default(true),
		askNote: integer("ask_note", { mode: "boolean" }).notNull().default(true),
		potluckEnabled: integer("potluck_enabled", { mode: "boolean" })
			.notNull()
			.default(false),
		/** Counts are always shown to guests; names only when this is on. */
		showGuestNames: integer("show_guest_names", { mode: "boolean" })
			.notNull()
			.default(true),
		shareEnabled: integer("share_enabled", { mode: "boolean" })
			.notNull()
			.default(false),

		remindDeadline: integer("remind_deadline", { mode: "boolean" })
			.notNull()
			.default(true),
		remindDaysBefore: integer("remind_days_before").notNull().default(3),
		remindDayBefore: integer("remind_day_before", { mode: "boolean" })
			.notNull()
			.default(true),
		notifyChanges: integer("notify_changes", { mode: "boolean" })
			.notNull()
			.default(true),
		hostAlerts: text("host_alerts", { enum: HOST_ALERTS })
			.notNull()
			.default("daily"),

		/**
		 * Stage stamps. A stamp means the email was resolved -- sent, or
		 * deliberately skipped because its moment passed -- not that it went
		 * out; `email_send` is the record of what actually went. Each is
		 * claimed with `UPDATE ... WHERE col IS NULL` so two cron passes can
		 * never both send it. `digest_at` is the exception: the daily digest
		 * repeats, so it holds the last one and the claim compares against it.
		 */
		publishedAt: integer("published_at", { mode: "timestamp_ms" }),
		deadlineReminderAt: integer("deadline_reminder_at", {
			mode: "timestamp_ms",
		}),
		dayBeforeAt: integer("day_before_at", { mode: "timestamp_ms" }),
		digestAt: integer("digest_at", { mode: "timestamp_ms" }),
		canceledAt: integer("canceled_at", { mode: "timestamp_ms" }),

		createdBy: text("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		index("event_date_idx").on(table.date),
		index("event_status_idx").on(table.status),
	],
);

/**
 * Who runs an event. The creator is the owner; co-hosts get the same powers
 * except removing the owner. Admins can manage every event without a row.
 */
export const eventHost = sqliteTable(
	"event_host",
	{
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		isOwner: integer("is_owner", { mode: "boolean" }).notNull().default(false),
		createdAt: createdAt(),
	},
	(table) => [
		primaryKey({ columns: [table.eventId, table.userId] }),
		index("event_host_user_idx").on(table.userId),
	],
);

/** How somebody got on an event's list. */
export const GUEST_SOURCES = ["host", "group", "link"] as const;
export type GuestSource = (typeof GUEST_SOURCES)[number];

/** What a guest said. No row value at all (null) is "hasn't answered". */
export const GUEST_RESPONSES = ["yes", "maybe", "no"] as const;
export type GuestResponse = (typeof GUEST_RESPONSES)[number];

/**
 * One invitation, and its answer: the row exists from the moment a host
 * puts somebody on the list, and the RSVP fills it in. Keeping them in one
 * row is what lets "no reply" be a plain `response IS NULL`.
 */
export const eventGuest = sqliteTable(
	"event_guest",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		source: text("source", { enum: GUEST_SOURCES }).notNull().default("host"),
		response: text("response", { enum: GUEST_RESPONSES }),
		/** Including the guest themselves, so a yes is at least 1. */
		adults: integer("adults").notNull().default(1),
		kids: integer("kids").notNull().default(0),
		dietary: text("dietary").notNull().default(""),
		note: text("note").notNull().default(""),
		/** When the invitation email went out. Null: not sent yet. */
		invitedAt: integer("invited_at", { mode: "timestamp_ms" }),
		respondedAt: integer("responded_at", { mode: "timestamp_ms" }),
		nudgedAt: integer("nudged_at", { mode: "timestamp_ms" }),
		addedBy: text("added_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		uniqueIndex("event_guest_event_user_uidx").on(table.eventId, table.userId),
		index("event_guest_user_idx").on(table.userId),
	],
);

/** Something a host wants brought, and how many of it. */
export const potluckItem = sqliteTable(
	"potluck_item",
	{
		id: text("id").primaryKey(),
		eventId: text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		quantity: integer("quantity").notNull().default(1),
		sort: integer("sort").notNull().default(0),
		createdAt: createdAt(),
	},
	(table) => [index("potluck_item_event_idx").on(table.eventId)],
);

/**
 * A guest taking one slot of an item. One per guest per item: the "4" on
 * "Drinks for stop 1" is four different households, not one bringing four.
 */
export const potluckClaim = sqliteTable(
	"potluck_claim",
	{
		itemId: text("item_id")
			.notNull()
			.references(() => potluckItem.id, { onDelete: "cascade" }),
		guestId: text("guest_id")
			.notNull()
			.references(() => eventGuest.id, { onDelete: "cascade" }),
		createdAt: createdAt(),
	},
	(table) => [
		primaryKey({ columns: [table.itemId, table.guestId] }),
		index("potluck_claim_guest_idx").on(table.guestId),
	],
);
