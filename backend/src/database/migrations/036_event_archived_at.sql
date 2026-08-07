-- Migration 036: event archival support
-- Adds an archived_at timestamp so we can audit when an event was archived
-- (either by an admin manual run or the future scheduled job).

ALTER TABLE events ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_events_archived_at
  ON events (archived_at) WHERE archived_at IS NOT NULL;
