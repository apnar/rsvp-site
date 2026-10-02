CREATE TABLE `rsvp` (
	`id` text PRIMARY KEY NOT NULL,
	`week_of` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`is_in` integer DEFAULT true NOT NULL,
	`user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rsvp_week_name_uidx` ON `rsvp` (`week_of`,`name_key`);--> statement-breakpoint
CREATE INDEX `rsvp_week_idx` ON `rsvp` (`week_of`);