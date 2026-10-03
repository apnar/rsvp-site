-- Families (admin-kept households whose members answer for each other),
-- shared contact groups, and who answered for whom. Additive only.
CREATE TABLE `family` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`shared` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `family_member` (
	`user_id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`child` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`family_id`) REFERENCES `family`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `family_member_family_idx` ON `family_member` (`family_id`);--> statement-breakpoint
ALTER TABLE `contact_group` ADD `shared` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- drizzle-kit leaves the ON DELETE off an added column: without it, deleting
-- anybody who once answered for a relative would fail on this reference.
ALTER TABLE `event_guest` ADD `answered_by` text REFERENCES `user`(`id`) ON DELETE SET NULL;
