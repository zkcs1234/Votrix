-- VOTRIX Phase 12 — Organizer Onboarding Profile
--
-- Adds organizer profile fields to the users table for the onboarding
-- flow. After login, organizers are required to complete their profile
-- (organization_name, organization_type_display, organizer_name, position)
-- before accessing the dashboard.
--
-- Requirements:
--   - Profile fields are stored directly on users (consistent with the
--     single-organization-per-organizer model from migration 028).
--   - Free-text fields — no enum/dropdown restrictions.
--   - Existing organizers are backfilled with empty strings to trigger
--     the onboarding flow on next login.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add profile columns to users table
-- ---------------------------------------------------------------------------
ALTER TABLE users
ADD COLUMN IF NOT EXISTS organizer_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS position VARCHAR(255),
ADD COLUMN IF NOT EXISTS organization_type_display VARCHAR(255);

COMMENT ON COLUMN users.organizer_name IS 'Organizer''s display name (required for profile completion).';

COMMENT ON COLUMN users.position IS 'Organizer''s position/role in the organization (required).';

COMMENT ON COLUMN users.organization_type_display IS 'Free-text organization type label (required), e.g. "Student Organization", "Department".';

-- ---------------------------------------------------------------------------
-- 2. Backfill existing organizer accounts
--    Set empty strings for new fields so existing organizers are prompted
--    to complete their profile. organization_name was added in migration 028
--    and may already be populated — preserve it.
-- ---------------------------------------------------------------------------
UPDATE users
SET
    organizer_name = COALESCE(
        NULLIF(organizer_name, ''),
        ''
    ),
    position = COALESCE(NULLIF(position, ''), ''),
    organization_type_display = COALESCE(
        NULLIF(organization_type_display, ''),
        ''
    )
WHERE
    role = 'organizer';

-- ---------------------------------------------------------------------------
-- 3. Activate existing organizer accounts
--    Before this migration, organizers were created as 'pending' and required
--    admin approval. Now organizers are immediately active on creation.
--    Set all existing pending organizers to 'active' so they can log in.
-- ---------------------------------------------------------------------------
UPDATE users
SET
    account_status = 'active'
WHERE
    role = 'organizer'
    AND account_status = 'pending';

-- ---------------------------------------------------------------------------
-- 4. Refresh statistics
-- ---------------------------------------------------------------------------
ANALYZE users;

COMMIT;