-- Migration 040 — Reconcile canonical event participants
--
-- Repairs deployments where enrollment data exists only in the legacy
-- event_voters table or only in competition_judges. After this migration,
-- event_participants is the sole application enrollment source.

BEGIN;

ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS voting_nonce UUID DEFAULT gen_random_uuid();

-- Reconcile legacy election voters, polling respondents, and legacy judges.
INSERT INTO event_participants (
  event_id,
  user_id,
  participant_type,
  has_voted,
  has_scored,
  has_responded,
  first_name,
  last_name,
  metadata,
  voting_nonce,
  created_at,
  updated_at
)
SELECT
  ev.event_id,
  ev.voter_id,
  CASE
    WHEN e.event_type = 'polling' THEN 'POLLING_RESPONDENT'::participant_type
    WHEN e.event_type IN ('pageant', 'competition_scoring') THEN 'COMPETITION_JUDGE'::participant_type
    ELSE 'ELECTION_VOTER'::participant_type
  END,
  e.event_type = 'election' AND ev.has_voted,
  e.event_type IN ('pageant', 'competition_scoring') AND ev.has_scored,
  e.event_type = 'polling' AND ev.has_voted,
  ev.first_name,
  ev.last_name,
  '{}'::jsonb,
  ev.voting_nonce,
  ev.created_at,
  ev.updated_at
FROM event_voters ev
JOIN events e ON e.id = ev.event_id
WHERE e.event_type IN ('election', 'polling', 'pageant', 'competition_scoring')
ON CONFLICT (event_id, user_id) DO UPDATE SET
  participant_type = EXCLUDED.participant_type,
  has_voted = event_participants.has_voted OR EXCLUDED.has_voted,
  has_scored = event_participants.has_scored OR EXCLUDED.has_scored,
  has_responded = event_participants.has_responded OR EXCLUDED.has_responded,
  first_name = COALESCE(event_participants.first_name, EXCLUDED.first_name),
  last_name = COALESCE(event_participants.last_name, EXCLUDED.last_name),
  metadata = COALESCE(event_participants.metadata, '{}'::jsonb),
  voting_nonce = COALESCE(event_participants.voting_nonce, EXCLUDED.voting_nonce);

-- Invitation records are also enrollment evidence. This repairs deployments
-- where account/invitation creation completed but the old enrollment write did not.
INSERT INTO event_participants (
  event_id,
  user_id,
  participant_type,
  created_at,
  updated_at
)
SELECT
  i.event_id,
  i.voter_id,
  CASE
    WHEN e.event_type = 'polling' THEN 'POLLING_RESPONDENT'::participant_type
    WHEN e.event_type IN ('pageant', 'competition_scoring') THEN 'COMPETITION_JUDGE'::participant_type
    ELSE 'ELECTION_VOTER'::participant_type
  END,
  i.created_at,
  i.updated_at
FROM invitations i
JOIN events e ON e.id = i.event_id
WHERE e.event_type IN ('election', 'polling', 'pageant', 'competition_scoring')
ON CONFLICT (event_id, user_id) DO NOTHING;

-- First-class competition judges may never have had a legacy event_voters row.
INSERT INTO event_participants (
  event_id,
  user_id,
  participant_type,
  has_scored,
  metadata,
  created_at,
  updated_at
)
SELECT
  cj.event_id,
  cj.user_id,
  'COMPETITION_JUDGE'::participant_type,
  cj.has_submitted,
  jsonb_build_object(
    'judgeRole', cj.role,
    'isActive', cj.is_active,
    'hasSubmitted', cj.has_submitted,
    'judgeRowId', cj.id
  ),
  cj.created_at,
  cj.updated_at
FROM competition_judges cj
JOIN events e ON e.id = cj.event_id
WHERE e.event_type IN ('pageant', 'competition_scoring')
ON CONFLICT (event_id, user_id) DO UPDATE SET
  participant_type = 'COMPETITION_JUDGE'::participant_type,
  has_scored = event_participants.has_scored OR EXCLUDED.has_scored,
  metadata = COALESCE(event_participants.metadata, '{}'::jsonb) || EXCLUDED.metadata;

-- Abort rather than silently completing with an incomplete repair.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM event_voters ev
    LEFT JOIN event_participants ep
      ON ep.event_id = ev.event_id AND ep.user_id = ev.voter_id
    WHERE ep.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Participant reconciliation failed for one or more event_voters rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM invitations i
    JOIN events e ON e.id = i.event_id
    LEFT JOIN event_participants ep
      ON ep.event_id = i.event_id AND ep.user_id = i.voter_id
    WHERE e.event_type IN ('election', 'polling', 'pageant', 'competition_scoring')
      AND ep.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Participant reconciliation failed for one or more invitation rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM competition_judges cj
    LEFT JOIN event_participants ep
      ON ep.event_id = cj.event_id
      AND ep.user_id = cj.user_id
      AND ep.participant_type = 'COMPETITION_JUDGE'
    WHERE ep.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Participant reconciliation failed for one or more competition judges';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_event_participants_user_type
  ON event_participants (user_id, participant_type);

CREATE INDEX IF NOT EXISTS idx_event_participants_event_type
  ON event_participants (event_id, participant_type);

CREATE INDEX IF NOT EXISTS idx_event_participants_election_completion
  ON event_participants (event_id, has_voted)
  WHERE participant_type = 'ELECTION_VOTER';

CREATE INDEX IF NOT EXISTS idx_event_participants_competition_completion
  ON event_participants (event_id, has_scored)
  WHERE participant_type = 'COMPETITION_JUDGE';

CREATE INDEX IF NOT EXISTS idx_event_participants_polling_completion
  ON event_participants (event_id, has_responded)
  WHERE participant_type = 'POLLING_RESPONDENT';

-- Keep the old shape available only for external read compatibility.
DROP VIEW IF EXISTS v_event_voters;

CREATE VIEW v_event_voters AS
SELECT
  ep.id,
  ep.event_id,
  ep.user_id AS voter_id,
  CASE
    WHEN ep.participant_type = 'ELECTION_VOTER' THEN ep.has_voted
    WHEN ep.participant_type = 'POLLING_RESPONDENT' THEN ep.has_responded
    ELSE FALSE
  END AS has_voted,
  ep.participant_type = 'COMPETITION_JUDGE' AS is_judge,
  ep.participant_type = 'COMPETITION_JUDGE' AND ep.has_scored AS has_scored,
  ep.first_name,
  ep.last_name,
  ep.created_at,
  ep.updated_at,
  ep.metadata,
  ep.participant_type,
  ep.voting_nonce
FROM event_participants ep;

COMMENT ON VIEW v_event_voters IS
  'Read-only legacy compatibility view. Application code must use event_participants.';

COMMIT;
