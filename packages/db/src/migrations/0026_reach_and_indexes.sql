-- Who typed each person in (`user.created_by`): until they sign in, only
-- that host may change their address or number, which is where sign-in
-- links go. Telnyx event ids already acted on, so a redelivered webhook
-- is a no-op. Indexes for phone lookups and for the SET NULLs a person's
-- delete runs.
-- Additive only. drizzle-kit wrote created_by's reference without its ON
-- DELETE, which would make erasing whoever created somebody fail.
-- The backfill credits each host-added person to the host who first put
-- them in an address book, the nearest record of who typed them in.
CREATE TABLE `telnyx_event` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `user` ADD `created_by` text REFERENCES `user`(`id`) ON DELETE set null;--> statement-breakpoint
UPDATE `user` SET `created_by` = (
	SELECT `c`.`owner_id` FROM `contact` `c`
	WHERE `c`.`user_id` = `user`.`id` AND `c`.`owner_id` != `user`.`id`
	ORDER BY `c`.`created_at`, `c`.`owner_id` LIMIT 1
) WHERE `source` = 'host' AND `created_by` IS NULL;--> statement-breakpoint
CREATE INDEX `user_phone_idx` ON `user` (`phone`);--> statement-breakpoint
CREATE INDEX `user_created_by_idx` ON `user` (`created_by`);--> statement-breakpoint
CREATE INDEX `user_texts_ok_by_idx` ON `user` (`texts_ok_by`);--> statement-breakpoint
CREATE INDEX `event_guest_added_by_idx` ON `event_guest` (`added_by`);--> statement-breakpoint
CREATE INDEX `event_guest_answered_by_idx` ON `event_guest` (`answered_by`);--> statement-breakpoint
CREATE INDEX `sms_send_user_idx` ON `sms_send` (`user_id`);
