-- 069_competition_stages.sql
-- Option B — promote competition_categories to first-class "stages".
--
-- A stage is a competition phase (Preliminaries, Semifinals, Finals) that groups
-- rounds, carries its own weight, and — at its END — applies a cut rule
-- (advancement) and a carry rule (how much of the stage score follows qualifiers
-- into the next stage). The three-level hierarchy already exists:
--
--     competition_categories (STAGE)  →  competition_rounds  →  competition_criteria
--
-- so no new table is introduced. This migration only ADDS columns that mirror the
-- per-round advancement columns already proven in 058_round_advancement.sql, plus
-- the new carry_policy (with a carry_50 option rounds don't have) and an is_stage
-- flag that distinguishes an Option-B phase from a legacy optional category.
--
-- Additive and reversible. Defaults preserve today's behavior exactly:
--   advancement_type = 'none'   → nothing is auto-eliminated
--   carry_policy     = 'reset'  → scores start over each stage (most common)
--   is_stage         = FALSE    → row behaves as the pre-existing optional category
-- Flat events (zero categories) are completely unaffected.
--
-- Apply in the Supabase SQL Editor in numeric order (see database/README.md).

-- 1. Per-stage progression config -------------------------------------------
ALTER TABLE competition_categories
  ADD COLUMN IF NOT EXISTS advancement_type  VARCHAR(16)  NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS advancement_value NUMERIC,
  ADD COLUMN IF NOT EXISTS carry_policy      VARCHAR(16)  NOT NULL DEFAULT 'reset',
  ADD COLUMN IF NOT EXISTS finalized_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_stage          BOOLEAN      NOT NULL DEFAULT FALSE;

-- Guard rails on the small enumerations (kept permissive + explicit, matching
-- the pattern used for competition_rounds).
ALTER TABLE competition_categories
  DROP CONSTRAINT IF EXISTS competition_categories_advancement_type_chk;
ALTER TABLE competition_categories
  ADD CONSTRAINT competition_categories_advancement_type_chk
  CHECK (advancement_type IN ('none', 'top_n', 'top_percent', 'threshold', 'manual'));

ALTER TABLE competition_categories
  DROP CONSTRAINT IF EXISTS competition_categories_carry_policy_chk;
ALTER TABLE competition_categories
  ADD CONSTRAINT competition_categories_carry_policy_chk
  CHECK (carry_policy IN ('reset', 'carry_50', 'carry_full'));

-- Fast lookup of the stages of an event, in order.
CREATE INDEX IF NOT EXISTS idx_competition_categories_event_stage
  ON competition_categories (event_id, display_order)
  WHERE is_stage = TRUE;

COMMENT ON COLUMN competition_categories.advancement_type IS
  'Option B: how qualifiers for the NEXT stage are chosen from this stage''s standing '
  '(none|top_n|top_percent|threshold|manual). none = no elimination.';
COMMENT ON COLUMN competition_categories.advancement_value IS
  'Option B: N (top_n), percent 0-100 (top_percent), or minimum score (threshold). NULL otherwise.';
COMMENT ON COLUMN competition_categories.carry_policy IS
  'Option B: reset = next stage starts at zero; carry_50 = keep 50% of this stage''s score; '
  'carry_full = keep this stage''s full score going forward.';
COMMENT ON COLUMN competition_categories.finalized_at IS
  'Option B: set when the stage is finalized; a finalized stage locks its standing and seeds qualifiers.';
COMMENT ON COLUMN competition_categories.is_stage IS
  'Option B: TRUE = this row is a competition phase (stage) that owns rounds and a cut/carry rule. '
  'FALSE = legacy optional scoring category. Lets both coexist without ambiguity.';
