-- Down migration 138 — remove organizer invitations.
-- Reverses 138_organizer_invitations.sql. Run the 139 down first (it references
-- this table).

BEGIN;

DROP TABLE IF EXISTS organizer_invitations;

COMMIT;
