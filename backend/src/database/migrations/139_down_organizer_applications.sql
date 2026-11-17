-- Down migration 139 — remove organizer applications.
-- Reverses 139_organizer_applications.sql. Organizer accounts already created
-- by an approval are NOT touched (they are ordinary users rows).

BEGIN;

DROP TABLE IF EXISTS organizer_applications;

COMMIT;
