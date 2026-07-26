-- Phase 10 — Down migration
-- Revert the single organization per organizer consolidation.

BEGIN;

-- Drop the unique constraint on organizer_id
ALTER TABLE organizations
DROP CONSTRAINT IF EXISTS organizations_organizer_id_unique;

-- Restore the logo column to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo TEXT;

-- Restore logo from users table (pick the one we saved)
UPDATE organizations o
SET
    logo = u.organization_logo
FROM users u
WHERE
    o.organizer_id = u.id
    AND u.role = 'organizer'
    AND o.logo IS NULL;

-- Remove organization fields from users
ALTER TABLE users
DROP COLUMN IF EXISTS organization_logo,
DROP COLUMN IF EXISTS organization_name;

-- Restore original comments
COMMENT ON COLUMN organizations.organization_type IS 'Deprecated — organization_type is no longer used for new logic.';

COMMENT ON
TABLE organizations IS 'Tenant container owned by an organizer.';

COMMIT;