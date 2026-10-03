-- Each host's address book. Backfilled from what already happened: whoever
-- a host put on one of their events (typed in, or from a group), and the
-- members of their groups. Friends a guest brought and share-link joiners
-- are not the host's invitations, so they do not come along.
CREATE TABLE `contact` (
	`owner_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`owner_id`, `user_id`),
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_user_idx` ON `contact` (`user_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `contact` (`owner_id`, `user_id`)
SELECT DISTINCT `added_by`, `user_id` FROM `event_guest`
WHERE `added_by` IS NOT NULL AND `source` IN ('host', 'group') AND `added_by` != `user_id`;
--> statement-breakpoint
INSERT OR IGNORE INTO `contact` (`owner_id`, `user_id`)
SELECT DISTINCT g.`owner_id`, m.`user_id`
FROM `contact_group_member` m JOIN `contact_group` g ON g.`id` = m.`group_id`
WHERE g.`owner_id` != m.`user_id`;
