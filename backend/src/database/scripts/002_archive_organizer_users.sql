-- Archive all organizer users to block sign-in without breaking FK constraints.
--
-- Why: organizations.organizer_id is NOT NULL with ON DELETE RESTRICT.
-- Therefore we must not hard-delete organizer users.
--
-- This script:
--  - sets users.account_status='archived' for role='organizer'
--  - optionally archives their organizations (best-effort)
--  - does NOT modify emails/identifiers (organizer email should remain unchanged)
--
-- Safe to run multiple times.

BEGIN;

-- 1) Block organizer account access
UPDATE users
SET
    account_status = 'archived'
WHERE
    role = 'organizer'
    AND account_status IS DISTINCT
FROM 'archived';

-- 2) Archive their organizations (if organizations.status exists in this schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'organizations'
      AND column_name = 'status'
  ) THEN
    UPDATE organizations
    SET status = 'archived'
    WHERE organizer_id IN (
      SELECT id FROM users WHERE role = 'organizer'
    )
      AND status IS DISTINCT FROM 'archived';
  END IF;
END
$$;

COMMIT;