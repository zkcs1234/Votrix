-- Rollback migration 031 — Organizer Onboarding Profile

BEGIN;

ALTER TABLE users
DROP COLUMN IF EXISTS organizer_name,
DROP COLUMN IF EXISTS position,
DROP COLUMN IF EXISTS organization_type_display;

COMMIT;