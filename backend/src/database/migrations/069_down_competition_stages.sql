-- 069_down_competition_stages.sql
-- Rollback for 069_competition_stages.sql.

DROP INDEX IF EXISTS idx_competition_categories_event_stage;

ALTER TABLE competition_categories
  DROP CONSTRAINT IF EXISTS competition_categories_advancement_type_chk;
ALTER TABLE competition_categories
  DROP CONSTRAINT IF EXISTS competition_categories_carry_policy_chk;

ALTER TABLE competition_categories
  DROP COLUMN IF EXISTS advancement_type,
  DROP COLUMN IF EXISTS advancement_value,
  DROP COLUMN IF EXISTS carry_policy,
  DROP COLUMN IF EXISTS finalized_at,
  DROP COLUMN IF EXISTS is_stage;
