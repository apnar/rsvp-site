import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { gym } from "./gym";

/** A venue permit PDF, stored in the PERMITS R2 bucket under `r2Key`. */
export const permit = sqliteTable("permit", {
	id: text("id").primaryKey(),
	/** Shown on the schedule, e.g. "Garden Room, Sep 12 - 26". */
	label: text("label").notNull(),
	r2Key: text("r2_key").notNull(),
	fileName: text("file_name").notNull(),
	contentType: text("content_type").notNull(),
	size: integer("size").notNull(),
	uploadedBy: text("uploaded_by").references(() => user.id, {
		onDelete: "set null",
	}),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
});

/**
 * Which venues a permit covers. One piece of paper often covers two venues
 * for the same season, and a venue collects permits over time,
 * so this is a set on both sides rather than a column on either.
 *
 * Coverage is paperwork, not a booking: deleting either end just drops the
 * rows here, which is why both sides cascade. A game keeps whatever permit
 * it was attached to regardless of what this table says.
 */
export const permitGym = sqliteTable(
	"permit_gym",
	{
		permitId: text("permit_id")
			.notNull()
			.references(() => permit.id, { onDelete: "cascade" }),
		gymId: text("gym_id")
			.notNull()
			.references(() => gym.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({ columns: [table.permitId, table.gymId] }),
		index("permit_gym_gym_idx").on(table.gymId),
	],
);
