-- 058_down_round_advancement.sql
-- Rollback for 058_round_advancement.sql.

DROP TABLE IF EXISTS competition_round_results;

ALTER TABLE competition_rounds
  DROP CONSTRAINT IF EXISTS competition_rounds_advancement_type_chk;
ALTER TABLE competition_rounds
  DROP CONSTRAINT IF EXISTS competition_rounds_score_policy_chk;

ALTER TABLE competition_rounds
  DROP COLUMN IF EXISTS advancement_type,
  DROP COLUMN IF EXISTS advancement_value,
  DROP COLUMN IF EXISTS score_policy,
  DROP COLUMN IF EXISTS finalized_at;
