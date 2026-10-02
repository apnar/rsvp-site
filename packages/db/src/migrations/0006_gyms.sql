-- Gyms become a thing instead of a string. `game.location` was free text
-- retyped for every booking; it is now `game.gym_id` pointing at a `gym` row
-- that also carries the address and the "park by the side door" note, and a
-- permit records which courts it covers.
--
-- Hand-edited after `drizzle-kit generate`, the way 0004 and 0005 were: the
-- tool writes the two new tables and the indexes, the data move and the
-- rebuild of `game` in the middle are ours. drizzle-kit's own line for the
-- new column is `ALTER TABLE game ADD gym_id text NOT NULL REFERENCES
-- gym(id)`, which SQLite refuses outright -- a NOT NULL column has to arrive
-- with a constant default, and a REFERENCES column's default has to be NULL.
-- So `game` gets the 12-step rebuild instead.

-- 1. The new tables.
CREATE TABLE `gym` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gym_name_unique` ON `gym` (`name`);--> statement-breakpoint
CREATE TABLE `permit_gym` (
	`permit_id` text NOT NULL,
	`gym_id` text NOT NULL,
	PRIMARY KEY(`permit_id`, `gym_id`),
	FOREIGN KEY (`permit_id`) REFERENCES `permit`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gym_id`) REFERENCES `gym`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `permit_gym_gym_idx` ON `permit_gym` (`gym_id`);--> statement-breakpoint

-- 2. One gym per distinct court we have ever booked. `address` is left empty
--    on purpose: `location` was a name ("Shady Grove Middle School") and
--    never an address, and inventing one is worse than admitting we do not
--    have it. The Gyms tab flags every empty address until somebody types
--    the real one in. `created_at` is the first booking there, which is as
--    close to "when did this court join the rotation" as the data gets.
INSERT INTO `gym` (`id`, `name`, `address`, `created_at`, `updated_at`)
SELECT
	lower(hex(randomblob(16))),
	`location`,
	'',
	min(`created_at`),
	min(`created_at`)
FROM `game`
GROUP BY `location`;--> statement-breakpoint

-- 3. `rsvp` and `email_send` both point at `game`, so dropping it below takes
--    them with it: rsvp rows cascade away, email_send rows have their game
--    forgotten. The usual guard is `PRAGMA foreign_keys=OFF`, and it is a
--    silent no-op inside a transaction -- exactly the case we cannot rule out
--    from here, since it depends on how wrangler hands the file to D1. So the
--    children are copied out first and put back in step 6 instead. If the
--    pragma-less path is the one that ran, this is what saved the headcount;
--    if foreign keys were off after all, step 6 finds nothing to do.
CREATE TABLE `rsvp_gym_backup` AS SELECT * FROM `rsvp`;--> statement-breakpoint
CREATE TABLE `email_send_gym_backup` AS
	SELECT `id`, `game_id` FROM `email_send` WHERE `game_id` IS NOT NULL;--> statement-breakpoint

-- 4. Rebuild `game` around `gym_id`. The join is LEFT on purpose: step 2 made
--    a gym for every location, so it always matches, and if it somehow does
--    not the NOT NULL column stops the migration dead. An inner join would
--    quietly drop that game instead, which is the one outcome nobody wants.
CREATE TABLE `__new_game` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text,
	`gym_id` text NOT NULL,
	`notes` text,
	`permit_id` text,
	`created_by` text,
	`announced_at` integer,
	`reminder_sent_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`gym_id`) REFERENCES `gym`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`permit_id`) REFERENCES `permit`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_game` (
	`id`, `date`, `start_time`, `end_time`, `gym_id`, `notes`, `permit_id`,
	`created_by`, `announced_at`, `reminder_sent_at`, `created_at`, `updated_at`
)
SELECT
	g.`id`, g.`date`, g.`start_time`, g.`end_time`, y.`id`, g.`notes`,
	g.`permit_id`, g.`created_by`, g.`announced_at`, g.`reminder_sent_at`,
	g.`created_at`, g.`updated_at`
FROM `game` g
LEFT JOIN `gym` y ON y.`name` = g.`location`;--> statement-breakpoint
DROP TABLE `game`;--> statement-breakpoint
ALTER TABLE `__new_game` RENAME TO `game`;--> statement-breakpoint

-- 5. The indexes went with the old table.
CREATE UNIQUE INDEX `game_date_time_uidx` ON `game` (`date`,`start_time`);--> statement-breakpoint
CREATE INDEX `game_date_idx` ON `game` (`date`);--> statement-breakpoint
CREATE INDEX `game_gym_idx` ON `game` (`gym_id`);--> statement-breakpoint

-- 6. Put the children back if the drop took them. Both are no-ops when it
--    did not: the headcount is keyed by id, and only a send whose game was
--    nulled out gets it back.
INSERT INTO `rsvp` (
	`id`, `game_id`, `name`, `name_key`, `is_in`, `user_id`, `created_at`, `updated_at`
)
SELECT
	`id`, `game_id`, `name`, `name_key`, `is_in`, `user_id`, `created_at`, `updated_at`
FROM `rsvp_gym_backup` b
WHERE NOT EXISTS (SELECT 1 FROM `rsvp` r WHERE r.`id` = b.`id`);--> statement-breakpoint
UPDATE `email_send` SET `game_id` = (
	SELECT b.`game_id` FROM `email_send_gym_backup` b WHERE b.`id` = `email_send`.`id`
)
WHERE `game_id` IS NULL
  AND EXISTS (SELECT 1 FROM `email_send_gym_backup` b WHERE b.`id` = `email_send`.`id`);--> statement-breakpoint
DROP TABLE `rsvp_gym_backup`;--> statement-breakpoint
DROP TABLE `email_send_gym_backup`;
