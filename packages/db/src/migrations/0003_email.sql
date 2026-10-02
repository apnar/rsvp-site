CREATE TABLE `email_send` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`game_id` text,
	`subject` text NOT NULL,
	`recipient_count` integer NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`message_ids` text DEFAULT '[]' NOT NULL,
	`errors` text DEFAULT '[]' NOT NULL,
	`sent_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `game`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sent_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `email_send_game_idx` ON `email_send` (`game_id`);--> statement-breakpoint
CREATE TABLE `subscriber` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`status` text DEFAULT 'active' NOT NULL,
	`unsubscribed_at` integer,
	`unsubscribe_token` text NOT NULL,
	`source` text NOT NULL,
	`user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriber_email_unique` ON `subscriber` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscriber_unsubscribe_token_unique` ON `subscriber` (`unsubscribe_token`);--> statement-breakpoint
CREATE INDEX `subscriber_user_idx` ON `subscriber` (`user_id`);--> statement-breakpoint
CREATE INDEX `subscriber_status_idx` ON `subscriber` (`status`);--> statement-breakpoint
ALTER TABLE `game` ADD `announced_at` integer;--> statement-breakpoint
ALTER TABLE `game` ADD `reminder_sent_at` integer;