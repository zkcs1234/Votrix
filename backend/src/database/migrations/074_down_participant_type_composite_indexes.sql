-- Down migration 074 — drop the composite participant indexes.
-- Safe/idempotent: only removes the indexes added by 074, nothing else.

DROP INDEX IF EXISTS idx_event_participants_event_type_voted;
DROP INDEX IF EXISTS idx_event_participants_event_type_scored;
DROP INDEX IF EXISTS idx_event_participants_event_type_responded;
