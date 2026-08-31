-- 059 — Stage group (simultaneous multi-contestant scoring)
--
-- Real pageants often put a pair (Mr #5 + Ms #5) or a head-to-head dance battle
-- on stage AT THE SAME TIME, but each contestant is scored individually. The
-- live session already tracks a single active contestant; this adds an optional
-- ordered list of on-stage contestants that judges can score simultaneously.
--
-- Additive and reversible. NULL/empty = classic single-active behavior (every
-- existing session keeps working unchanged). The active-session view selects
-- cs.*, so it is re-created to pick up the new column.

ALTER TABLE competition_sessions
    ADD COLUMN IF NOT EXISTS active_contestant_ids JSONB;

COMMENT ON COLUMN competition_sessions.active_contestant_ids IS
    'Optional ordered list of on-stage contestant ids scored simultaneously. NULL/empty = single active_contestant_id (default).';

-- Re-expand the view so cs.* includes the new column. It must be DROPPED and
-- recreated (not CREATE OR REPLACE): the new column shifts the cs.* column order,
-- and CREATE OR REPLACE can only APPEND columns, not reorder them.
DROP VIEW IF EXISTS v_competition_active_session;

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
