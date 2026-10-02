-- The RSVP cycle replaces "an admin clicks Announce". A run now asks the list
-- on a fixed clock -- the evening before, twice on game day if the count is
-- short -- and decides itself at 7:30. So the two things the old flow recorded
-- on `game` become five per-stage stamps and a status, and an answer stops
-- being a boolean: `maybe` is the game-time decision this run always had.
--
-- Hand-edited after `drizzle-kit generate`, the way 0004, 0005 and 0006 were.
-- The tool wants to rebuild `rsvp` to swap `is_in` for `response`, which would
-- drop every answer on the way through. Nothing indexes `is_in`, so SQLite is
-- happy to add, backfill and drop in place instead.

-- 1. Two states become three. `in` and `out` are the old booleans; `maybe`
--    only ever arrives from the new flow.
ALTER TABLE `rsvp` ADD `response` text DEFAULT 'in' NOT NULL;--> statement-breakpoint
UPDATE `rsvp` SET `response` = CASE WHEN `is_in` = 1 THEN 'in' ELSE 'out' END;--> statement-breakpoint
ALTER TABLE `rsvp` DROP COLUMN `is_in`;--> statement-breakpoint

-- 2. Who typed a guest name in. It decides who may change that guest's answer,
--    and it is the only way to reach a guest when the run is called off --
--    they have no inbox, so we tell whoever put them on the sheet. Null on
--    every row that predates this, which is honest: we do not know.
ALTER TABLE `rsvp` ADD `added_by` text REFERENCES user(id);--> statement-breakpoint

-- 3. The decision, and one "resolved" stamp per stage. Resolved means sent OR
--    deliberately skipped -- a stage skipped for not meeting its condition is
--    stamped too, or the job retries it every half hour until midnight.
--    `email_send` is the record of what actually went out. `last_email_at` is
--    bumped only by a real send, because the spacing rule between emails is
--    about inboxes, not bookkeeping.
ALTER TABLE `game` ADD `status` text DEFAULT 'scheduled' NOT NULL;--> statement-breakpoint
ALTER TABLE `game` ADD `call_at` integer;--> statement-breakpoint
ALTER TABLE `game` ADD `nudge_at` integer;--> statement-breakpoint
ALTER TABLE `game` ADD `confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `game` ADD `last_call_at` integer;--> statement-breakpoint
ALTER TABLE `game` ADD `decided_at` integer;--> statement-breakpoint
ALTER TABLE `game` ADD `last_email_at` integer;--> statement-breakpoint

-- 4. Every game the old flow already touched, and every game already played,
--    is settled: stamp all five stages so the new job never emails about it.
--    A future game nobody announced yet is deliberately left alone -- the
--    cycle picks it up the evening before, which is the whole point.
--
--    `date('now')` is UTC, so a game dated today in the gym's timezone can
--    look like tomorrow's here for five hours after midnight ET. That errs
--    toward leaving a row alone, which is the safe direction: an unstamped
--    game gets emailed, a wrongly stamped one goes silent. Check after
--    applying:
--      select id, date, status, call_at from game where date >= date('now');
UPDATE `game` SET
	`call_at`      = coalesce(`announced_at`, `reminder_sent_at`, `created_at`),
	`nudge_at`     = coalesce(`reminder_sent_at`, `announced_at`, `created_at`),
	`confirmed_at` = `reminder_sent_at`,
	`last_call_at` = coalesce(`reminder_sent_at`, `announced_at`, `created_at`),
	`decided_at`   = coalesce(`reminder_sent_at`, `announced_at`, `created_at`),
	`status`       = 'confirmed'
WHERE `date` < date('now')
   OR `announced_at` IS NOT NULL
   OR `reminder_sent_at` IS NOT NULL;--> statement-breakpoint

-- 5. The dead columns go. Their history lives in `email_send`, which has kept
--    one row per send, with the game id, since 0003.
ALTER TABLE `game` DROP COLUMN `announced_at`;--> statement-breakpoint
ALTER TABLE `game` DROP COLUMN `reminder_sent_at`;
