-- Apply only after all deployed application code reads participant-type
-- memberships and no longer reads or writes users.profile_type.
-- This migration is intentionally forward-only: a single legacy profile_type
-- value cannot be reconstructed after accounts gain multiple type memberships.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users
    WHERE role IN ('voter', 'participant')
      AND school_id IS NOT NULL
    GROUP BY lower(school_id)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Resolve duplicate participant school_id values before applying migration 086';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_school_id_participant ON users (lower(school_id))
WHERE
    role IN ('voter', 'participant')
    AND school_id IS NOT NULL;

DROP INDEX IF EXISTS uq_users_school_id_student;

DROP INDEX IF EXISTS idx_users_profile_type_program;

DROP INDEX IF EXISTS idx_users_profile_type_year_section;

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_profile_type;

ALTER TABLE users DROP COLUMN IF EXISTS profile_type;

ANALYZE users;

COMMIT;