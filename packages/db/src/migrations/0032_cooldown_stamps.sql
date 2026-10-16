-- Three claims for things that send: a guest's answer alerting the hosts
-- (event_guest.alerted_at), a save telling the guests about a change
-- (event.change_notice_at), and a confirmation link mailed to an address
-- somebody typed (email_ask). Each is stamped in the statement that
-- decides to send, so a repeat inside the cooldown sends nothing.
CREATE TABLE `email_ask` (
	`email` text PRIMARY KEY NOT NULL,
	`asked_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `event` ADD `change_notice_at` integer;--> statement-breakpoint
ALTER TABLE `event_guest` ADD `alerted_at` integer;
