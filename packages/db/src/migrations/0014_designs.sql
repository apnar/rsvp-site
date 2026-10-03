-- Invitation designs. An event can carry a host-built card (event_design,
-- a JSON document validated by @rsvp-site/design) that, while design_on is
-- set, replaces the cover on the guest page, the paper cards and the emails.
-- card_key is the card drawn once as a JPEG for emails and link previews,
-- card_basis what it was drawn from, theme a copy of the page colours so
-- reads of an event row needn't load the document. Images live in R2 under
-- designs/<event_id>/.
CREATE TABLE `event_design` (
	`event_id` text PRIMARY KEY NOT NULL,
	`doc` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `event` ADD `design_on` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `card_key` text;--> statement-breakpoint
ALTER TABLE `event` ADD `card_basis` text;--> statement-breakpoint
ALTER TABLE `event` ADD `theme` text;