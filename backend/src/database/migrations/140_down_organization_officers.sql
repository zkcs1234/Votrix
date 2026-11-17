-- Down migration 140 — remove organization officers.
-- Reverses 140_organization_officers.sql. Student accounts are not touched;
-- they simply lose officer access.

BEGIN;

DROP TABLE IF EXISTS organization_officers;

COMMIT;
