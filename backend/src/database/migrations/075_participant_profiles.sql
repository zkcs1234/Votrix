-- Migration 075 — Participant profiles + taxonomy seed
--
-- Phase 1 of VOTER_PROFILE_AND_ADMIN_REGISTRATION_PLAN.md.
-- Additive and NON-BEHAVIORAL: adds nullable profile columns to `users`,
-- supporting indexes, backfills a profile discriminator for existing voters,
-- and seeds an empty managed-taxonomy row. No application behavior changes
-- until later phases read/write these fields.
--
-- Decisions implemented (see plan §0):
--   D5  — profile lives on `users` (+ profile_data jsonb). No new tables.
--   D6  — `profile_type` discriminator: 'student' | 'judge'.
--   D13 — managed Programs/Sections stored in system_settings JSON.
--
-- All statements use IF NOT EXISTS / ON CONFLICT so the migration is
-- idempotent and safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Profile columns on users (all nullable — organizer/admin rows untouched)
-- ---------------------------------------------------------------------------
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_type  VARCHAR(16),
ADD COLUMN IF NOT EXISTS first_name    VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_name     VARCHAR(255),
ADD COLUMN IF NOT EXISTS school_id     VARCHAR(64),
ADD COLUMN IF NOT EXISTS program        VARCHAR(255),
ADD COLUMN IF NOT EXISTS year_section  VARCHAR(64),
ADD COLUMN IF NOT EXISTS profile_data  JSONB;

COMMENT ON COLUMN users.profile_type IS 'Participant profile discriminator: student (voter/respondent pool) or judge. NULL for admin/organizer.';
COMMENT ON COLUMN users.first_name IS 'Given name (student + judge profiles).';
COMMENT ON COLUMN users.last_name IS 'Family name (student + judge profiles).';
COMMENT ON COLUMN users.school_id IS 'Student identifier; unique among students (partial unique index).';
COMMENT ON COLUMN users.program IS 'Student program, validated against the managed taxonomy (D13).';
COMMENT ON COLUMN users.year_section IS 'Student year & section, validated against the managed taxonomy (D13).';
COMMENT ON COLUMN users.profile_data IS 'Role-specific extras as JSON; judges: { title, affiliation, expertise }.';

-- Keep profile_type constrained but allow NULL for non-participant accounts.
-- Added as a named constraint so the down migration can drop it cleanly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_profile_type'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_users_profile_type
      CHECK (profile_type IS NULL OR profile_type IN ('student', 'judge'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Indexes
--    - school_id unique among students (case-insensitive, partial).
--    - cohort lookups by program / year_section within the student pool.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_school_id_student
  ON users (lower(school_id))
  WHERE profile_type = 'student' AND school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_profile_type_program
  ON users (profile_type, program);

CREATE INDEX IF NOT EXISTS idx_users_profile_type_year_section
  ON users (profile_type, year_section);

-- ---------------------------------------------------------------------------
-- 3. Backfill existing voter accounts as 'student'
--    Existing accounts were created by organizers with only an email. They
--    default to the student pool so the app keeps working. NOTE: any legacy
--    JUDGE accounts (also role='voter') are captured here as 'student' and
--    must be reclassified by the admin later (plan Phase 9 / risk #4).
-- ---------------------------------------------------------------------------
UPDATE users
SET profile_type = 'student'
WHERE role = 'voter'
  AND profile_type IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Seed the managed taxonomy row (empty; admin populates it in Phase 2)
-- ---------------------------------------------------------------------------
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES (
  'participant_taxonomy',
  '{"programs": [], "sections": []}'::jsonb,
  'Managed lists of valid Programs and Year & Sections for student participants (plan D13).'
)
ON CONFLICT (setting_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Refresh statistics
-- ---------------------------------------------------------------------------
ANALYZE users;

COMMIT;
