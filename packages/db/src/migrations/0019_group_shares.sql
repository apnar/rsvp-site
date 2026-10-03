-- Contact groups are shared with chosen hosts rather than all of them.
-- A group already shared goes to everybody who may host today, so nobody
-- loses a group from their picker; `contact_group.shared` stays, unread,
-- until a later migration drops it. Additive only.
CREATE TABLE `contact_group_share` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `contact_group`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_group_share_user_idx` ON `contact_group_share` (`user_id`);--> statement-breakpoint
INSERT INTO `contact_group_share` (`group_id`, `user_id`)
SELECT g.`id`, u.`id` FROM `contact_group` g, `user` u
WHERE g.`shared` = 1 AND u.`id` <> g.`owner_id`
  AND u.`role` IN ('host', 'admin') AND u.`status` <> 'deactivated';
