import { relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * How somebody first landed on the list. `host` is an address a host typed
 * into an event or a contact group; `guest` is a friend a guest invited;
 * `link` is somebody who came in through an event's share link. The rest
 * predate events.
 */
export const PERSON_SOURCES = [
	"admin",
	"host",
	"guest",
	"link",
	"site",
	"signup",
] as const;
export type PersonSource = (typeof PERSON_SOURCES)[number];

/**
 * What somebody may do. A `user` answers invitations; a `host` also makes
 * events and keeps contact groups; an `admin` also manages people and roles.
 * Null in the column counts as `user` -- Better Auth's admin plugin writes
 * "user" itself, and rows from before roles mattered have nothing.
 */
export const ROLES = ["admin", "host", "user"] as const;
export type Role = (typeof ROLES)[number];

/**
 * - `active` -- signs in, can be invited.
 * - `deactivated` -- out. No email of any kind, no way in. Only an admin can
 *   put somebody here, and only an admin can undo it.
 *
 * Not wanting email is not a status: that is `unsubscribed_at`, which leaves
 * the account working.
 */
export const PERSON_STATUSES = ["active", "deactivated"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

/** Who last moved somebody between statuses. Only an admin does now. */
export const STATUS_ACTORS = ["self", "admin", "mail"] as const;
export type StatusActor = (typeof STATUS_ACTORS)[number];

/**
 * Why somebody stopped getting email: they said so (the footer link or the
 * account page), or Brevo told us through the webhook that mail to them
 * bounces, was reported as spam, or cannot be delivered.
 */
export const UNSUBSCRIBE_REASONS = [
	"self",
	"bounce",
	"spam",
	"invalid",
] as const;
export type UnsubscribeReason = (typeof UNSUBSCRIBE_REASONS)[number];

/** Where the placeholder addresses of name-only paper guests live. */
export const NO_EMAIL_DOMAIN = "no-email.invalid";

/**
 * Everybody, whatever their role: this one table is the people, the mailing
 * list and the accounts.
 */
export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" })
		.default(false)
		.notNull(),
	image: text("image"),
	/** One of ROLES, or null for `user`. Read it through `roleOf`. */
	role: text("role"),
	/**
	 * Better Auth's own gate, which it checks on its sign-in routes. We do
	 * not set it by hand: it is a mirror of `status = 'deactivated'`, written
	 * in the same statement, so the framework blocks the password door while
	 * `status` stays the one thing the app reads. Nullable, because 0000
	 * created it without NOT NULL -- never compare it with `= 0`.
	 */
	banned: integer("banned", { mode: "boolean" }).default(false),
	banReason: text("ban_reason"),
	banExpires: integer("ban_expires", { mode: "timestamp_ms" }),

	/**
	 * Random token in every link we email this person. Clicking one signs
	 * them in, so it is a bearer credential: never put it on a cover-photo
	 * URL, and never hand it to Better Auth as an additional field -- those
	 * get base64'd into a cookie the browser can read.
	 * Nullable only because SQLite cannot add a NOT NULL unique column.
	 */
	linkToken: text("link_token").unique(),
	/** When the last sign-in link was emailed, for the request cooldown. */
	linkSentAt: integer("link_sent_at", { mode: "timestamp_ms" }),
	/** Random token in the footer link of every list email. Same warning. */
	unsubscribeToken: text("unsubscribe_token").unique(),
	source: text("source", { enum: PERSON_SOURCES }).notNull().default("admin"),

	status: text("status", { enum: PERSON_STATUSES }).notNull().default("active"),
	statusChangedAt: integer("status_changed_at", { mode: "timestamp_ms" }),
	statusChangedBy: text("status_changed_by", { enum: STATUS_ACTORS }),

	/**
	 * A paper guest added by name alone. Their `email` is a unique
	 * placeholder at NO_EMAIL_DOMAIN (`.invalid` never delivers) only because
	 * the column is NOT NULL UNIQUE; nothing may mail it or show it.
	 */
	noEmail: integer("no_email", { mode: "boolean" }).notNull().default(false),
	/** Set while they want no email. Invitations still list them. */
	unsubscribedAt: integer("unsubscribed_at", { mode: "timestamp_ms" }),
	unsubscribeReason: text("unsubscribe_reason", {
		enum: UNSUBSCRIBE_REASONS,
	}),

	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

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
