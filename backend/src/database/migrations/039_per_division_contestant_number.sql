-- Migration 039 — Per-division contestant number uniqueness
--
-- Previously, competition_contestants had:
--   UNIQUE (event_id, contestant_number)
-- which forced all contestants in the same event to have unique numbers.
-- With divisions enabled (Male/Female, Junior/Senior, etc.), organizers
-- expect to use the same contestant number within each division.
--
-- Fix:
--   • Drop the old global unique constraint.
--   • Add a partial unique index for the "no division" case (NULL division_id).
--   • Add a unique index for the per-division case.
--
-- This preserves backward compatibility for events with divisions_enabled=FALSE
-- (only one bucket, division_id IS NULL, behaves like the old constraint).
-- For events with divisions enabled, the same number may now be reused in
-- each division independently.

BEGIN;

-- 1. Drop old constraint (if it still exists)
ALTER TABLE competition_contestants
  DROP CONSTRAINT IF EXISTS contestants_number_unique;

-- 1b. Drop the auto-converted index (Postgres turns a unique constraint into a
-- unique index; dropping the constraint leaves the index behind on some
-- versions and migration paths). It must be removed too or it will continue
-- to block cross-division inserts.
DROP INDEX IF EXISTS public.competition_contestants_number_unique;

-- 2. Per-division uniqueness (covers division_id IS NOT NULL rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_contestants_event_division_number
  ON competition_contestants (event_id, division_id, contestant_number)
  WHERE division_id IS NOT NULL;

-- 3. Event-wide uniqueness (covers division_id IS NULL rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_contestants_event_wide_number
  ON competition_contestants (event_id, contestant_number)
  WHERE division_id IS NULL;

-- 4. Helpful composite index for "next available number in this division" lookups
CREATE INDEX IF NOT EXISTS idx_competition_contestants_event_division_number_lookup
  ON competition_contestants (event_id, division_id, contestant_number DESC);

COMMIT;
