-- 073_down_session_locked_criteria.sql
-- Rollback for 073_session_locked_criteria.sql.
--
-- Deploy the pre-feature code first (so nothing reads locked_criteria and submit
-- goes back to whole-contestant is_locked), then drop the column.

BEGIN;

ALTER TABLE competition_session_judge_scores
    DROP COLUMN IF EXISTS locked_criteria;

COMMIT;
