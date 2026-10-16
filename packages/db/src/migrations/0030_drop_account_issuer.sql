-- Better Auth 1.7.0 through 1.7.2 wanted an `issuer` on every account row;
-- 1.7.3 went back to the 1.6 shape and 1.7.10 refuses to start while the
-- Drizzle schema still requires it. Only the password door writes this
-- table, so the Worker running during the minute between this migration
-- and its deploy can at worst fail one password sign-in or password set.
DROP INDEX `account_issuer_accountId_uidx`;--> statement-breakpoint
ALTER TABLE `account` DROP COLUMN `issuer`;
