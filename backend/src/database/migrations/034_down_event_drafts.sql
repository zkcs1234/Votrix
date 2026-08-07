-- Migration 034 DOWN — remove persistent draft storage.
-- Any saved drafts are lost. Existing events are untouched.

BEGIN;

DROP TRIGGER IF EXISTS trg_event_drafts_updated_at ON event_drafts;
DROP TABLE IF EXISTS event_drafts;

COMMIT;
