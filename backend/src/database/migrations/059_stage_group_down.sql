-- 059 DOWN — remove the stage-group column and restore the original view.
--
-- The view references cs.* (which expanded to include active_contestant_ids), so
-- it must be dropped before the column can be removed, then recreated without it.

DROP VIEW IF EXISTS v_competition_active_session;

ALTER TABLE competition_sessions
    DROP COLUMN IF EXISTS active_contestant_ids;

CREATE VIEW v_competition_active_session AS
SELECT
    cs.*,
    cr.name AS current_round_name,
    cc.name AS active_contestant_name,
    cc.contestant_number AS active_contestant_number,
    cc.photo AS active_contestant_photo
FROM
    competition_sessions cs
    LEFT JOIN competition_rounds cr ON cr.id = cs.current_round_id
    LEFT JOIN competition_contestants cc ON cc.id = cs.active_contestant_id
WHERE
    cs.status = 'active';
