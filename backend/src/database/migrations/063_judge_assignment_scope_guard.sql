-- Migration 063 — Integrity guard for competition_judge_assignments.scope_id
--
-- Issue E from DATABASE_SCHEMA_CURRENT.md §6:
--   scope_id is a polymorphic UUID that points at an event, category, round,
--   or division depending on `scope`, so it cannot have a normal foreign key.
--   Referential integrity was app-enforced only. This adds a DB-level trigger
--   that validates, on INSERT/UPDATE, that scope_id exists in the correct
--   table AND belongs to the same event as the assignment's participant.
--
-- SAFETY:
--   • A BEFORE INSERT/UPDATE trigger only affects NEW writes. Existing rows are
--     NOT re-checked, so this cannot break current data or reads.
--   • It mirrors the pattern already used by the division triggers in
--     migration 038 (fn_validate_division_belongs_to_event).
--
-- PRE-CHECK (run first — see runbook) to find any EXISTING bad rows that would
-- fail a future UPDATE. Reporting only; not blocked by this migration.
--
-- Reversible via 063_down_judge_assignment_scope_guard.sql.

BEGIN;

CREATE OR REPLACE FUNCTION fn_validate_judge_assignment_scope()
RETURNS TRIGGER AS $$
DECLARE
  v_participant_event UUID;
  v_scope_event       UUID;
BEGIN
  -- The assignment's participant tells us which event this must stay inside.
  SELECT ep.event_id INTO v_participant_event
    FROM event_participants ep
   WHERE ep.id = NEW.participant_id;

  IF v_participant_event IS NULL THEN
    RAISE EXCEPTION 'judge assignment: participant % does not exist', NEW.participant_id;
  END IF;

  IF NEW.scope = 'event' THEN
    -- scope_id must be the event itself.
    IF NOT EXISTS (SELECT 1 FROM events WHERE id = NEW.scope_id) THEN
      RAISE EXCEPTION 'judge assignment: scope_id % is not a valid event', NEW.scope_id;
    END IF;
    IF NEW.scope_id <> v_participant_event THEN
      RAISE EXCEPTION 'judge assignment: event scope_id % must equal participant event %',
        NEW.scope_id, v_participant_event;
    END IF;

  ELSIF NEW.scope = 'category' THEN
    SELECT event_id INTO v_scope_event FROM competition_categories WHERE id = NEW.scope_id;
    IF v_scope_event IS NULL THEN
      RAISE EXCEPTION 'judge assignment: scope_id % is not a valid category', NEW.scope_id;
    END IF;
    IF v_scope_event <> v_participant_event THEN
      RAISE EXCEPTION 'judge assignment: category % belongs to a different event', NEW.scope_id;
    END IF;

  ELSIF NEW.scope = 'round' THEN
    SELECT event_id INTO v_scope_event FROM competition_rounds WHERE id = NEW.scope_id;
    IF v_scope_event IS NULL THEN
      RAISE EXCEPTION 'judge assignment: scope_id % is not a valid round', NEW.scope_id;
    END IF;
    IF v_scope_event <> v_participant_event THEN
      RAISE EXCEPTION 'judge assignment: round % belongs to a different event', NEW.scope_id;
    END IF;

  ELSIF NEW.scope = 'division' THEN
    SELECT event_id INTO v_scope_event FROM competition_divisions WHERE id = NEW.scope_id;
    IF v_scope_event IS NULL THEN
      RAISE EXCEPTION 'judge assignment: scope_id % is not a valid division', NEW.scope_id;
    END IF;
    IF v_scope_event <> v_participant_event THEN
      RAISE EXCEPTION 'judge assignment: division % belongs to a different event', NEW.scope_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_judge_assignment_scope ON competition_judge_assignments;

CREATE TRIGGER trg_validate_judge_assignment_scope
  BEFORE INSERT OR UPDATE OF participant_id, scope, scope_id
  ON competition_judge_assignments
  FOR EACH ROW EXECUTE FUNCTION fn_validate_judge_assignment_scope();

COMMIT;
