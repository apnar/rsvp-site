import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/**
 * A venue we book. Games point at one of these rather than carrying a
 * typed-in string, so the address and the "park by the side door" note are
 * written once and every game, email and permit reads the same answer.
 */
export const gym = sqliteTable("gym", {
	id: text("id").primaryKey(),
	/** What we call it: "The Garden Room". Unique, so the dropdown
	 *  never offers the same venue twice under two spellings. */
	name: text("name").notNull().unique(),
	/**
	 * Street address, for the people driving there. Empty on rows the gym
	 * migration invented out of the old free-text `game.location`, which was
	 * a name and never an address -- the admin page nags until one is filled
	 * in, and the form has required it since.
	 */
	address: text("address").notNull().default(""),
	/** Where to park, which door is unlocked, who to ask for. */
	notes: text("notes"),
	createdBy: text("created_by").references(() => user.id, {
		onDelete: "set null",
	}),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});
