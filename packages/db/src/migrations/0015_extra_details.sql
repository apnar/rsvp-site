-- Details only for the invite page. `details` goes everywhere the invitation
-- does (page, emails, printed cards); `extra_details` is shown only to guests
-- who open the invite, so a gate code or a parking note isn't printed or
-- forwarded in an email.
ALTER TABLE `event` ADD `extra_details` text DEFAULT '' NOT NULL;