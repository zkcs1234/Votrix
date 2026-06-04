-- DOWN migration for 015_competition_scoring_foundation.sql
-- Run in the OPPOSITE order: drop dependents, then parents, then extensions.

BEGIN;

-- 1. View
DROP VIEW IF EXISTS v_legacy_competition_judges;

-- 2. events.scoring_config
DROP INDEX IF EXISTS idx_events_scoring_config_gin;
ALTER TABLE events DROP COLUMN IF EXISTS scoring_config;

-- 3. competition_scores extensions
ALTER TABLE competition_scores DROP CONSTRAINT IF EXISTS competition_scores_unique_with_round;

-- Restore original unique constraint (best-effort; data may already be wider
-- after Phase 4 was live — running this on a fresh DB is fine).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'competition_scores'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) LIKE '%(judge_id, contestant_id, criteria_id)%'
  ) THEN
    ALTER TABLE competition_scores
      ADD CONSTRAINT judge_scores_unique
      UNIQUE (judge_id, contestant_id, criteria_id);
  END IF;
END
$$;

DROP INDEX IF EXISTS idx_competition_scores_round_id;
DROP INDEX IF EXISTS idx_competition_scores_category_id;

ALTER TABLE competition_scores DROP COLUMN IF EXISTS round_id;
ALTER TABLE competition_scores DROP COLUMN IF EXISTS category_id;

-- 4. competition_judge_assignments
DROP TABLE IF EXISTS competition_judge_assignments;

-- 5. competition_judges
DROP TRIGGER IF EXISTS trg_competition_judges_updated_at ON competition_judges;
DROP TABLE IF EXISTS competition_judges;

-- 6. competition_round_criteria / competition_round_contestants
DROP TABLE IF EXISTS competition_round_criteria;
DROP TABLE IF EXISTS competition_round_contestants;

-- 7. competition_criteria extensions
DROP INDEX IF EXISTS idx_competition_criteria_event_order;
DROP INDEX IF EXISTS idx_competition_criteria_category_id;
ALTER TABLE competition_criteria DROP COLUMN IF EXISTS display_order;
ALTER TABLE competition_criteria DROP COLUMN IF EXISTS category_id;

-- 8. competition_rounds
DROP TRIGGER IF EXISTS trg_competition_rounds_updated_at ON competition_rounds;
DROP TABLE IF EXISTS competition_rounds;

-- 9. competition_categories
DROP TRIGGER IF EXISTS trg_competition_categories_updated_at ON competition_categories;
DROP TABLE IF EXISTS competition_categories;

-- 10. Enums
DROP TYPE IF EXISTS competition_judge_role;
DROP TYPE IF EXISTS competition_assignment_scope;

COMMIT;
