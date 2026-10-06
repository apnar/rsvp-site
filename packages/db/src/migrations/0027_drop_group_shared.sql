-- The second step for contact_group.shared: unused since 0019 put sharing
-- in contact_group_share, and unnamed by the code since the deploy before
-- this one, so the Worker running while CI migrates never touches it.
ALTER TABLE `contact_group` DROP COLUMN `shared`;