-- Text messages: who may be texted and how they want to hear from us,
-- numbers that said STOP, one row per text sent, and the short /t/ links.
-- Additive only. drizzle-kit wrote texts_ok_by's reference without its
-- ON DELETE, which would make erasing a host who vouched for somebody fail.
CREATE TABLE `sms_block` (
	`phone` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sms_send` (
	`id` text PRIMARY KEY NOT NULL,
	`telnyx_id` text,
	`kind` text NOT NULL,
	`event_id` text,
	`user_id` text,
	`phone` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error_code` text,
	`error` text,
	`parts` integer DEFAULT 1 NOT NULL,
	`media` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sms_send_telnyx_id_unique` ON `sms_send` (`telnyx_id`);--> statement-breakpoint
CREATE INDEX `sms_send_event_user_idx` ON `sms_send` (`event_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `sms_send_phone_idx` ON `sms_send` (`phone`,`created_at`);--> statement-breakpoint
CREATE TABLE `text_link` (
	`code` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`path` text NOT NULL,
	`link_token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `text_link_user_path_uidx` ON `text_link` (`user_id`,`path`);--> statement-breakpoint
ALTER TABLE `user` ADD `contact_by` text;--> statement-breakpoint
ALTER TABLE `user` ADD `alerts_by` text;--> statement-breakpoint
ALTER TABLE `user` ADD `texts_ok_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `texts_ok_by` text REFERENCES `user`(`id`) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `user` ADD `texts_off_at` integer;--> statement-breakpoint
ALTER TABLE `event` ADD `card_mms_key` text;--> statement-breakpoint
ALTER TABLE `event` ADD `cover_mms_key` text;--> statement-breakpoint
ALTER TABLE `event_guest` ADD `invited_via` text;