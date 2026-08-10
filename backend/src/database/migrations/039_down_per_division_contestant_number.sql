-- Down Migration 039 — Revert per-division contestant number uniqueness

BEGIN;

DROP INDEX IF EXISTS idx_competition_contestants_event_division_number_lookup;
DROP INDEX IF EXISTS idx_competition_contestants_event_wide_number;
DROP INDEX IF EXISTS idx_competition_contestants_event_division_number;

-- Restore old constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contestants_number_unique'
  ) THEN
    ALTER TABLE competition_contestants
      ADD CONSTRAINT contestants_number_unique UNIQUE (event_id, contestant_number);
  END IF;
END
$$;

COMMIT;
