-- Rollback Migration 030 — Remove information_form_schema column from events

BEGIN;

ALTER TABLE events DROP COLUMN IF EXISTS information_form_schema;

COMMIT;