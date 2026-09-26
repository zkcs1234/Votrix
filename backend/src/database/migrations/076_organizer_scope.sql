-- Migration 076 — Organizer scope
--
-- Phase A of ORGANIZER_REGISTRATION_AND_SCOPING_PLAN.md.
-- Additive and NON-BEHAVIORAL: adds a nullable `scope` JSONB to `users` and
-- backfills every existing organizer to all-access, so behavior is unchanged
-- until later phases read/enforce the scope.
--
-- Shape:
--   { "scopeType": "all" | "scoped", "programs": [...], "sections": [...] }
--   - all    → unrestricted (default for existing organizers, decision O8)
--   - scoped → limited to the listed programs, optionally narrowed to sections
--
-- Idempotent (IF NOT EXISTS + guarded backfill), safe to re-run.

BEGIN;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS scope JSONB;

COMMENT ON COLUMN users.scope IS 'Organizer voter scope (plan O3/O5): { scopeType: all|scoped, programs: [], sections: [] }. NULL for non-organizer accounts.';

-- Backfill existing organizers to all-access so nothing changes for them.
UPDATE users
SET scope = '{"scopeType":"all","programs":[],"sections":[]}'::jsonb
WHERE role = 'organizer'
  AND scope IS NULL;

ANALYZE users;

COMMIT;
