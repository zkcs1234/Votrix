-- Migration 023 — Competition Live Session Support
-- Goal: Add live competition session control on top of existing competition_rounds
-- and scoring flow. Does NOT modify any existing tables — only adds new tables.
--
-- New tables:
--   competition_sessions        — live competition state (active round, current contestant)
--   competition_session_judge_scores — per-contestant locked scores in a session
--
-- Existing tables remain unchanged:
--   competition_categories, competition_rounds, competition_round_contestants,
--   competition_round_criteria, competition_judges, competition_judge_assignments,
--   competition_criteria, competition_contestants, competition_scores (judge_scores)
--
-- The session system extends the competition without replacing any existing workflow.

BEGIN;

-- ===========================================================================
-- 1. Enum: competition_session_status
-- ===========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competition_session_status') THEN
    CREATE TYPE competition_session_status AS ENUM (
      'pending',    -- Session created but not started
      'active',     -- Session is live — judges can see active round/contestant
      'paused',     -- Session temporarily paused
      'completed'   -- All rounds and contestants completed
    );
  END IF;
END
$$;

-- ===========================================================================
-- 2. Table: competition_sessions
--    Stores the live state of a competition event.
--    One event can have multiple sessions over time (e.g., different days),
--    but only ONE session can be active at a time.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS competition_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    status competition_session_status NOT NULL DEFAULT 'pending',

-- Current active round (NULL until started)
current_round_id UUID REFERENCES competition_rounds (id) ON DELETE SET NULL,

-- Current contestant being scored (NULL until started)
active_contestant_id UUID REFERENCES competition_contestants (id) ON DELETE SET NULL,

-- Ordered position in the current round's contestant list
current_contestant_order INTEGER DEFAULT 0,

-- Which round contestants are we iterating through?
-- Stored as an ordered array of contestant IDs for the current round
-- This ensures consistent ordering even if contestants are added/removed
contestant_order UUID[] DEFAULT '{}',

-- Timestamps
started_at TIMESTAMPTZ,
paused_at TIMESTAMPTZ,
completed_at TIMESTAMPTZ,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

-- Constraint: only one active session per event
CONSTRAINT competition_sessions_unique_active
      UNIQUE (event_id, status)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_competition_sessions_event_id ON competition_sessions (event_id);

CREATE INDEX IF NOT EXISTS idx_competition_sessions_status ON competition_sessions (status);

CREATE INDEX IF NOT EXISTS idx_competition_sessions_current_round ON competition_sessions (current_round_id);

CREATE INDEX IF NOT EXISTS idx_competition_sessions_active_contestant ON competition_sessions (active_contestant_id);

-- Updated-at trigger
CREATE TRIGGER trg_competition_sessions_updated_at
  BEFORE UPDATE ON competition_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON
TABLE competition_sessions IS 'Live competition session state. Controls what judges see and when they can score.';

COMMENT ON COLUMN competition_sessions.status IS 'pending = not started, active = live, paused = temporarily halted, completed = done';

COMMENT ON COLUMN competition_sessions.current_round_id IS 'The competition_round that judges are currently scoring';

COMMENT ON COLUMN competition_sessions.active_contestant_id IS 'The contestant currently being scored by judges';

COMMENT ON COLUMN competition_sessions.current_contestant_order IS '0-based index into contestant_order array';

COMMENT ON COLUMN competition_sessions.contestant_order IS 'Ordered array of contestant IDs for the current round';

-- ===========================================================================
-- 3. Table: competition_session_judge_scores
--    Stores per-contestant, per-round score submissions within a session.
--    Each judge submits ONE score row per (session, round, contestant).
--    Once locked, scores cannot be modified.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS competition_session_judge_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES competition_sessions (id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    round_id UUID REFERENCES competition_rounds (id) ON DELETE CASCADE,
    contestant_id UUID NOT NULL REFERENCES competition_contestants (id) ON DELETE CASCADE,
    judge_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,

-- Scores stored as JSONB: { criteriaId: score, ... }
-- e.g., {"abc-123": 85.5, "def-456": 92.0}
scores JSONB NOT NULL DEFAULT '{}',

-- Lock state
is_locked BOOLEAN NOT NULL DEFAULT FALSE,
locked_at TIMESTAMPTZ,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

-- One score row per (judge, session, round, contestant)
CONSTRAINT competition_session_judge_scores_unique
        UNIQUE (judge_id, session_id, round_id, contestant_id)
);

CREATE INDEX IF NOT EXISTS idx_session_judge_scores_session_id ON competition_session_judge_scores (session_id);

CREATE INDEX IF NOT EXISTS idx_session_judge_scores_event_id ON competition_session_judge_scores (event_id);

CREATE INDEX IF NOT EXISTS idx_session_judge_scores_contestant_id ON competition_session_judge_scores (contestant_id);

CREATE INDEX IF NOT EXISTS idx_session_judge_scores_judge_id ON competition_session_judge_scores (judge_id);

CREATE INDEX IF NOT EXISTS idx_session_judge_scores_round_id ON competition_session_judge_scores (round_id);

CREATE INDEX IF NOT EXISTS idx_session_judge_scores_locked ON competition_session_judge_scores (is_locked)
WHERE
    is_locked = FALSE;

-- Updated-at trigger
CREATE TRIGGER trg_competition_session_judge_scores_updated_at
  BEFORE UPDATE ON competition_session_judge_scores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON
TABLE competition_session_judge_scores IS 'Per-judge, per-contestant, per-round locked scores within a live session.';

COMMENT ON COLUMN competition_session_judge_scores.scores IS 'JSON object mapping criteria_id to score value. Locked after submission.';

COMMENT ON COLUMN competition_session_judge_scores.is_locked IS 'TRUE once submitted. Locked scores cannot be modified.';

-- ===========================================================================
-- 4. Helper view: current session state for judges
--    Returns the active session for an event, or NULL if none.
-- ===========================================================================
CREATE OR REPLACE VIEW v_competition_active_session AS
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

COMMIT;