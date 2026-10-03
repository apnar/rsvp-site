ALTER TABLE `user` ADD `first_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `last_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `user` ADD `address_line1` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `address_line2` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `city` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `region` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `postal_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `country` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `claimed_at` integer;--> statement-breakpoint
-- Names split at the last space: rtrim with every non-space character of
-- the name strips back to that space. One word, or a household ("The
-- Parks"), is all first name. A name that is only the address's local part
-- was never typed by anybody, so it splits into nothing.
UPDATE `user` SET
	`first_name` = CASE
		WHEN lower(trim(`name`)) LIKE 'the %' OR instr(trim(`name`), ' ') = 0
			THEN trim(`name`)
		ELSE trim(rtrim(trim(`name`), replace(trim(`name`), ' ', '')))
	END,
	`last_name` = CASE
		WHEN lower(trim(`name`)) LIKE 'the %' OR instr(trim(`name`), ' ') = 0
			THEN ''
		ELSE substr(trim(`name`), length(rtrim(trim(`name`), replace(trim(`name`), ' ', ''))) + 1)
	END
WHERE trim(`name`) <> ''
	AND `name` <> substr(`email`, 1, instr(`email`, '@') - 1);
--> statement-breakpoint
-- Somebody who has ever had a session, or set a password, has signed in.
UPDATE `user` SET `claimed_at` = coalesce(
	(SELECT min(`created_at`) FROM `session` WHERE `session`.`user_id` = `user`.`id`),
	(SELECT min(`created_at`) FROM `account` WHERE `account`.`user_id` = `user`.`id` AND `account`.`password` IS NOT NULL)
);
