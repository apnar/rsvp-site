-- Paper invitations. An event can be printed instead of emailed: each guest
-- gets a card with a QR code carrying `event_guest.paper_token`, and guest
-- email is held until `event.emails_released_at`. Paper guests may have no
-- email at all (`user.no_email`, with a placeholder address).
ALTER TABLE `user` ADD `no_email` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `paper` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `emails_released_at` integer;--> statement-breakpoint
ALTER TABLE `event_guest` ADD `paper_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `event_guest_paper_token_unique` ON `event_guest` (`paper_token`);