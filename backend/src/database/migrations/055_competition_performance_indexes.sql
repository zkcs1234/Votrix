-- Live-Aware Judge Scoring: Competition Performance Indexes
--
-- Goal: Add database indexes for high-traffic query paths in the live judge
-- scoring system to maintain fast response times with large events involving
-- many judges and contestants.
--
-- Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
--
-- Notes:
--  * All indexes use IF NOT EXISTS for safe re-running
--  * These indexes optimize:
--      - Active session lookups by event
--      - Judge score retrieval during live sessions
--      - Contestant filtering by division and ordering
--      - Judge assignment validation
--      - Division-aware criteria loading
--      - Round ordering and category filtering

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. competition_sessions — optimize active session lookups (Req 16.1)
-- ---------------------------------------------------------------------------
-- The judge scoring page and organizer dashboard frequently query:
--   .eq('event_id', id).eq('status', 'active')
-- This composite index provides direct access without scanning all sessions.
CREATE INDEX IF NOT EXISTS idx_competition_sessions_event_status
  ON competition_sessions (event_id, status);

-- ---------------------------------------------------------------------------
-- 2. competition_session_judge_scores — optimize score retrieval (Req 16.2)
-- ---------------------------------------------------------------------------
-- The session view and scoring sheet load existing scores with:
--   .eq('session_id', sid).eq('judge_id', jid).eq('round_id', rid).eq('contestant_id', cid)
-- This composite index matches the exact query pattern for instant lookups.
CREATE INDEX IF NOT EXISTS idx_session_judge_scores_lookup
  ON competition_session_judge_scores (session_id, judge_id, round_id, contestant_id);

-- ---------------------------------------------------------------------------
-- 3. competition_contestants — optimize contestant ordering (Req 16.3)
-- ---------------------------------------------------------------------------
-- Division-aware contestant lists query:
--   .eq('event_id', eid).eq('division_id', did).order('contestant_number')
-- This composite index enables sorted retrieval without a separate sort step.
CREATE INDEX IF NOT EXISTS idx_contestants_event_division
  ON competition_contestants (event_id, division_id, contestant_number);

-- ---------------------------------------------------------------------------
-- 4. competition_judge_assignments — optimize assignment validation (Req 16.4)
-- ---------------------------------------------------------------------------
-- The resolveAllowedDivisions service method queries:
--   .eq('participant_id', pid).eq('scope', 'division').eq('scope_id', sid)
-- This composite index provides instant assignment verification.
CREATE INDEX IF NOT EXISTS idx_judge_assignments_lookup
  ON competition_judge_assignments (participant_id, scope, scope_id);

-- ---------------------------------------------------------------------------
-- 5. competition_criteria — optimize division criteria loading (Req 16.5)
-- ---------------------------------------------------------------------------
-- Division-aware criteria queries:
--   .eq('event_id', eid).eq('division_id', did)
-- This composite index enables fast filtering of criteria by division.
CREATE INDEX IF NOT EXISTS idx_criteria_event_division
  ON competition_criteria (event_id, division_id);

-- ---------------------------------------------------------------------------
-- 6. competition_rounds — optimize round ordering (Req 16.6)
-- ---------------------------------------------------------------------------
-- Round listing and session management query:
--   .eq('event_id', eid).eq('category_id', cid).order('display_order')
-- This composite index provides sorted round access by category.
CREATE INDEX IF NOT EXISTS idx_rounds_event_category
  ON competition_rounds (event_id, category_id, display_order);

-- ---------------------------------------------------------------------------
-- 7. ANALYZE — refresh planner statistics for immediate index usage
-- ---------------------------------------------------------------------------
ANALYZE competition_sessions;
ANALYZE competition_session_judge_scores;
ANALYZE competition_contestants;
ANALYZE competition_judge_assignments;
ANALYZE competition_criteria;
ANALYZE competition_rounds;

COMMIT;
