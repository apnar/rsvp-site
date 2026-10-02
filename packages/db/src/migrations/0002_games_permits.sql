CREATE TABLE `game` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text,
	`location` text NOT NULL,
	`notes` text,
	`permit_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`permit_id`) REFERENCES `permit`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_date_time_uidx` ON `game` (`date`,`start_time`);--> statement-breakpoint
CREATE INDEX `game_date_idx` ON `game` (`date`);--> statement-breakpoint
CREATE TABLE `permit` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`uploaded_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
-- rsvp is re-keyed from week_of to game_id. The table is empty in every
-- environment at this point, so it is simplest to rebuild it.
DROP TABLE `rsvp`;--> statement-breakpoint
CREATE TABLE `rsvp` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`is_in` integer DEFAULT true NOT NULL,
	`user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rsvp_game_name_uidx` ON `rsvp` (`game_id`,`name_key`);--> statement-breakpoint
CREATE INDEX `rsvp_game_idx` ON `rsvp` (`game_id`);--> statement-breakpoint
ALTER TABLE `session` ADD `impersonated_by` text;--> statement-breakpoint
ALTER TABLE `user` ADD `role` text;--> statement-breakpoint
ALTER TABLE `user` ADD `banned` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `user` ADD `ban_reason` text;--> statement-breakpoint
ALTER TABLE `user` ADD `ban_expires` integer;