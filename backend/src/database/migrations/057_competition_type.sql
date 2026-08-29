-- 057_competition_type.sql
-- Phase 1 — Competition sub-type label.
--
-- Adds an OPTIONAL, nullable `competition_type` to events. It is used purely for
-- display, filtering, and starter-template selection. It is NEVER branched on in
-- scoring or live-session logic — the scoring engine stays fully generic.
--
-- Additive and reversible: no backfill, existing events keep competition_type = NULL.
-- Apply in the Supabase SQL Editor in numeric order (see database/README.md).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS competition_type VARCHAR(32);

-- Partial index: only non-null types are ever filtered on.
CREATE INDEX IF NOT EXISTS idx_events_competition_type
  ON events (competition_type)
  WHERE competition_type IS NOT NULL;

COMMENT ON COLUMN events.competition_type IS
  'Phase 1: optional competition sub-type (pageant|dance|singing|talent|simple|...). '
  'Display / filtering / template selection only — never affects scoring or live logic. '
  'NULL = unset (blank/simple).';
