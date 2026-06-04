-- DOWN migration: rolls back 011_rename_pageant_to_competition_scoring.sql
-- Run in the OPPOSITE order: drop views, rename tables back, etc.
--
-- NOTE: PostgreSQL does not support removing enum values. The new
-- 'competition_scoring' enum value added to event_type / organization_type
-- cannot be removed in a downgrade. This script leaves the enum alone and
-- reverses everything else.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop the backward-compatibility views
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS judge_scores;
DROP VIEW IF EXISTS criteria;
DROP VIEW IF EXISTS contestants;

-- ---------------------------------------------------------------------------
-- 2. Restore column comments to their original wording
-- ---------------------------------------------------------------------------
COMMENT ON TABLE competition_scores
  IS 'Per-judge scores per contestant per criterion.';

COMMENT ON TABLE competition_criteria
  IS 'Pageant scoring rubric per event.';

COMMENT ON TABLE competition_contestants
  IS 'Pageant contestants.';

COMMENT ON COLUMN event_voters.is_judge
  IS 'Pageant: voter account acting as judge for this event.';

COMMENT ON COLUMN event_voters.has_scored
  IS 'Pageant: judge has submitted and locked scores for this event.';

COMMENT ON COLUMN events.scoring_enabled
  IS 'Pageant: when true, judges may submit scores.';

COMMENT ON TABLE events
  IS 'Voting/polling/pageant instance under an organization.';

-- ---------------------------------------------------------------------------
-- 3. Rename triggers back
-- ---------------------------------------------------------------------------
ALTER TRIGGER IF EXISTS trg_competition_scores_updated_at ON competition_scores
  RENAME TO trg_judge_scores_updated_at;

ALTER TRIGGER IF EXISTS trg_competition_criteria_updated_at ON competition_criteria
  RENAME TO trg_criteria_updated_at;

ALTER TRIGGER IF EXISTS trg_competition_contestants_updated_at ON competition_contestants
  RENAME TO trg_contestants_updated_at;

-- ---------------------------------------------------------------------------
-- 4. Rename foreign-key / unique / check constraints back
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
      REPLACE(c.conname, 'competition_scores', 'judge_scores')
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
      REPLACE(c.conname, 'competition_criteria', 'criteria')
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
      REPLACE(c.conname, 'competition_contestants', 'contestants')
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Rename indexes back
-- ---------------------------------------------------------------------------
ALTER INDEX IF EXISTS idx_competition_scores_judge_id
  RENAME TO idx_judge_scores_judge_id;

ALTER INDEX IF EXISTS idx_competition_scores_contestant_id
  RENAME TO idx_judge_scores_contestant_id;

ALTER INDEX IF EXISTS idx_competition_scores_criteria_id
  RENAME TO idx_judge_scores_criteria_id;

ALTER INDEX IF EXISTS idx_competition_criteria_event_id
  RENAME TO idx_criteria_event_id;

ALTER INDEX IF EXISTS idx_competition_contestants_event_id
  RENAME TO idx_contestants_event_id;

-- ---------------------------------------------------------------------------
-- 6. Rename tables back
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS competition_scores RENAME TO judge_scores;
ALTER TABLE IF EXISTS competition_criteria RENAME TO criteria;
ALTER TABLE IF EXISTS competition_contestants RENAME TO contestants;

COMMIT;
