-- Restore the legacy single-ballot RPC when rolling back migration 079.

BEGIN;

DROP FUNCTION IF EXISTS cast_election_ballot (UUID, UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION cast_election_ballot(
  p_event_id UUID,
  p_voter_id UUID,
  p_votes JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked INT;
BEGIN
  UPDATE event_participants
     SET has_voted = TRUE,
         voting_nonce = NULL
   WHERE event_id = p_event_id
     AND user_id = p_voter_id
     AND has_voted = FALSE;

  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF v_locked = 0 THEN
    RETURN FALSE;
  END IF;

  INSERT INTO election_votes (event_id, voter_id, position_id, candidate_id)
  SELECT p_event_id,
         p_voter_id,
         (vote->>'position_id')::UUID,
         (vote->>'candidate_id')::UUID
    FROM jsonb_array_elements(p_votes) AS vote;

  RETURN TRUE;
END;
$$;

COMMIT;