-- 072_down_session_active_criteria.sql
-- Rollback for 072_session_active_criteria.sql.
--
-- Deploy the pre-feature code first (so nothing reads active_criteria_ids),
-- then drop the column.

BEGIN;

ALTER TABLE competition_sessions
    DROP COLUMN IF EXISTS active_criteria_ids;

COMMIT;
