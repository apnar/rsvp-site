-- A family's child answering for themselves now counts as a kid, as they
-- already did when a relative answered for them. Their own answers from
-- before had them among the adults (the form's adults started at 1), so
-- move that one person across. Answers a relative gave are 0 adults and
-- already a kid; ones a host recorded are left as the host typed them;
-- events that don't ask about kids count everybody as an adult.
UPDATE `event_guest`
SET `adults` = `adults` - 1, `kids` = `kids` + 1
WHERE `response` IN ('yes', 'maybe')
	AND `adults` >= 1
	AND `answered_by` IS NULL
	AND (`responded_via` IS NULL OR `responded_via` <> 'host')
	AND `user_id` IN (SELECT `user_id` FROM `family_member` WHERE `child` = 1)
	AND `event_id` IN (SELECT `id` FROM `event` WHERE `ask_kids` = 1);
