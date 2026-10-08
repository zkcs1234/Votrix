-- Remove the participant enum label after the application and all rows have
-- been rolled back to the legacy `voter` role. PostgreSQL cannot drop an enum
-- label directly, so rebuild the enum and recast its only column.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE role::text = 'participant') THEN
    RAISE EXCEPTION 'Convert all participant roles back to voter before rolling back migration 083';
  END IF;
END
$$;

CREATE TYPE user_role_without_participant AS ENUM ('admin', 'organizer', 'voter');

ALTER TABLE users
  ALTER COLUMN role TYPE user_role_without_participant
  USING role::text::user_role_without_participant;

DROP TYPE user_role;
ALTER TYPE user_role_without_participant RENAME TO user_role;

COMMIT;