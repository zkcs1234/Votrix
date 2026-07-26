-- Rollback Migration 029 — Event Participant Role System

BEGIN;

DROP TRIGGER IF EXISTS trg_event_participants_validate_type ON event_participants;

DROP FUNCTION IF EXISTS fn_validate_participant_event_type ();

DROP VIEW IF EXISTS v_event_voters;

DROP TABLE IF EXISTS event_participants;

DROP TYPE IF EXISTS participant_type;

COMMIT;