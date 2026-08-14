-- Rollback Migration 040 — Reconcile canonical event participants
--
-- This is intentionally a NON-DESTRUCTIVE rollback.
-- Migration 040 repairs real enrollment data from event_voters, invitations,
-- and competition_judges. Deleting those repaired event_participants rows could
-- remove valid voter assignments or participation completed after deployment.
--
-- This rollback therefore:
--   1. Removes only indexes introduced by migration 040.
--   2. Restores the exact compatibility-view shape from migration 033.
--   3. Preserves event_participants rows, completion flags, metadata, and nonce.
--
-- If migration 040 fails while it is being applied, PostgreSQL rolls its entire
-- transaction back automatically; this file is only needed after a successful
-- migration when the schema changes need to be reversed.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.event_participants') IS NULL THEN
    RAISE EXCEPTION 'Cannot roll back migration 040: event_participants does not exist';
  END IF;
END
$$;

DROP INDEX IF EXISTS idx_event_participants_polling_completion;
DROP INDEX IF EXISTS idx_event_participants_competition_completion;
DROP INDEX IF EXISTS idx_event_participants_election_completion;
DROP INDEX IF EXISTS idx_event_participants_event_type;
DROP INDEX IF EXISTS idx_event_participants_user_type;

-- Restore the view definition established by migration 033. It remains a
-- read-only compatibility surface; canonical application writes continue to
-- belong in event_participants.
DROP VIEW IF EXISTS v_event_voters;

CREATE VIEW v_event_voters (
  id,
  event_id,
  voter_id,
  has_voted,
  is_judge,
  has_scored,
  first_name,
  last_name,
  created_at,
  updated_at,
  metadata,
  participant_type,
  voting_nonce
) AS
SELECT
  ep.id,
  ep.event_id,
  ep.user_id AS voter_id,
  (
    ep.participant_type = 'ELECTION_VOTER'
    AND ep.has_voted
  ) OR (
    ep.participant_type = 'POLLING_RESPONDENT'
    AND ep.has_responded
  ) AS has_voted,
  ep.participant_type = 'COMPETITION_JUDGE' AS is_judge,
  CASE
    WHEN ep.participant_type = 'COMPETITION_JUDGE' THEN ep.has_scored
    ELSE FALSE
  END AS has_scored,
  ep.first_name,
  ep.last_name,
  ep.created_at,
  ep.updated_at,
  ep.metadata,
  ep.participant_type,
  ep.voting_nonce
FROM event_participants ep;

COMMENT ON VIEW v_event_voters IS
  'Read-only backward-compatibility view over canonical event_participants.';

COMMIT;
