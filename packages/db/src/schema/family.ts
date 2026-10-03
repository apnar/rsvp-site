import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/**
 * A household, kept by the site's admins. Anybody in it may answer for
 * the others who are on the same event's list, so who is in which family
 * is not something a host decides. `shared` puts it in every host's guest
 * picker; unshared, only admins see it.
 */
export const family = sqliteTable("family", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	shared: integer("shared", { mode: "boolean" }).notNull().default(false),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

/**
 * Keyed on the person, so nobody is in two families: "your family" on an
 * invitation has to mean one set of people.
 */
export const familyMember = sqliteTable(
	"family_member",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		familyId: text("family_id")
			.notNull()
			.references(() => family.id, { onDelete: "cascade" }),
		/** Counted as a kid, not an adult, when a relative answers for them. */
		child: integer("child", { mode: "boolean" }).notNull().default(false),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [index("family_member_family_idx").on(table.familyId)],
);
