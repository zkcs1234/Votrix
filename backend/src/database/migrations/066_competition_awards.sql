-- ---------------------------------------------------------------------------
-- 066 — Competition Awards (optional feature)
--
-- Additive and reversible. Awards are OFF by default (awards_enabled = FALSE),
-- so every existing competition is unchanged. Phase 1 covers award DEFINITIONS
-- and DERIVED awards (method = 'score' | 'criteria') that reuse existing scores.
-- Interactive methods ('vote' | 'selection') are allowed by the CHECK for a
-- later phase; their per-judge selection tables are added separately.
-- ---------------------------------------------------------------------------

-- 1. Opt-in flag on the event (mirrors divisions_enabled).
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS awards_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Award definitions.
CREATE TABLE IF NOT EXISTS competition_awards (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name               VARCHAR(120) NOT NULL,
  description        TEXT,                                   -- optional
  method             VARCHAR(16) NOT NULL DEFAULT 'score',   -- score | criteria | vote | selection
  division_id        UUID REFERENCES competition_divisions (id) ON DELETE SET NULL,
  category_id        UUID REFERENCES competition_categories (id) ON DELETE SET NULL,
  source_round_id    UUID REFERENCES competition_rounds (id) ON DELETE SET NULL,
  source_criteria_id UUID REFERENCES competition_criteria (id) ON DELETE SET NULL,
  status             VARCHAR(16) NOT NULL DEFAULT 'draft',   -- draft | open | closed | finalized
  tie_break          VARCHAR(24),
  display_order      INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at       TIMESTAMPTZ,
  CONSTRAINT competition_awards_method_chk
    CHECK (method IN ('score', 'criteria', 'vote', 'selection')),
  CONSTRAINT competition_awards_status_chk
    CHECK (status IN ('draft', 'open', 'closed', 'finalized'))
);

CREATE INDEX IF NOT EXISTS idx_competition_awards_event_id
  ON competition_awards (event_id);

COMMENT ON TABLE competition_awards IS
  'Optional per-event awards. Derived (score/criteria) reuse existing scores; interactive (vote/selection) are a later phase.';
