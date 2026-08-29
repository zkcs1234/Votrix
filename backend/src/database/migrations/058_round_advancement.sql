-- 058_round_advancement.sql
-- Phase 6 — Real-competition round progression (advancement / elimination / score policy).
--
-- Additive and reversible. Defaults preserve today's behavior exactly:
--   advancement_type = 'none'  → nothing is ever auto-eliminated
--   score_policy     = 'independent' → each round scored on its own (current math)
-- A one-round / no-rounds competition is completely unaffected.
--
-- Apply in the Supabase SQL Editor in numeric order (see database/README.md).

-- 1. Per-round progression config -------------------------------------------
ALTER TABLE competition_rounds
  ADD COLUMN IF NOT EXISTS advancement_type  VARCHAR(16)  NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS advancement_value NUMERIC,
  ADD COLUMN IF NOT EXISTS score_policy      VARCHAR(16)  NOT NULL DEFAULT 'independent',
  ADD COLUMN IF NOT EXISTS finalized_at      TIMESTAMPTZ;

-- Guard rails on the small enumerations (kept permissive + explicit).
ALTER TABLE competition_rounds
  DROP CONSTRAINT IF EXISTS competition_rounds_advancement_type_chk;
ALTER TABLE competition_rounds
  ADD CONSTRAINT competition_rounds_advancement_type_chk
  CHECK (advancement_type IN ('none', 'top_n', 'top_percent', 'threshold', 'manual'));

ALTER TABLE competition_rounds
  DROP CONSTRAINT IF EXISTS competition_rounds_score_policy_chk;
ALTER TABLE competition_rounds
  ADD CONSTRAINT competition_rounds_score_policy_chk
  CHECK (score_policy IN ('independent', 'cumulative'));

COMMENT ON COLUMN competition_rounds.advancement_type IS
  'Phase 6: how qualifiers for the NEXT round are chosen from this round''s standing '
  '(none|top_n|top_percent|threshold|manual). none = no elimination.';
COMMENT ON COLUMN competition_rounds.advancement_value IS
  'Phase 6: N (top_n), percent 0-100 (top_percent), or minimum score (threshold). NULL otherwise.';
COMMENT ON COLUMN competition_rounds.score_policy IS
  'Phase 6: independent = round scored on its own; cumulative = carries prior finalized rounds.';
COMMENT ON COLUMN competition_rounds.finalized_at IS
  'Phase 6: set when the round is finalized; finalized rounds lock their scores.';

-- 2. Official per-round standing snapshot -----------------------------------
-- Written on finalize; immutable audit of who ranked where and who advanced.
CREATE TABLE IF NOT EXISTS competition_round_results (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    round_id      UUID NOT NULL REFERENCES competition_rounds (id) ON DELETE CASCADE,
    contestant_id UUID NOT NULL REFERENCES competition_contestants (id) ON DELETE CASCADE,
    division_id   UUID REFERENCES competition_divisions (id) ON DELETE SET NULL,
    rank          INTEGER NOT NULL,
    score         NUMERIC(10, 4) NOT NULL DEFAULT 0,
    qualified     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT competition_round_results_unique UNIQUE (round_id, contestant_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_round_results_round_id
  ON competition_round_results (round_id);
CREATE INDEX IF NOT EXISTS idx_competition_round_results_qualified
  ON competition_round_results (round_id, qualified);

COMMENT ON TABLE competition_round_results IS
  'Phase 6: official per-round standing snapshot written on finalize. Drives advancement '
  '(qualified rows seed the next round) and gives results an auditable, immutable record.';
