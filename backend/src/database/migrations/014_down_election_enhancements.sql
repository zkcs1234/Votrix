-- Phase 3 — Election Management Enhancement (DOWN)
--
-- Reverses 013_election_enhancements.sql.
-- Existing voting logic remains unchanged either way.

BEGIN;

DROP INDEX IF EXISTS idx_events_results_visibility;
ALTER TABLE events DROP COLUMN IF EXISTS results_visibility;

ALTER TABLE candidates DROP COLUMN IF EXISTS platform;
ALTER TABLE candidates DROP COLUMN IF EXISTS biography;

DROP INDEX IF EXISTS idx_positions_event_id_display_order;
ALTER TABLE positions DROP CONSTRAINT IF EXISTS positions_number_of_winners_positive;
ALTER TABLE positions DROP COLUMN IF EXISTS display_order;
ALTER TABLE positions DROP COLUMN IF EXISTS number_of_winners;
ALTER TABLE positions DROP COLUMN IF EXISTS description;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'election_results_visibility') THEN
    DROP TYPE election_results_visibility;
  END IF;
END
$$;

COMMIT;
