-- Events replace the weekly run. Games, gyms, permits, the RSVP sheet, the
-- invite snapshot and gym money all go; an event now carries its own guest
-- list (`event_guest`, which is the invitation and the answer in one row),
-- its hosts, a potluck and its email settings, and hosts keep contact
-- groups. Suspensions go too: not wanting mail is `unsubscribed_at` now,
-- which leaves the account working.
--
-- Hand-edited after `drizzle-kit generate`, like 0004-0007:
-- * The drops run children first. drizzle-kit wrote them alphabetically,
--   which drops `gym` while `game` still points at it with ON DELETE
--   RESTRICT, and `game` while `email_send` still points at it.
-- * `email_send` is rebuilt before `game` goes, and the copy writes NULL for
--   the new `event_id` -- the generated INSERT selected an `event_id` the old
--   table never had. Only admin messages are kept: the other old kinds were
--   cycle and gym-money mail about games that no longer exist.
-- * No `PRAGMA foreign_keys=OFF`. D1 runs a migration in a transaction,
--   where that pragma is a no-op, and nothing references `email_send` once
--   `contribution_call` is gone, so the rebuild needs no help.
-- * Suspended people come back as active. A break meant "not now" on a
--   weekly run; an invitation is one event at a time, and "Can't" covers it.

CREATE TABLE `contact_group` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_group_owner_idx` ON `contact_group` (`owner_id`);
--> statement-breakpoint
CREATE TABLE `contact_group_member` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `contact_group`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_group_member_user_idx` ON `contact_group_member` (`user_id`);
--> statement-breakpoint
CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`share_token` text NOT NULL,
	`title` text NOT NULL,
	`host_line` text DEFAULT '' NOT NULL,
	`date` text,
	`start_time` text,
	`end_time` text,
	`location` text DEFAULT '' NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`cover_key` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`rsvp_deadline` text,
	`max_plus_ones` integer DEFAULT 4 NOT NULL,
	`ask_kids` integer DEFAULT true NOT NULL,
	`ask_dietary` integer DEFAULT true NOT NULL,
	`ask_note` integer DEFAULT true NOT NULL,
	`potluck_enabled` integer DEFAULT false NOT NULL,
	`show_guest_names` integer DEFAULT true NOT NULL,
	`share_enabled` integer DEFAULT false NOT NULL,
	`remind_deadline` integer DEFAULT true NOT NULL,
	`remind_days_before` integer DEFAULT 3 NOT NULL,
	`remind_day_before` integer DEFAULT true NOT NULL,
	`notify_changes` integer DEFAULT true NOT NULL,
	`host_alerts` text DEFAULT 'daily' NOT NULL,
	`published_at` integer,
	`deadline_reminder_at` integer,
	`day_before_at` integer,
	`digest_at` integer,
	`canceled_at` integer,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_share_token_unique` ON `event` (`share_token`);
--> statement-breakpoint
CREATE INDEX `event_date_idx` ON `event` (`date`);
--> statement-breakpoint
CREATE INDEX `event_status_idx` ON `event` (`status`);
--> statement-breakpoint
CREATE TABLE `event_guest` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source` text DEFAULT 'host' NOT NULL,
	`response` text,
	`adults` integer DEFAULT 1 NOT NULL,
	`kids` integer DEFAULT 0 NOT NULL,
	`dietary` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`invited_at` integer,
	`responded_at` integer,
	`nudged_at` integer,
	`added_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_guest_event_user_uidx` ON `event_guest` (`event_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `event_guest_user_idx` ON `event_guest` (`user_id`);
--> statement-breakpoint
CREATE TABLE `event_host` (
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`is_owner` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`event_id`, `user_id`),
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_host_user_idx` ON `event_host` (`user_id`);
--> statement-breakpoint
CREATE TABLE `potluck_claim` (
	`item_id` text NOT NULL,
	`guest_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`item_id`, `guest_id`),
	FOREIGN KEY (`item_id`) REFERENCES `potluck_item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guest_id`) REFERENCES `event_guest`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `potluck_claim_guest_idx` ON `potluck_claim` (`guest_id`);
--> statement-breakpoint
CREATE TABLE `potluck_item` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`label` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `potluck_item_event_idx` ON `potluck_item` (`event_id`);
--> statement-breakpoint
DROP TABLE `contribution`;
--> statement-breakpoint
DROP TABLE `contribution_call`;
--> statement-breakpoint
DROP TABLE `game_invite`;
--> statement-breakpoint
DROP TABLE `rsvp`;
--> statement-breakpoint
DROP TABLE `permit_gym`;
--> statement-breakpoint
CREATE TABLE `__new_email_send` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`event_id` text,
	`subject` text NOT NULL,
	`audience` text DEFAULT 'everyone' NOT NULL,
	`recipient_count` integer NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`message_ids` text DEFAULT '[]' NOT NULL,
	`errors` text DEFAULT '[]' NOT NULL,
	`sent_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sent_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_email_send`("id", "kind", "event_id", "subject", "audience", "recipient_count", "failed_count", "message_ids", "errors", "sent_by", "created_at") SELECT "id", "kind", NULL, "subject", 'everyone', "recipient_count", "failed_count", "message_ids", "errors", "sent_by", "created_at" FROM `email_send` WHERE "kind" = 'message';
--> statement-breakpoint
DROP TABLE `email_send`;
--> statement-breakpoint
ALTER TABLE `__new_email_send` RENAME TO `email_send`;
--> statement-breakpoint
CREATE INDEX `email_send_event_idx` ON `email_send` (`event_id`);
--> statement-breakpoint
DROP TABLE `game`;
--> statement-breakpoint
DROP TABLE `permit`;
--> statement-breakpoint
DROP TABLE `gym`;
--> statement-breakpoint
UPDATE `user` SET `status` = 'active' WHERE `status` = 'suspended';
--> statement-breakpoint
DROP INDEX `user_status_idx`;
--> statement-breakpoint
ALTER TABLE `user` ADD `unsubscribed_at` integer;
--> statement-breakpoint
ALTER TABLE `user` ADD `unsubscribe_reason` text;
--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `suspended_until`;
--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `status_reason`;
