-- Down migration 075 — remove participant profile columns + taxonomy seed.
--
-- Reverses 075_participant_profiles.sql. Safe/idempotent. Because Phase 1 is
-- non-behavioral, rolling back only discards the (blank) profile columns and
-- the seeded taxonomy row — no participant data is created in Phase 1.

BEGIN;

-- 1. Drop indexes
DROP INDEX IF EXISTS uq_users_school_id_student;
DROP INDEX IF EXISTS idx_users_profile_type_program;
DROP INDEX IF EXISTS idx_users_profile_type_year_section;

-- 2. Drop the check constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_profile_type;

-- 3. Drop the profile columns
ALTER TABLE users
DROP COLUMN IF EXISTS profile_type,
DROP COLUMN IF EXISTS first_name,
DROP COLUMN IF EXISTS last_name,
DROP COLUMN IF EXISTS school_id,
DROP COLUMN IF EXISTS program,
DROP COLUMN IF EXISTS year_section,
DROP COLUMN IF EXISTS profile_data;

-- 4. Remove the seeded taxonomy row
DELETE FROM system_settings WHERE setting_key = 'participant_taxonomy';

COMMIT;
