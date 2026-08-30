-- Phase 2 (Election Remediation) — Atomic ballot submission
--
-- Migration: 059_election_cast_ballot_rpc.sql
-- Description: Adds a transactional stored function that flips the voter's
--              `has_voted` flag AND inserts the ballot rows as a single unit.
--
-- Why: The previous application code performed the flag flip and the vote
-- insert as two separate Supabase calls with a hand-rolled compensating
-- update. A crash or failed compensation between them could leave a voter
-- marked as voted with zero recorded ballots (permanent disenfranchisement).
-- Running both statements inside one PL/pgSQL function makes the write
-- all-or-nothing: any error rolls back the flag flip along with the inserts.
--
-- Safety: purely additive. Existing application code continues to work
-- unchanged until the backend is deployed to call this function, so this
-- migration can ship ahead of the backend with zero impact. The unique
-- constraint `election_votes_unique_ballot` remains the final guard.

BEGIN;

CREATE OR REPLACE FUNCTION cast_election_ballot(
  p_event_id UUID,
  p_voter_id UUID,
  p_votes    JSONB   -- array of { "position_id": uuid, "candidate_id": uuid }
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked INT;
BEGIN
  -- Atomic claim: only the first submission flips the flag from FALSE→TRUE.
  UPDATE event_participants
     SET has_voted = TRUE,
         voting_nonce = NULL
   WHERE event_id = p_event_id
     AND user_id  = p_voter_id
     AND has_voted = FALSE;

  GET DIAGNOSTICS v_locked = ROW_COUNT;

  -- Already voted (or not enrolled): claim nothing, record nothing.
  IF v_locked = 0 THEN
    RETURN FALSE;
  END IF;

  -- Insert every selected candidate row. If any insert fails (FK violation,
  -- unique-constraint replay, etc.), the whole function rolls back — including
  -- the has_voted flip above — so the voter can safely retry.
  INSERT INTO election_votes (event_id, voter_id, position_id, candidate_id)
  SELECT p_event_id,
         p_voter_id,
         (e->>'position_id')::UUID,
         (e->>'candidate_id')::UUID
    FROM jsonb_array_elements(p_votes) AS e;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION cast_election_ballot(UUID, UUID, JSONB) IS
  'Atomically locks a voter (has_voted=TRUE) and inserts their ballot rows in one transaction. Returns FALSE if the voter had already voted or is not enrolled; TRUE on a committed ballot.';

COMMIT;
