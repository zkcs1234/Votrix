-- Migration 038 — Competition Divisions
--
-- Adds optional division support to the Competition Module as a first-class
-- enhancement. Divisions group contestants (e.g., Male, Female, Junior, Senior)
-- without creating parallel systems.
--
-- Design constraints:
-- • ONE shared competition system (contestants, criteria, rounds, judges, scores)
-- • Divisions are an OPTIONAL grouping attribute (nullable division_id column)
-- • Existing competitions remain unchanged (divisions_enabled = FALSE)
-- • Division access controlled via judge assignments (scope='division')
-- • Per-division ranking is default; overall ranking is opt-in
--
-- See: competition-divisions-implementation-plan.md

BEGIN;

-- ===========================================================================
-- 1. Add divisions_enabled flag to events table
-- ===========================================================================
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS divisions_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_events_divisions_enabled 
  ON events(id) WHERE divisions_enabled = TRUE;

COMMENT ON COLUMN events.divisions_enabled IS 
  'When TRUE, the event uses divisions to group contestants. Division UI is shown. Default FALSE preserves existing behavior.';

-- ===========================================================================
-- 2. Create competition_divisions table
-- ===========================================================================
CREATE TABLE IF NOT EXISTS competition_divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competition_divisions_event_id 
  ON competition_divisions(event_id);

CREATE INDEX IF NOT EXISTS idx_competition_divisions_event_order 
  ON competition_divisions(event_id, display_order);

CREATE INDEX IF NOT EXISTS idx_competition_divisions_active 
  ON competition_divisions(event_id, is_active);

CREATE TRIGGER trg_competition_divisions_updated_at
  BEFORE UPDATE ON competition_divisions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE competition_divisions IS 
  'Optional divisions within a competition (e.g., Male, Female, Junior, Senior). Only exists when events.divisions_enabled = TRUE.';

-- ===========================================================================
-- 3. Add division_id columns to existing tables (all nullable, ON DELETE RESTRICT)
-- ===========================================================================

-- 3.1 competition_contestants
ALTER TABLE competition_contestants
  ADD COLUMN IF NOT EXISTS division_id UUID 
  REFERENCES competition_divisions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_competition_contestants_division_id 
  ON competition_contestants(division_id);

CREATE INDEX IF NOT EXISTS idx_competition_contestants_event_division 
  ON competition_contestants(event_id, division_id);

COMMENT ON COLUMN competition_contestants.division_id IS 
  'Optional division this contestant belongs to. NULL = event-wide (no division).';

-- 3.2 competition_categories
ALTER TABLE competition_categories
  ADD COLUMN IF NOT EXISTS division_id UUID 
  REFERENCES competition_divisions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_competition_categories_division_id 
  ON competition_categories(division_id);

COMMENT ON COLUMN competition_categories.division_id IS 
  'Optional division this category belongs to. NULL = event-wide.';

-- 3.3 competition_rounds
ALTER TABLE competition_rounds
  ADD COLUMN IF NOT EXISTS division_id UUID 
  REFERENCES competition_divisions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_competition_rounds_division_id 
  ON competition_rounds(division_id);

CREATE INDEX IF NOT EXISTS idx_competition_rounds_event_division 
  ON competition_rounds(event_id, division_id);

COMMENT ON COLUMN competition_rounds.division_id IS 
  'Optional division this round belongs to. NULL = event-wide.';

-- 3.4 competition_criteria
ALTER TABLE competition_criteria
  ADD COLUMN IF NOT EXISTS division_id UUID 
  REFERENCES competition_divisions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_competition_criteria_division_id 
  ON competition_criteria(division_id);

COMMENT ON COLUMN competition_criteria.division_id IS 
  'Optional division this criterion belongs to. NULL = event-wide.';

-- 3.5 competition_scores (denormalized for fast ranking)
ALTER TABLE competition_scores
  ADD COLUMN IF NOT EXISTS division_id UUID 
  REFERENCES competition_divisions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_competition_scores_division_id 
  ON competition_scores(division_id);

CREATE INDEX IF NOT EXISTS idx_competition_scores_event_division 
  ON competition_scores(event_id, division_id);

COMMENT ON COLUMN competition_scores.division_id IS 
  'Denormalized division from contestant for fast ranking queries. NULL = event-wide.';

-- 3.6 competition_sessions (for live control)
ALTER TABLE competition_sessions
  ADD COLUMN IF NOT EXISTS current_division_id UUID 
  REFERENCES competition_divisions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_competition_sessions_current_division 
  ON competition_sessions(current_division_id);

COMMENT ON COLUMN competition_sessions.current_division_id IS 
  'Active division during live session. NULL = no division or division-disabled event.';

-- 3.7 competition_session_judge_scores (for live session scoring)
ALTER TABLE competition_session_judge_scores
  ADD COLUMN IF NOT EXISTS division_id UUID 
  REFERENCES competition_divisions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_competition_session_judge_scores_division 
  ON competition_session_judge_scores(division_id);

COMMENT ON COLUMN competition_session_judge_scores.division_id IS 
  'Division context for this live session score. NULL = event-wide.';

-- ===========================================================================
-- 4. Extend competition_assignment_scope enum with 'division'
-- ===========================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'division' 
    AND enumtypid = 'competition_assignment_scope'::regtype
  ) THEN
    ALTER TYPE competition_assignment_scope ADD VALUE 'division';
  END IF;
END
$$;

COMMENT ON TYPE competition_assignment_scope IS 
  'Judge assignment scope: event (all divisions), category, round, or division (specific division only).';

-- ===========================================================================
-- 5. Extend events.scoring_config to support includeOverallRanking
-- ===========================================================================
-- No schema change needed — scoring_config is JSONB.
-- Default behavior: includeOverallRanking = false (per-division ranking only)
-- Application layer will handle the merge.

COMMENT ON COLUMN events.scoring_config IS 
  'Scoring rules (JSONB). Includes scoreType, calculationMethod, weights, and includeOverallRanking (default: false).';

-- ===========================================================================
-- 6. Data integrity helper: Validate division belongs to same event
-- ===========================================================================
-- This is a defensive check to prevent cross-event division assignments.
-- Application layer is primary enforcer, but this adds DB-level safety.

-- Function for tables that have event_id directly
CREATE OR REPLACE FUNCTION fn_validate_division_belongs_to_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate if division_id is set
  IF NEW.division_id IS NOT NULL THEN
    -- Check that the division belongs to the same event
    IF NOT EXISTS (
      SELECT 1 FROM competition_divisions cd
      WHERE cd.id = NEW.division_id 
      AND cd.event_id = NEW.event_id
    ) THEN
      RAISE EXCEPTION 'Division % does not belong to event %', 
        NEW.division_id, NEW.event_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for competition_scores (no direct event_id, uses contestant_id)
CREATE OR REPLACE FUNCTION fn_validate_score_division()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Only validate if division_id is set
  IF NEW.division_id IS NOT NULL THEN
    -- Get event_id from contestant
    SELECT event_id INTO v_event_id
    FROM competition_contestants
    WHERE id = NEW.contestant_id;
    
    -- Check that the division belongs to the same event
    IF NOT EXISTS (
      SELECT 1 FROM competition_divisions cd
      WHERE cd.id = NEW.division_id 
      AND cd.event_id = v_event_id
    ) THEN
      RAISE EXCEPTION 'Division % does not belong to the same event as contestant', 
        NEW.division_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for competition_sessions (no direct event_id, uses event_id from session)
CREATE OR REPLACE FUNCTION fn_validate_session_division()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Only validate if current_division_id is set
  IF NEW.current_division_id IS NOT NULL THEN
    -- Get event_id from session
    SELECT event_id INTO v_event_id
    FROM competition_sessions
    WHERE id = NEW.id;
    
    -- Check that the division belongs to the same event
    IF NOT EXISTS (
      SELECT 1 FROM competition_divisions cd
      WHERE cd.id = NEW.current_division_id 
      AND cd.event_id = v_event_id
    ) THEN
      RAISE EXCEPTION 'Division % does not belong to the same event', 
        NEW.current_division_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for competition_session_judge_scores (no direct event_id, uses session_id)
CREATE OR REPLACE FUNCTION fn_validate_session_judge_score_division()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Only validate if division_id is set
  IF NEW.division_id IS NOT NULL THEN
    -- Get event_id from session
    SELECT cs.event_id INTO v_event_id
    FROM competition_sessions cs
    WHERE cs.id = NEW.session_id;
    
    -- Check that the division belongs to the same event
    IF NOT EXISTS (
      SELECT 1 FROM competition_divisions cd
      WHERE cd.id = NEW.division_id 
      AND cd.event_id = v_event_id
    ) THEN
      RAISE EXCEPTION 'Division % does not belong to the same event', 
        NEW.division_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with both event_id and division_id
DROP TRIGGER IF EXISTS trg_validate_contestant_division ON competition_contestants;
CREATE TRIGGER trg_validate_contestant_division
  BEFORE INSERT OR UPDATE OF division_id ON competition_contestants
  FOR EACH ROW EXECUTE FUNCTION fn_validate_division_belongs_to_event();

DROP TRIGGER IF EXISTS trg_validate_category_division ON competition_categories;
CREATE TRIGGER trg_validate_category_division
  BEFORE INSERT OR UPDATE OF division_id ON competition_categories
  FOR EACH ROW EXECUTE FUNCTION fn_validate_division_belongs_to_event();

DROP TRIGGER IF EXISTS trg_validate_round_division ON competition_rounds;
CREATE TRIGGER trg_validate_round_division
  BEFORE INSERT OR UPDATE OF division_id ON competition_rounds
  FOR EACH ROW EXECUTE FUNCTION fn_validate_division_belongs_to_event();

DROP TRIGGER IF EXISTS trg_validate_criteria_division ON competition_criteria;
CREATE TRIGGER trg_validate_criteria_division
  BEFORE INSERT OR UPDATE OF division_id ON competition_criteria
  FOR EACH ROW EXECUTE FUNCTION fn_validate_division_belongs_to_event();

-- Apply specialized triggers for tables without direct event_id
DROP TRIGGER IF EXISTS trg_validate_score_division ON competition_scores;
CREATE TRIGGER trg_validate_score_division
  BEFORE INSERT OR UPDATE OF division_id ON competition_scores
  FOR EACH ROW EXECUTE FUNCTION fn_validate_score_division();

DROP TRIGGER IF EXISTS trg_validate_session_division ON competition_sessions;
CREATE TRIGGER trg_validate_session_division
  BEFORE INSERT OR UPDATE OF current_division_id ON competition_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_validate_session_division();

DROP TRIGGER IF EXISTS trg_validate_session_judge_score_division ON competition_session_judge_scores;
CREATE TRIGGER trg_validate_session_judge_score_division
  BEFORE INSERT OR UPDATE OF division_id ON competition_session_judge_scores
  FOR EACH ROW EXECUTE FUNCTION fn_validate_session_judge_score_division();

-- ===========================================================================
-- 7. Verify backward compatibility
-- ===========================================================================
-- All division_id columns are nullable and default to NULL.
-- Existing competitions (divisions_enabled = FALSE, zero divisions) behave unchanged.
-- The ON DELETE RESTRICT ensures divisions with data cannot be deleted, only deactivated.

COMMIT;
