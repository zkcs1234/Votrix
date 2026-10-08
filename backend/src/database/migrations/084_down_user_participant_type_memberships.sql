-- Restore the legacy single profile discriminator only when every membership
-- set is representable as either student (election/polling) or judge.
-- Refuse to discard a student+judge combination or an unclassified account.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'profile_type'
  ) THEN
    RAISE EXCEPTION 'Restore profile_type with migration 086 down before rolling back migration 084';
  END IF;

  IF EXISTS (
    SELECT user_id
    FROM user_participant_types
    GROUP BY user_id
    HAVING BOOL_OR(participant_type = 'COMPETITION_JUDGE')
       AND BOOL_OR(participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT'))
  ) THEN
    RAISE EXCEPTION 'Cannot roll back: at least one account has both Competition Judge and student-pool memberships';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM users u
    WHERE u.role::text IN ('voter', 'participant')
      AND u.profile_type IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_participant_types upt WHERE upt.user_id = u.id
      )
  ) THEN
    RAISE EXCEPTION 'Cannot roll back: at least one participant account has no profile or type membership to reconstruct';
  END IF;
END
$$;

UPDATE users u
SET profile_type = CASE
  WHEN EXISTS (
    SELECT 1 FROM user_participant_types upt
    WHERE upt.user_id = u.id
      AND upt.participant_type = 'COMPETITION_JUDGE'
  ) THEN 'judge'
  ELSE 'student'
END
WHERE u.role::text IN ('voter', 'participant')
  AND u.profile_type IS NULL
  AND EXISTS (
    SELECT 1 FROM user_participant_types upt WHERE upt.user_id = u.id
  );

DROP INDEX IF EXISTS uq_users_school_id_participant;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_school_id_student
  ON users (lower(school_id))
  WHERE profile_type = 'student' AND school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_profile_type_program
  ON users (profile_type, program);

CREATE INDEX IF NOT EXISTS idx_users_profile_type_year_section
  ON users (profile_type, year_section);

DROP TABLE user_participant_types;

COMMIT;