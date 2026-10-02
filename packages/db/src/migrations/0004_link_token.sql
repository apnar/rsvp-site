ALTER TABLE `subscriber` ADD `link_token` text;--> statement-breakpoint
ALTER TABLE `subscriber` ADD `link_sent_at` integer;--> statement-breakpoint
UPDATE subscriber SET link_token = lower(hex(randomblob(16))) WHERE link_token IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `subscriber_link_token_unique` ON `subscriber` (`link_token`);
