-- Guests the host invited may invite a few others, if the event allows it.
-- The new `event_guest.source` value 'guest' needs no change here: the
-- column is plain text, and the enum lives in the Drizzle schema. Who
-- brought a guest-added row is `added_by`, which already exists.
ALTER TABLE `event` ADD `guest_invites` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `event` ADD `guest_invite_limit` integer DEFAULT 3 NOT NULL;