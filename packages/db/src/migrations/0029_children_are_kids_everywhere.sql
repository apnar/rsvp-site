-- A family's child is a kid whether or not the event asks about kids:
-- that question is how many kids a guest brings. 0028 recounted only
-- events that ask; on the rest, answers a child gave and answers a
-- relative gave for them both had the child among the adults, so move
-- that one person across. A host's recorded answer of one person and
-- no kids is the child alone, on any event; a host's bigger party is left
-- as the host typed it.
UPDATE `event_guest`
SET `adults` = `adults` - 1, `kids` = `kids` + 1
WHERE `response` IN ('yes', 'maybe')
	AND `user_id` IN (SELECT `user_id` FROM `family_member` WHERE `child` = 1)
	AND (
		(
			`adults` >= 1
			AND (`responded_via` IS NULL OR `responded_via` <> 'host')
			AND `event_id` IN (SELECT `id` FROM `event` WHERE `ask_kids` = 0)
		)
		OR (`responded_via` = 'host' AND `adults` = 1 AND `kids` = 0)
	);
