import { relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** How somebody first landed on the list. */
export const PERSON_SOURCES = ["site", "admin", "signup"] as const;
export type PersonSource = (typeof PERSON_SOURCES)[number];

/**
 * The three states a person can be in.
 *
 * - `active` — gets the emails, holds a spot, signs in.
 * - `suspended` — stepped away. No game email unless an admin deliberately
 *   picks the "everyone" audience, and no RSVP, but they can still sign in,
 *   which is how they come back. Set by the person themselves or an admin,
 *   and lifts on its own date when there is one.
 * - `deactivated` — out of the group. No email of any kind, no way in. Only
 *   an admin can put somebody here, and only an admin can undo it.
 */
export const PERSON_STATUSES = ["active", "suspended", "deactivated"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

/** Who moved somebody off active. `mail` is Brevo telling us through the webhook. */
export const STATUS_ACTORS = ["self", "admin", "mail"] as const;
export type StatusActor = (typeof STATUS_ACTORS)[number];

/**
 * Everybody. This one table is the roster, the mailing list and the accounts:
 * there is no second list of people to keep in step with it.
 */
export const user = sqliteTable(
	"user",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: integer("email_verified", { mode: "boolean" })
			.default(false)
			.notNull(),
		image: text("image"),
		/** Better Auth admin plugin: "admin" or "user" (null counts as user). */
		role: text("role"),
		/**
		 * Better Auth's own gate, which it checks on its sign-in routes. We do
		 * not set it by hand: it is a mirror of `status = 'deactivated'`, written
		 * in the same statement, so the framework blocks the password door while
		 * `status` stays the one thing the app reads. Nullable, because 0000
		 * created it without NOT NULL — never compare it with `= 0`.
		 */
		banned: integer("banned", { mode: "boolean" }).default(false),
		banReason: text("ban_reason"),
		banExpires: integer("ban_expires", { mode: "timestamp_ms" }),

		/**
		 * Random token in every link we email this person. Clicking one signs
		 * them in, so it is a bearer credential: never put it on a permit URL,
		 * and never hand it to Better Auth as an additional field — those get
		 * base64'd into a cookie the browser can read.
		 * Nullable only because SQLite cannot add a NOT NULL unique column.
		 */
		linkToken: text("link_token").unique(),
		/** When the last sign-in link was emailed, for the request cooldown. */
		linkSentAt: integer("link_sent_at", { mode: "timestamp_ms" }),
		/** Random token in the footer link of every list email. Same warning. */
		unsubscribeToken: text("unsubscribe_token").unique(),
		source: text("source", { enum: PERSON_SOURCES }).notNull().default("admin"),

		status: text("status", { enum: PERSON_STATUSES })
			.notNull()
			.default("active"),
		/**
		 * Only read while suspended. Null then means "until they say otherwise";
		 * a date in the past means the suspension is already over, which is why
		 * nothing has to run for somebody to come back.
		 */
		suspendedUntil: integer("suspended_until", { mode: "timestamp_ms" }),
		/** Their own words, usually an injury. Ours when Brevo told us. */
		statusReason: text("status_reason"),
		statusChangedAt: integer("status_changed_at", { mode: "timestamp_ms" }),
		statusChangedBy: text("status_changed_by", { enum: STATUS_ACTORS }),

		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("user_status_idx").on(table.status)],
);

export const session = sqliteTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		impersonatedBy: text("impersonated_by"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
	"account",
	{
		id: text("id").primaryKey(),
		issuer: text("issuer").notNull(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: integer("access_token_expires_at", {
			mode: "timestamp_ms",
		}),
		refreshTokenExpiresAt: integer("refresh_token_expires_at", {
			mode: "timestamp_ms",
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("account_issuer_accountId_uidx").on(
			table.issuer,
			table.accountId,
		),
		index("account_userId_idx").on(table.userId),
	],
);

export const verification = sqliteTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));
