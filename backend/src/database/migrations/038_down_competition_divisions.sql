-- Down Migration 038 — Revert Competition Divisions
--
-- Removes division support from the Competition Module.
-- WARNING: This will fail if any divisions exist with associated data.
-- Divisions must be manually deactivated/archived first.

BEGIN;

-- ===========================================================================
-- 1. Drop triggers
-- ===========================================================================
DROP TRIGGER IF EXISTS trg_validate_contestant_division ON competition_contestants;
DROP TRIGGER IF EXISTS trg_validate_category_division ON competition_categories;
DROP TRIGGER IF EXISTS trg_validate_round_division ON competition_rounds;
DROP TRIGGER IF EXISTS trg_validate_criteria_division ON competition_criteria;
DROP TRIGGER IF EXISTS trg_validate_score_division ON competition_scores;
DROP TRIGGER IF EXISTS trg_validate_session_division ON competition_sessions;
DROP TRIGGER IF EXISTS trg_validate_session_judge_score_division ON competition_session_judge_scores;

-- ===========================================================================
-- 2. Drop validation functions
-- ===========================================================================
DROP FUNCTION IF EXISTS fn_validate_division_belongs_to_event();
DROP FUNCTION IF EXISTS fn_validate_score_division();
DROP FUNCTION IF EXISTS fn_validate_session_division();
DROP FUNCTION IF EXISTS fn_validate_session_judge_score_division();

-- ===========================================================================
-- 3. Remove division_id columns (will fail if FKs exist)
-- ===========================================================================
ALTER TABLE competition_session_judge_scores
  DROP COLUMN IF EXISTS division_id;

ALTER TABLE competition_sessions
  DROP COLUMN IF EXISTS current_division_id;

ALTER TABLE competition_scores
  DROP COLUMN IF EXISTS division_id;

ALTER TABLE competition_criteria
  DROP COLUMN IF EXISTS division_id;

ALTER TABLE competition_rounds
  DROP COLUMN IF EXISTS division_id;

ALTER TABLE competition_categories
  DROP COLUMN IF EXISTS division_id;

ALTER TABLE competition_contestants
  DROP COLUMN IF EXISTS division_id;

-- ===========================================================================
-- 4. Drop competition_divisions table
-- ===========================================================================
DROP TABLE IF EXISTS competition_divisions;

-- ===========================================================================
-- 5. Remove divisions_enabled flag from events
-- ===========================================================================
ALTER TABLE events
  DROP COLUMN IF EXISTS divisions_enabled;

-- ===========================================================================
-- 6. Remove 'division' from competition_assignment_scope enum
-- ===========================================================================
-- NOTE: PostgreSQL doesn't support removing enum values directly.
-- If you need to fully revert the enum, you must:
-- 1. Ensure no rows use scope='division' in competition_judge_assignments
-- 2. Create a new enum without 'division'
-- 3. Alter the column to use the new enum
-- 4. Drop the old enum
--
-- For now, we leave the enum value in place (harmless if unused).
-- Uncomment below if you need full enum reversion:

-- DO $$
-- BEGIN
--   -- Check if any assignments use 'division' scope
--   IF EXISTS (
--     SELECT 1 FROM competition_judge_assignments 
--     WHERE scope = 'division'
--   ) THEN
--     RAISE EXCEPTION 'Cannot revert: division assignments still exist';
--   END IF;
--   
--   -- Create new enum without 'division'
--   CREATE TYPE competition_assignment_scope_new AS ENUM ('event', 'category', 'round');
--   
--   -- Update column type
--   ALTER TABLE competition_judge_assignments 
--     ALTER COLUMN scope TYPE competition_assignment_scope_new 
--     USING scope::text::competition_assignment_scope_new;
--   
--   -- Drop old enum and rename new one
--   DROP TYPE competition_assignment_scope;
--   ALTER TYPE competition_assignment_scope_new RENAME TO competition_assignment_scope;
-- END
-- $$;

COMMIT;
