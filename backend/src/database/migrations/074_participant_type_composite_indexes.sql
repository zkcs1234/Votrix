-- Migration 074 — Composite indexes for type-scoped participant counts
--
-- Additive, non-destructive. Every index uses IF NOT EXISTS so this migration
-- is safe to re-run and creates no locks beyond the standard index build.
--
-- Why: the dashboards and aggregate counts query the shape
--   event_id IN (...) AND participant_type = X [AND has_voted/has_scored/has_responded]
-- (see dashboard.service.js, election/pageant/polling getOrganizerDashboard).
-- The existing index is on participant_type alone, so those queries still scan
-- and filter. These composites match the query shape so the counts become
-- index-only / index-range scans.

CREATE INDEX IF NOT EXISTS idx_event_participants_event_type_voted
  ON event_participants (event_id, participant_type, has_voted);

CREATE INDEX IF NOT EXISTS idx_event_participants_event_type_scored
  ON event_participants (event_id, participant_type, has_scored);

CREATE INDEX IF NOT EXISTS idx_event_participants_event_type_responded
  ON event_participants (event_id, participant_type, has_responded);
