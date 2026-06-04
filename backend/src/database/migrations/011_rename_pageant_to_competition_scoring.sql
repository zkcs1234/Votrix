-- Phase: Pageant → Competition Scoring refactor
-- Goal: rename pageant-related tables, indexes, and enum values to competition_scoring
--       while preserving all existing data.
--
-- This migration is split into clearly labeled sections so a DOWN migration
-- can reverse it in the opposite order.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend enums to include the new competition_scoring value
-- ---------------------------------------------------------------------------
-- PostgreSQL enums support ALTER TYPE ... ADD VALUE. The new value must be
-- committed before it can be used in the same transaction, so we use the
-- IF NOT EXISTS guard to make this migration idempotent.

ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'competition_scoring';

ALTER TYPE organization_type ADD VALUE IF NOT EXISTS 'competition_scoring';

-- ---------------------------------------------------------------------------
-- 2. Rename tables
--    contestant/contestant-style tables are not prefixed with `pageant_` in
--    the current schema, but the user's spec asks for explicit `competition_`
--    names. We rename in this order: dependents first.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS judge_scores RENAME TO competition_scores;

ALTER TABLE IF EXISTS criteria RENAME TO competition_criteria;

ALTER TABLE IF EXISTS contestants RENAME TO competition_contestants;

-- ---------------------------------------------------------------------------
-- 3. Rename indexes to follow the new table names
-- ---------------------------------------------------------------------------
ALTER INDEX IF EXISTS idx_judge_scores_judge_id
  RENAME TO idx_competition_scores_judge_id;

ALTER INDEX IF EXISTS idx_judge_scores_contestant_id
  RENAME TO idx_competition_scores_contestant_id;

ALTER INDEX IF EXISTS idx_judge_scores_criteria_id
  RENAME TO idx_competition_scores_criteria_id;

ALTER INDEX IF EXISTS idx_criteria_event_id
  RENAME TO idx_competition_criteria_event_id;

ALTER INDEX IF EXISTS idx_contestants_event_id
  RENAME TO idx_competition_contestants_event_id;

-- ---------------------------------------------------------------------------
-- 4. Rename foreign-key constraints to reflect the new table names
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'competition_scores'::regclass
      AND contype = 'f'
  LOOP
    EXECUTE format(
      'ALTER TABLE competition_scores RENAME CONSTRAINT %I TO %I',
      c.conname,
      REPLACE(c.conname, 'judge_scores', 'competition_scores')
    );
  END LOOP;

  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'competition_criteria'::regclass
      AND contype IN ('f', 'u', 'c', 'p')
  LOOP
    EXECUTE format(
      'ALTER TABLE competition_criteria RENAME CONSTRAINT %I TO %I',
      c.conname,
      REPLACE(c.conname, 'criteria', 'competition_criteria')
    );
  END LOOP;

  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'competition_contestants'::regclass
      AND contype IN ('f', 'u', 'c', 'p')
  LOOP
    EXECUTE format(
      'ALTER TABLE competition_contestants RENAME CONSTRAINT %I TO %I',
      c.conname,
      REPLACE(c.conname, 'contestants', 'competition_contestants')
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Rename triggers to reflect the new table names
-- ---------------------------------------------------------------------------
ALTER TRIGGER IF EXISTS trg_judge_scores_updated_at ON competition_scores
  RENAME TO trg_competition_scores_updated_at;

ALTER TRIGGER IF EXISTS trg_criteria_updated_at ON competition_criteria
  RENAME TO trg_competition_criteria_updated_at;

ALTER TRIGGER IF EXISTS trg_contestants_updated_at ON competition_contestants
  RENAME TO trg_competition_contestants_updated_at;

-- ---------------------------------------------------------------------------
-- 6. Update column comments (don't drop them — keep documentation useful)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE competition_scores
  IS 'Per-judge scores per competition contestant per criterion.';

COMMENT ON TABLE competition_criteria
  IS 'Competition scoring rubric per event.';

COMMENT ON TABLE competition_contestants
  IS 'Competition contestants.';

COMMENT ON COLUMN event_voters.is_judge
  IS 'Competition scoring: voter account acting as judge for this event.';

COMMENT ON COLUMN event_voters.has_scored
  IS 'Competition scoring: judge has submitted and locked scores for this event.';

COMMENT ON COLUMN events.scoring_enabled
  IS 'Competition scoring: when true, judges may submit scores.';

COMMENT ON TABLE events
  IS 'Voting/polling/competition scoring instance under an organization.';

-- ---------------------------------------------------------------------------
-- 7. Backward-compatibility views
--    Keep the legacy table names queryable as views so older code paths and
--    any external reporting tools that hard-coded them keep working until
--    they are fully migrated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW judge_scores AS
  SELECT * FROM competition_scores;

CREATE OR REPLACE VIEW criteria AS
  SELECT * FROM competition_criteria;

CREATE OR REPLACE VIEW contestants AS
  SELECT * FROM competition_contestants;

-- The new enum value 'competition_scoring' now exists. Existing rows with
-- 'pageant' are NOT rewritten automatically — application code can keep
-- reading/writing 'pageant' until the enum values are normalized in a
-- follow-up migration. This preserves data integrity.

COMMIT;
