-- Migration 036 down: revert event archival
DROP INDEX IF EXISTS idx_events_archived_at;
ALTER TABLE events DROP COLUMN IF EXISTS archived_at;
