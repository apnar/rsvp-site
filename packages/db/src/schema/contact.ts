import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/**
 * A host's address book: everybody they have invited, or added on purpose.
 * Filled in as they put people on events and in groups, so "invite the
 * same people again" is a pick from a list rather than a retyping. Private
 * to its owner, like the groups that are made from it.
 */
export const contact = sqliteTable(
	"contact",
	{
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.ownerId, table.userId] }),
		index("contact_user_idx").on(table.userId),
	],
);

/**
 * A host's own named list of people ("King Farm Swim Team"), added to an
 * event's guest list in one go. Private to its owner unless an admin marks
 * it `shared`, which lets every host add from it (never edit it); admins
 * can read all.
 */
export const contactGroup = sqliteTable(
	"contact_group",
	{
		id: text("id").primaryKey(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		shared: integer("shared", { mode: "boolean" }).notNull().default(false),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("contact_group_owner_idx").on(table.ownerId)],
);

export const contactGroupMember = sqliteTable(
	"contact_group_member",
	{
		groupId: text("group_id")
			.notNull()
			.references(() => contactGroup.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.groupId, table.userId] }),
		index("contact_group_member_user_idx").on(table.userId),
	],
);
