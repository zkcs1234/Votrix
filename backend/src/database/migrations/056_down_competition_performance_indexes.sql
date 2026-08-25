-- Live-Aware Judge Scoring: Competition Performance Indexes (DOWN MIGRATION)
--
-- Goal: Remove database indexes created in migration 055 for safe rollback
-- if performance issues or conflicts arise.
--
-- Requirements: Safe rollback for 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
--
-- Notes:
--  * Removes all indexes added in 055_competition_performance_indexes.sql
--  * Uses IF EXISTS for safe execution (won't error if indexes don't exist)
--  * Dropping indexes is safe - no data loss, only performance impact
--  * Can be re-run multiple times without issues

BEGIN;

-- ---------------------------------------------------------------------------
-- Remove all performance indexes created in migration 055
-- ---------------------------------------------------------------------------

-- 1. Remove competition_sessions event + status index
DROP INDEX IF EXISTS idx_competition_sessions_event_status;

-- 2. Remove competition_session_judge_scores lookup index  
DROP INDEX IF EXISTS idx_session_judge_scores_lookup;

-- 3. Remove contestants event + division + number index
DROP INDEX IF EXISTS idx_contestants_event_division;

-- 4. Remove competition_judge_assignments lookup index
DROP INDEX IF EXISTS idx_judge_assignments_lookup;

-- 5. Remove criteria event + division index
DROP INDEX IF EXISTS idx_criteria_event_division;

-- 6. Remove competition_rounds event + category + order index
DROP INDEX IF EXISTS idx_rounds_event_category;

-- ---------------------------------------------------------------------------
-- Refresh planner statistics after index removal
-- ---------------------------------------------------------------------------
ANALYZE competition_sessions;
ANALYZE competition_session_judge_scores;
ANALYZE competition_contestants;
ANALYZE competition_judge_assignments;
ANALYZE competition_criteria;
ANALYZE competition_rounds;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK CONFIRMATION
-- ---------------------------------------------------------------------------
-- This migration removes all performance indexes added in migration 055.
-- 
-- Performance Impact:
--   * Query performance will return to pre-055 levels
--   * Large events may experience slower response times
--   * No data loss or functional impact
--
-- To re-apply performance indexes, run migration 055 again.
-- ---------------------------------------------------------------------------