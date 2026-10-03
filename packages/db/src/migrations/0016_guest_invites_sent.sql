ALTER TABLE `event_guest` ADD `invites_sent` integer DEFAULT 0 NOT NULL;
-- Invitations already out count against their guest's cap from the start.
UPDATE `event_guest` SET `invites_sent` = (
	SELECT count(*) FROM `event_guest` AS `f`
	WHERE `f`.`event_id` = `event_guest`.`event_id`
		AND `f`.`added_by` = `event_guest`.`user_id`
		AND `f`.`source` = 'guest'
);
