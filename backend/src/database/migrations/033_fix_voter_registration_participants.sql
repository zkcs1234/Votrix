-- Migration 033 — Fix Voter/Respondent/Judge Registration & Invitation
--
-- After migration 029 introduced `event_participants` as the canonical
-- enrollment table, many module write paths still referenced the backward-compat
-- `v_event_voters` view. Because that view exposes COMPUTED columns
-- (`has_voted`, `is_judge`, `has_scored`), Postgres auto-updatable views
-- REJECT writes to them — so voting/scoring/submission updates failed.
--
-- This migration:
--   1. Adds `voting_nonce` to `event_participants` (was only on legacy
--      `event_voters` via migration 032).
--   2. Backfills `voting_nonce` from the legacy table.
--   3. Reconciles any legacy `event_voters` rows missing from
--      `event_participants`.
--   4. Recreates `v_event_voters` exposing `metadata`, `participant_type`,
--      and `voting_nonce` (read-only backward compatibility).

BEGIN;

-- ===========================================================================
-- 1. event_participants — voting_nonce for ballot replay protection
-- ===========================================================================
ALTER TABLE event_participants
ADD COLUMN IF NOT EXISTS voting_nonce UUID DEFAULT gen_random_uuid ();

COMMENT ON COLUMN event_participants.voting_nonce IS 'One-time UUID nonce required during ballot submission to prevent request replay attacks. Cleared after vote is recorded.';

-- ---------------------------------------------------------------------------
-- 2. Backfill voting_nonce from legacy event_voters
-- ---------------------------------------------------------------------------
UPDATE event_participants ep
SET
    voting_nonce = ev.voting_nonce
FROM event_voters ev
WHERE
    ev.event_id = ep.event_id
    AND ev.voter_id = ep.user_id
    AND ep.voting_nonce IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Reconcile: enroll legacy event_voters rows missing in event_participants
-- ---------------------------------------------------------------------------
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
    WHEN ev.is_judge = true THEN 'COMPETITION_JUDGE'::participant_type
    WHEN e.event_type = 'polling' THEN 'POLLING_RESPONDENT'::participant_type
    ELSE 'ELECTION_VOTER'::participant_type
  END,
  CASE WHEN e.event_type = 'election' THEN ev.has_voted ELSE FALSE END,
  CASE WHEN ev.is_judge = true THEN ev.has_scored ELSE FALSE END,
  CASE WHEN e.event_type = 'polling' THEN ev.has_voted ELSE FALSE END,
  ev.first_name,
  ev.last_name,
  '{}'::jsonb,
  ev.voting_nonce,
  ev.created_at,
  ev.updated_at
FROM event_voters ev
JOIN events e ON e.id = ev.event_id
ON CONFLICT (event_id, user_id) DO UPDATE SET
  has_voted = CASE WHEN EXCLUDED.has_voted THEN true ELSE event_participants.has_voted END,
  has_scored = CASE WHEN EXCLUDED.has_scored THEN true ELSE event_participants.has_scored END,
  has_responded = CASE WHEN EXCLUDED.has_responded THEN true ELSE event_participants.has_responded END,
  voting_nonce = COALESCE(event_participants.voting_nonce, EXCLUDED.voting_nonce),
  first_name = COALESCE(event_participants.first_name, EXCLUDED.first_name),
  last_name = COALESCE(event_participants.last_name, EXCLUDED.last_name),
  metadata = COALESCE(event_participants.metadata, '{}'::jsonb);

-- ---------------------------------------------------------------------------
-- 4. Recreate v_event_voters (read-only backward compatibility)
-- ---------------------------------------------------------------------------
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
    )
    OR (
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

COMMIT;