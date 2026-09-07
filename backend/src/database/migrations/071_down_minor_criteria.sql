-- 071_down_minor_criteria.sql
-- Rollback for 071_minor_criteria.sql.
--
-- Deploy the pre-feature (criterion-scored) code BEFORE running this, so the
-- live code no longer reads minor_criteria_id. Dropping minor_criteria_id also
-- drops the scores that only existed against a minor; scores keep their
-- criteria_id, so criterion-level history remains.

BEGIN;

-- 1. Restore the prior score-cell uniqueness (without minor_criteria_id).
ALTER TABLE competition_scores
    DROP CONSTRAINT IF EXISTS competition_scores_unique_with_minor;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'competition_scores'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) LIKE '%(judge_id, contestant_id, criteria_id, round_id)%'
  ) THEN
    ALTER TABLE competition_scores
      ADD CONSTRAINT competition_scores_unique_with_round
      UNIQUE (judge_id, contestant_id, criteria_id, round_id);
  END IF;
END
$$;

-- 2. Drop the minor reference (removes its FK), then the table.
ALTER TABLE competition_scores
    DROP COLUMN IF EXISTS minor_criteria_id;

DROP TABLE IF EXISTS competition_minor_criteria;

COMMIT;
