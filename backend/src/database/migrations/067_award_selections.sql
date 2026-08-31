-- ---------------------------------------------------------------------------
-- 067 — Interactive award selections (Vote / Judge Selection). Additive.
--
-- One row per judge per award (UNIQUE) so an edit REPLACES rather than adds —
-- the same no-double-count guarantee as competition_session_judge_scores.
-- Eligible judges = the event's active competition judges (no per-award judge
-- table in this phase; can be added later without changing this shape).
-- ---------------------------------------------------------------------------
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
