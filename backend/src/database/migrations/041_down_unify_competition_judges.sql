-- Down migration for 041_unify_competition_judges.sql.
--
-- Restores competition_judges as the writable table and re-points
-- competition_judge_assignments.judge_id back to competition_judges.id.

BEGIN;

DROP VIEW IF EXISTS competition_judges;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname = 'competition_judges_legacy'
      AND relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname = 'competition_judges'
  ) THEN
    ALTER TABLE competition_judges_legacy RENAME TO competition_judges;
  END IF;
END
$$;

INSERT INTO competition_judges (
  event_id,
  user_id,
  role,
  display_name,
  is_active,
  has_submitted,
  created_at,
  updated_at
)
SELECT
  ep.event_id,
  ep.user_id,
  COALESCE(ep.judge_role, 'judge'::competition_judge_role),
  ep.display_name,
  ep.is_active,
  ep.has_scored,
  ep.created_at,
  ep.updated_at
FROM event_participants ep
WHERE ep.participant_type = 'COMPETITION_JUDGE'
ON CONFLICT (event_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name,
  is_active = EXCLUDED.is_active,
  has_submitted = EXCLUDED.has_submitted,
  updated_at = EXCLUDED.updated_at;

ALTER TABLE competition_judge_assignments
  ADD COLUMN IF NOT EXISTS judge_id UUID;

UPDATE competition_judge_assignments a
SET judge_id = cj.id
FROM event_participants ep
JOIN competition_judges cj
  ON cj.event_id = ep.event_id
  AND cj.user_id = ep.user_id
WHERE a.participant_id = ep.id
  AND a.judge_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM competition_judge_assignments
    WHERE judge_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot restore judge assignments: one or more rows could not be mapped to competition_judges';
  END IF;
END
$$;

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'competition_judge_assignments'::regclass
      AND (
        conname IN (
          'competition_judge_assignments_unique',
          'competition_judge_assignments_participant_fk'
        )
        OR pg_get_constraintdef(oid) LIKE '%(participant_id, scope, scope_id)%'
      )
  LOOP
    EXECUTE format('ALTER TABLE competition_judge_assignments DROP CONSTRAINT %I', cname);
  END LOOP;
END
$$;

ALTER TABLE competition_judge_assignments
  ALTER COLUMN judge_id SET NOT NULL,
  DROP COLUMN IF EXISTS participant_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'competition_judge_assignments'::regclass
      AND conname = 'competition_judge_assignments_judge_id_fkey'
  ) THEN
    ALTER TABLE competition_judge_assignments
      ADD CONSTRAINT competition_judge_assignments_judge_id_fkey
      FOREIGN KEY (judge_id) REFERENCES competition_judges(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'competition_judge_assignments'::regclass
      AND conname = 'competition_judge_assignments_unique'
  ) THEN
    ALTER TABLE competition_judge_assignments
      ADD CONSTRAINT competition_judge_assignments_unique
      UNIQUE (judge_id, scope, scope_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_competition_judge_assignments_judge_id
  ON competition_judge_assignments (judge_id);

DROP INDEX IF EXISTS idx_judge_assignments_lookup;

CREATE INDEX IF NOT EXISTS idx_judge_assignments_lookup
  ON competition_judge_assignments (judge_id, scope, scope_id);

ALTER TABLE event_participants
  DROP COLUMN IF EXISTS judge_role,
  DROP COLUMN IF EXISTS display_name,
  DROP COLUMN IF EXISTS is_active;

COMMIT;
