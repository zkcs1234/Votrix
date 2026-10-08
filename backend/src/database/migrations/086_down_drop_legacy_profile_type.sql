-- Restore the former profile_type column and indexes before rolling back 084.
-- The membership combinations must be representable by the old exclusive
-- student/judge profile model; otherwise stop and preserve the new schema.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'user_participant_types'
  ) THEN
    RAISE EXCEPTION 'Restore user_participant_types with migration 084 down before rolling back migration 086';
  END IF;

  IF EXISTS (
    SELECT user_id
    FROM user_participant_types
    GROUP BY user_id
    HAVING BOOL_OR(participant_type = 'COMPETITION_JUDGE')
       AND BOOL_OR(participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT'))
  ) THEN
    RAISE EXCEPTION 'Cannot restore profile_type: at least one account has both Competition Judge and student-pool memberships';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM users u
    WHERE u.role::text IN ('voter', 'participant')
      AND NOT EXISTS (
        SELECT 1 FROM user_participant_types upt WHERE upt.user_id = u.id
      )
  ) THEN
    RAISE EXCEPTION 'Cannot restore profile_type: at least one participant account has no type membership';
  END IF;

  IF EXISTS (
    SELECT lower(u.school_id)
    FROM users u
    WHERE u.role::text IN ('voter', 'participant')
      AND u.school_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM user_participant_types upt
        WHERE upt.user_id = u.id
          AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT')
      )
    GROUP BY lower(u.school_id)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Resolve duplicate school IDs among student-pool accounts before rolling back migration 086';
  END IF;
END
$$;

ALTER TABLE users ADD COLUMN profile_type VARCHAR(16);

UPDATE users u
SET profile_type = CASE
  WHEN EXISTS (
    SELECT 1 FROM user_participant_types upt
    WHERE upt.user_id = u.id
      AND upt.participant_type = 'COMPETITION_JUDGE'
  ) THEN 'judge'
  ELSE 'student'
END
WHERE u.role::text IN ('voter', 'participant');

ALTER TABLE users
ADD CONSTRAINT chk_users_profile_type CHECK (
    profile_type IS NULL
    OR profile_type IN ('student', 'judge')
);

DROP INDEX IF EXISTS uq_users_school_id_participant;

CREATE UNIQUE INDEX uq_users_school_id_student ON users (lower(school_id))
WHERE
    profile_type = 'student'
    AND school_id IS NOT NULL;

CREATE INDEX idx_users_profile_type_program ON users (profile_type, program);

CREATE INDEX idx_users_profile_type_year_section ON users (profile_type, year_section);

COMMIT;