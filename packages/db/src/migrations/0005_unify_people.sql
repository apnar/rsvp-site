-- `subscriber` folds into `user`. One row per person: the mailing list, the
-- roster and the accounts stop being three different answers to "who plays?".
--
-- Hand-edited after `drizzle-kit generate`, the way 0004 was: the tool writes
-- the ALTERs, the indexes and the DROP, and the data move in the middle is
-- ours. Order matters -- tokens land before their unique indexes exist, and
-- `subscriber` is not dropped until everything has been read out of it.

-- 1. The new columns. Both tokens go on nullable and get their unique index
--    at the bottom, because SQLite cannot ADD a UNIQUE column at all; `source`
--    and `status` carry literal defaults, because it cannot ADD a NOT NULL one
--    without a constant. Keeping every ALTER legal is what stops drizzle-kit
--    from falling back to rebuilding `user`, which five tables have FKs into.
ALTER TABLE `user` ADD `link_token` text;--> statement-breakpoint
ALTER TABLE `user` ADD `link_sent_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `unsubscribe_token` text;--> statement-breakpoint
ALTER TABLE `user` ADD `source` text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `suspended_until` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `status_reason` text;--> statement-breakpoint
ALTER TABLE `user` ADD `status_changed_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `status_changed_by` text;--> statement-breakpoint
ALTER TABLE `email_send` ADD `audience` text DEFAULT 'active' NOT NULL;--> statement-breakpoint

-- 2. Addresses become case-insensitive keys, since that is what every lookup
--    already assumes: `subscriber.email` was lower-cased on the way in and
--    Better Auth lower-cases the needle but compares with `=`. In practice a
--    no-op -- every account was created from a subscriber row. If two accounts
--    somehow differ only by case this trips `user_email_unique` and stops the
--    migration, which is the right answer: that pair needs a person, not SQL.
UPDATE `user` SET `email` = lower(`email`) WHERE `email` <> lower(`email`);--> statement-breakpoint

-- 3. Carry each subscriber's tokens onto the account it belongs to, matching
--    on the address first. The address is what the emails went to and what
--    every sign-in path resolves on; `user_id` is only ever set by a link
--    click afterwards. Both columns are unique, so this matches at most once.
--    The unsubscribe token especially has to survive: it is already printed in
--    every email sitting in every inbox, and those links must keep working.
UPDATE `user` SET
	`link_token` = s.`link_token`,
	`link_sent_at` = s.`link_sent_at`,
	`unsubscribe_token` = s.`unsubscribe_token`,
	`source` = s.`source`,
	`created_at` = min(`user`.`created_at`, s.`created_at`),
	`status` = CASE WHEN s.`status` = 'unsubscribed' THEN 'suspended' ELSE 'active' END,
	`status_reason` = CASE WHEN s.`status` = 'unsubscribed'
		THEN 'Unsubscribed from the emails, back when that was a thing you could do on its own.' END,
	`status_changed_at` = CASE WHEN s.`status` = 'unsubscribed'
		THEN coalesce(s.`unsubscribed_at`, s.`updated_at`) END,
	`status_changed_by` = CASE WHEN s.`status` = 'unsubscribed' THEN 'self' END
FROM `subscriber` s
WHERE s.`email` = `user`.`email`;--> statement-breakpoint

-- 4. The rare leftover: a subscriber row filed under one address that points
--    at an account under another. Only fills accounts step 3 did not touch,
--    and picks one row deterministically if there is somehow more than one.
UPDATE `user` SET
	`link_token` = s.`link_token`,
	`link_sent_at` = s.`link_sent_at`,
	`unsubscribe_token` = s.`unsubscribe_token`,
	`source` = s.`source`,
	`status` = CASE WHEN s.`status` = 'unsubscribed' THEN 'suspended' ELSE 'active' END,
	`status_reason` = CASE WHEN s.`status` = 'unsubscribed'
		THEN 'Unsubscribed from the emails, back when that was a thing you could do on its own.' END,
	`status_changed_at` = CASE WHEN s.`status` = 'unsubscribed'
		THEN coalesce(s.`unsubscribed_at`, s.`updated_at`) END,
	`status_changed_by` = CASE WHEN s.`status` = 'unsubscribed' THEN 'self' END
FROM `subscriber` s
WHERE s.`user_id` = `user`.`id`
  AND `user`.`link_token` IS NULL
  AND s.`id` = (
	SELECT s2.`id` FROM `subscriber` s2
	WHERE s2.`user_id` = `user`.`id`
	ORDER BY s2.`created_at` ASC, s2.`id` ASC
	LIMIT 1
  );--> statement-breakpoint

-- 5. Subscribers who never clicked a link had no account at all. They get one
--    now: this is what /api/auth/link used to do on the first click, done up
--    front instead. `name` is NOT NULL, so fall back to the local part of the
--    address the same way that endpoint did. `email_verified` stays 0 -- the
--    address is still unproven, and the first click flips it.
INSERT INTO `user` (
	`id`, `name`, `email`, `email_verified`, `role`, `banned`,
	`created_at`, `updated_at`,
	`link_token`, `link_sent_at`, `unsubscribe_token`, `source`,
	`status`, `status_reason`, `status_changed_at`, `status_changed_by`
)
SELECT
	s.`id`,
	coalesce(
		nullif(trim(s.`name`), ''),
		nullif(substr(s.`email`, 1, instr(s.`email`, '@') - 1), ''),
		s.`email`
	),
	s.`email`,
	0,
	'user',
	0,
	s.`created_at`,
	s.`updated_at`,
	s.`link_token`,
	s.`link_sent_at`,
	s.`unsubscribe_token`,
	s.`source`,
	CASE WHEN s.`status` = 'unsubscribed' THEN 'suspended' ELSE 'active' END,
	CASE WHEN s.`status` = 'unsubscribed'
		THEN 'Unsubscribed from the emails, back when that was a thing you could do on its own.' END,
	CASE WHEN s.`status` = 'unsubscribed'
		THEN coalesce(s.`unsubscribed_at`, s.`updated_at`) END,
	CASE WHEN s.`status` = 'unsubscribed' THEN 'self' END
FROM `subscriber` s
WHERE NOT EXISTS (SELECT 1 FROM `user` u WHERE u.`email` = s.`email`)
  AND NOT EXISTS (SELECT 1 FROM `user` u WHERE u.`link_token` = s.`link_token`);--> statement-breakpoint

-- 6. Accounts that had no subscriber row at all. Almost certainly somebody an
--    admin took off the list with the old Remove, which deleted the row and
--    with it their way in. They are left active rather than deactivated --
--    guessing wrong here either emails somebody who was shown the door or
--    locks out a regular, and only a human knows which. Check for them after
--    migrating: `select email from user where link_sent_at is null`.
UPDATE `user` SET `link_token` = lower(hex(randomblob(16)))
	WHERE `link_token` IS NULL;--> statement-breakpoint
UPDATE `user` SET `unsubscribe_token` = lower(hex(randomblob(16)))
	WHERE `unsubscribe_token` IS NULL;--> statement-breakpoint

CREATE UNIQUE INDEX `user_link_token_unique` ON `user` (`link_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_unsubscribe_token_unique` ON `user` (`unsubscribe_token`);--> statement-breakpoint
CREATE INDEX `user_status_idx` ON `user` (`status`);--> statement-breakpoint
DROP TABLE `subscriber`;
