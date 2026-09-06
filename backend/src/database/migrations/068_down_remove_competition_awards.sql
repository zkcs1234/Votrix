-- ---------------------------------------------------------------------------
-- 068 down — Recreate Competition Awards
-- ---------------------------------------------------------------------------

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS awards_enabled BOOLEAN NOT NULL DEFAULT FALSE;

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

CREATE TABLE IF NOT EXISTS competition_award_selections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id      UUID NOT NULL REFERENCES competition_awards (id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  judge_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  contestant_id UUID NOT NULL REFERENCES competition_contestants (id) ON DELETE CASCADE,
  is_locked     BOOLEAN NOT NULL DEFAULT TRUE,
  locked_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT competition_award_selections_unique UNIQUE (award_id, judge_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_award_selections_award
  ON competition_award_selections (award_id);
