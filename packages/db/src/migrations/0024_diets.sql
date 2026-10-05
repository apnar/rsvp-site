ALTER TABLE `user` ADD `diets` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `diet_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `diet_at` integer;--> statement-breakpoint
ALTER TABLE `event_guest` ADD `party_diet` text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Diets move from each answer to the person: whatever they last typed on
-- an invitation becomes their note. `diet_at` stays null, so the next
-- answer shows them the boxes to tick instead of asking "still right?".
UPDATE `user` SET `diet_note` = (
	SELECT eg.`dietary` FROM `event_guest` eg
	WHERE eg.`user_id` = `user`.`id` AND eg.`dietary` <> ''
	ORDER BY eg.`responded_at` DESC LIMIT 1
)
WHERE EXISTS (
	SELECT 1 FROM `event_guest` eg
	WHERE eg.`user_id` = `user`.`id` AND eg.`dietary` <> ''
);
