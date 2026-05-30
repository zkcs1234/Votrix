-- Phase 7 — Pageant module: judge flags and scoring toggle

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS scoring_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE event_voters
  ADD COLUMN IF NOT EXISTS is_judge BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_scored BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_event_voters_judge ON event_voters (event_id, is_judge);
CREATE INDEX IF NOT EXISTS idx_event_voters_has_scored ON event_voters (event_id, has_scored);

COMMENT ON COLUMN event_voters.is_judge IS 'Pageant: voter account acting as judge for this event.';
COMMENT ON COLUMN event_voters.has_scored IS 'Pageant: judge has submitted and locked scores for this event.';
COMMENT ON COLUMN events.scoring_enabled IS 'Pageant: when true, judges may submit scores.';
