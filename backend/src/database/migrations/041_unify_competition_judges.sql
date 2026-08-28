-- Migration 041 - Unify competition judges under event_participants.
--
-- event_participants is now the only writable judge enrollment store.
-- competition_judges is kept as a read-only compatibility view.

BEGIN;

ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS judge_role competition_judge_role,
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Make sure deployments that missed migration 040 still have canonical judge
-- participants before assignments are re-pointed.
INSERT INTO event_participants (
  event_id,
  user_id,
  participant_type,
  has_scored,
  judge_role,
  display_name,
  is_active,
  metadata,
  created_at,
  updated_at
)
SELECT
  cj.event_id,
  cj.user_id,
  'COMPETITION_JUDGE'::participant_type,
  cj.has_submitted,
  cj.role,
  cj.display_name,
  cj.is_active,
  jsonb_build_object(
    'judgeRole', cj.role,
    'isActive', cj.is_active,
    'hasSubmitted', cj.has_submitted,
    'judgeRowId', cj.id
  ),
  cj.created_at,
  cj.updated_at
FROM competition_judges cj
ON CONFLICT (event_id, user_id) DO UPDATE SET
  participant_type = 'COMPETITION_JUDGE'::participant_type,
  has_scored = event_participants.has_scored OR EXCLUDED.has_scored,
  judge_role = COALESCE(event_participants.judge_role, EXCLUDED.judge_role),
  display_name = COALESCE(event_participants.display_name, EXCLUDED.display_name),
  is_active = event_participants.is_active AND EXCLUDED.is_active,
  metadata = COALESCE(event_participants.metadata, '{}'::jsonb) || EXCLUDED.metadata;

UPDATE event_participants ep
SET
  judge_role = COALESCE(ep.judge_role, cj.role),
  display_name = COALESCE(ep.display_name, cj.display_name),
  is_active = cj.is_active,
  has_scored = ep.has_scored OR cj.has_submitted,
  metadata = COALESCE(ep.metadata, '{}'::jsonb) || jsonb_build_object(
    'judgeRole', cj.role,
    'isActive', cj.is_active,
    'hasSubmitted', cj.has_submitted,
    'judgeRowId', cj.id
  )
FROM competition_judges cj
WHERE cj.event_id = ep.event_id
  AND cj.user_id = ep.user_id
  AND ep.participant_type = 'COMPETITION_JUDGE';

ALTER TABLE competition_judge_assignments
  ADD COLUMN IF NOT EXISTS participant_id UUID;

UPDATE competition_judge_assignments a
SET participant_id = ep.id
FROM competition_judges cj
JOIN event_participants ep
  ON ep.event_id = cj.event_id
  AND ep.user_id = cj.user_id
  AND ep.participant_type = 'COMPETITION_JUDGE'
WHERE a.judge_id = cj.id
  AND a.participant_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'competition_judge_assignments'
      AND column_name = 'judge_id'
  ) AND EXISTS (
    SELECT 1
    FROM competition_judge_assignments
    WHERE participant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot unify judge assignments: one or more rows could not be mapped to event_participants';
  END IF;
END
$$;

ALTER TABLE competition_judge_assignments
  ALTER COLUMN participant_id SET NOT NULL;

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'competition_judge_assignments'::regclass
      AND (
        conname = 'competition_judge_assignments_unique'
        OR pg_get_constraintdef(oid) LIKE '%(judge_id, scope, scope_id)%'
      )
  LOOP
    EXECUTE format('ALTER TABLE competition_judge_assignments DROP CONSTRAINT %I', cname);
  END LOOP;
END
$$;

ALTER TABLE competition_judge_assignments
  DROP COLUMN IF EXISTS judge_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'competition_judge_assignments'::regclass
      AND conname = 'competition_judge_assignments_participant_fk'
  ) THEN
    ALTER TABLE competition_judge_assignments
      ADD CONSTRAINT competition_judge_assignments_participant_fk
      FOREIGN KEY (participant_id) REFERENCES event_participants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'competition_judge_assignments'::regclass
      AND conname = 'competition_judge_assignments_unique'
  ) THEN
    ALTER TABLE competition_judge_assignments
      ADD CONSTRAINT competition_judge_assignments_unique
      UNIQUE (participant_id, scope, scope_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_competition_judge_assignments_participant_id
  ON competition_judge_assignments (participant_id);

DROP INDEX IF EXISTS idx_judge_assignments_lookup;

CREATE INDEX IF NOT EXISTS idx_judge_assignments_lookup
  ON competition_judge_assignments (participant_id, scope, scope_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname = 'competition_judges'
      AND relkind IN ('r', 'p')
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname = 'competition_judges_legacy'
  ) THEN
    ALTER TABLE competition_judges RENAME TO competition_judges_legacy;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname = 'competition_judges'
      AND relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION 'Cannot create competition_judges compatibility view while a table with that name still exists';
  END IF;
END
$$;

DROP VIEW IF EXISTS competition_judges;

CREATE OR REPLACE VIEW competition_judges AS
SELECT
  ep.id,
  ep.event_id,
  ep.user_id,
  COALESCE(ep.judge_role, 'judge'::competition_judge_role) AS role,
  COALESCE(
    ep.display_name,
    NULLIF(CONCAT_WS(' ', ep.first_name, ep.last_name), ''),
    u.email
  ) AS display_name,
  ep.is_active,
  ep.has_scored AS has_submitted,
  ep.created_at,
  ep.updated_at
FROM event_participants ep
LEFT JOIN users u ON u.id = ep.user_id
WHERE ep.participant_type = 'COMPETITION_JUDGE';

COMMENT ON VIEW competition_judges IS
  'Read-only compatibility view over event_participants. Application code must write judge enrollment to event_participants.';

COMMIT;
