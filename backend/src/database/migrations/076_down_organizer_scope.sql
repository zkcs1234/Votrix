-- Down migration 076 — remove organizer scope.
-- Reverses 076_organizer_scope.sql. Phase A is non-behavioral, so rolling back
-- only discards the (all-access) scope column.

BEGIN;

ALTER TABLE users DROP COLUMN IF EXISTS scope;

COMMIT;
