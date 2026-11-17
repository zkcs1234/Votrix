-- Migration 143 — Drop users.year_section
--
-- Students are identified by Program only; Year & Section is no longer collected
-- or used (organizer scopes, cohorts, eligibility and analytics are all
-- program-based). The column and its index are removed.
--
-- IRREVERSIBLE for the data: the down file re-adds an EMPTY column. Keep a
-- backup of the values first if you may want them again:
--   CREATE TABLE users_year_section_backup AS
--     SELECT id, year_section FROM users WHERE year_section IS NOT NULL;
--
-- Idempotent (IF EXISTS), safe to re-run. If a view depends on the column the
-- ALTER fails and names it; drop or recreate that view first.

BEGIN;

DROP INDEX IF EXISTS idx_users_profile_type_year_section;
ALTER TABLE users DROP COLUMN IF EXISTS year_section;

COMMIT;
