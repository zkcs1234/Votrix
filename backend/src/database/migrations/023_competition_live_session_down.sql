-- DOWN migration for 023_competition_live_session.sql
-- Run in REVERSE order: drop dependents first, then parents.

BEGIN;

-- 1. Drop view
DROP VIEW IF EXISTS v_competition_active_session;

-- 2. Drop competition_session_judge_scores (depends on competition_sessions)
DROP TRIGGER IF EXISTS trg_competition_session_judge_scores_updated_at ON competition_session_judge_scores;

DROP TABLE IF EXISTS competition_session_judge_scores;

-- 3. Drop competition_sessions
DROP TRIGGER IF EXISTS trg_competition_sessions_updated_at ON competition_sessions;

DROP TABLE IF EXISTS competition_sessions;

-- 4. Drop enum
DROP TYPE IF EXISTS competition_session_status;

COMMIT;