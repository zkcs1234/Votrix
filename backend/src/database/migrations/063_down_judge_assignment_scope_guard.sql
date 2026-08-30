-- Down migration 063 — Remove the judge-assignment scope guard.

BEGIN;

DROP TRIGGER IF EXISTS trg_validate_judge_assignment_scope ON competition_judge_assignments;
DROP FUNCTION IF EXISTS fn_validate_judge_assignment_scope();

COMMIT;
