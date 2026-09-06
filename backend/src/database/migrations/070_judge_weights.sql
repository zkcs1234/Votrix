-- 070_judge_weights.sql
-- Option B — per-judge score weighting.
--
-- Lets an organizer make one judge count more than another (e.g. Head Judge 40%,
-- guest judges 30% each). Weight lives on the judge's ASSIGNMENT row so a judge
-- can carry different weights in different scopes if ever needed; in practice the
-- UI sets one weight per judge.
--
-- Additive and reversible. Default preserves today's behavior exactly:
--   weight = NULL everywhere  → every judge counts equally (plain average), which
--   is what the scoring engine does today. Weighting only takes effect once the
--   organizer enables it (scoring_config.judgeWeightingEnabled) AND sets weights.
--
-- Apply in the Supabase SQL Editor in numeric order (see database/README.md).

ALTER TABLE competition_judge_assignments
  ADD COLUMN IF NOT EXISTS weight NUMERIC;

ALTER TABLE competition_judge_assignments
  DROP CONSTRAINT IF EXISTS competition_judge_assignments_weight_range;
ALTER TABLE competition_judge_assignments
  ADD CONSTRAINT competition_judge_assignments_weight_range
  CHECK (weight IS NULL OR (weight >= 0 AND weight <= 100));

COMMENT ON COLUMN competition_judge_assignments.weight IS
  'Option B: relative weight (0-100) of this judge''s scores when combined. '
  'NULL = equal weighting (default, today''s behavior). Enabled per event via '
  'scoring_config.judgeWeightingEnabled; enabled weights should total 100 across active judges.';

-- events.scoring_config (JSONB) gains judgeWeightingEnabled — no schema change.
-- Default (absent) is treated as false by the application layer, so scores stay
-- an equal average until the organizer turns weighting on.
COMMENT ON COLUMN events.scoring_config IS
  'Scoring rules (JSONB): scoreType, calculationMethod, decimalPlaces, drop rules, '
  'tieBreaker, includeOverallRanking, and judgeWeightingEnabled (default false).';
