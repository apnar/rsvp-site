-- Who typed a person's number. drizzle-kit wrote the reference without an
-- ON DELETE (as it did for created_by in 0026), which would block erasing
-- any host who ever typed one; and the unclaimed numbers already here were
-- typed by whoever made the record, so they are stamped that way, which
-- is what keeps "text me my link" from sending a host-typed number a way
-- into somebody else's account.
ALTER TABLE `user` ADD `phone_by` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
UPDATE `user` SET `phone_by` = `created_by` WHERE `phone` IS NOT NULL AND `claimed_at` IS NULL AND `created_by` IS NOT NULL;
