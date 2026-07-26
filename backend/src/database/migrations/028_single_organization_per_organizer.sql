-- Phase 10 — Consolidate to single organization per organizer
--
-- Goal: remove organization_type from organizations table and ensure
--       1:1 relationship between organizer and organization.
--
-- The organization_type ENUM is kept but deprecated. The unique constraint
-- on (organizer_id) ensures 1:1 enforcement going forward.
--
-- Organization name and logo are moved to the users table so each organizer
-- has exactly one organization profile regardless of which module they use.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add organization fields to users table
-- ---------------------------------------------------------------------------
ALTER TABLE users
ADD COLUMN IF NOT EXISTS organization_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS organization_logo TEXT;

COMMENT ON COLUMN users.organization_name IS 'Display name for the organizer''s single organization.';

COMMENT ON COLUMN users.organization_logo IS 'Cloudinary URL for the organization branding logo.';

-- ---------------------------------------------------------------------------
-- 2. Backfill organization_name and organization_logo from organizations table
--    Pick the first-created organization for each organizer.
-- ---------------------------------------------------------------------------
UPDATE users u
SET
    organization_name = sub.organization_name,
    organization_logo = sub.logo
FROM (
        SELECT DISTINCT
            ON (organizer_id) organizer_id, organization_name, logo
        FROM organizations
        WHERE
            organizer_id IS NOT NULL
        ORDER BY organizer_id, created_at ASC
    ) sub
WHERE
    u.id = sub.organizer_id
    AND u.role = 'organizer'
    AND u.organization_name IS NULL;

-- Set default name for any organizer without an organization row yet
UPDATE users
SET
    organization_name = 'My Organization'
WHERE
    role = 'organizer'
    AND organization_name IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Add unique constraint on organizations.organizer_id (enforce 1:1)
--    First clean up any duplicates keeping only the earliest-created org.
-- ---------------------------------------------------------------------------
DELETE FROM organizations
WHERE
    id IN (
        SELECT id
        FROM (
                SELECT id, ROW_NUMBER() OVER (
                        PARTITION BY
                            organizer_id
                        ORDER BY created_at ASC
                    ) AS rn
                FROM organizations
                WHERE
                    organizer_id IS NOT NULL
            ) sub
        WHERE
            sub.rn > 1
    );

-- Now safe to add unique constraint
ALTER TABLE organizations
DROP CONSTRAINT IF EXISTS organizations_organizer_id_unique;

ALTER TABLE organizations
ADD CONSTRAINT organizations_organizer_id_unique UNIQUE (organizer_id);

-- ---------------------------------------------------------------------------
-- 4. Remove the separate logo column from organizations since it's now on users
--    Keep organization_type column but mark as deprecated (don't drop yet)
-- ---------------------------------------------------------------------------
ALTER TABLE organizations DROP COLUMN IF EXISTS logo;

-- ---------------------------------------------------------------------------
-- 5. Update the comment on organization_type to mark as deprecated
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN organizations.organization_type IS 'DEPRECATED — organization_type is no longer used. All events under an organization use events.event_type.';

-- ---------------------------------------------------------------------------
-- 6. Update organizations comment
-- ---------------------------------------------------------------------------
COMMENT ON
TABLE organizations IS 'Tenant container owned by an organizer. Now 1:1 with users (organizer). organization_type is deprecated.';

-- ---------------------------------------------------------------------------
-- 7. ANALYZE for fresh statistics
-- ---------------------------------------------------------------------------
ANALYZE users;

ANALYZE organizations;

COMMIT;