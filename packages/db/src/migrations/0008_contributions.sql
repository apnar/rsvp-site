-- Sean fronts the gym rental; this is the bill going the other way. Two
-- tables rather than one because a call for money and a person's answer to
-- it are different lifetimes: `contribution_call` is the ask (subject, body,
-- amount, how to pay) and `contribution` is the ledger, one row per person
-- billed. The ledger is a snapshot of who was asked, not a live view of the
-- roster -- it is written once, at send time, from `listRecipients(db,
-- "active")`, so somebody added next week does not retroactively owe for a
-- gym they never played in, and somebody who leaves the list mid-call still
-- shows up until an admin says otherwise.
--
-- `contribution_call_open_uidx` is on the EXPRESSION `(closed_at is null)`,
-- not on the column: SQLite treats NULLs as distinct from each other in a
-- unique index, so `UNIQUE(closed_at)` would let any number of open calls
-- coexist (every one of them null) and enforce nothing. This index is the
-- backstop for the double-click that the router's "a call is already open"
-- check in words cannot catch.
--
-- As with the RSVP cycle, `email_send` stays the one record of what mail
-- actually went out; `contribution_call.send_id` just points at it.
CREATE TABLE `contribution` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'unpaid' NOT NULL,
	`marked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`call_id`) REFERENCES `contribution_call`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contribution_call_user_uidx` ON `contribution` (`call_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `contribution_user_idx` ON `contribution` (`user_id`);--> statement-breakpoint
CREATE TABLE `contribution_call` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`amount` integer NOT NULL,
	`instructions` text NOT NULL,
	`send_id` text,
	`opened_by` text,
	`opened_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`last_reminded_at` integer,
	`closed_at` integer,
	FOREIGN KEY (`send_id`) REFERENCES `email_send`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`opened_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `contribution_call_opened_idx` ON `contribution_call` (`opened_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `contribution_call_open_uidx` ON `contribution_call` (("closed_at" is null)) WHERE "contribution_call"."closed_at" is null;