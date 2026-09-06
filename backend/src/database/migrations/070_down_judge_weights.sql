-- 070_down_judge_weights.sql
-- Rollback for 070_judge_weights.sql.

ALTER TABLE competition_judge_assignments
  DROP CONSTRAINT IF EXISTS competition_judge_assignments_weight_range;

ALTER TABLE competition_judge_assignments
  DROP COLUMN IF EXISTS weight;
