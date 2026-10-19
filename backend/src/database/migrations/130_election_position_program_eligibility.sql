BEGIN;

ALTER TABLE positions
  ADD COLUMN eligible_programs TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN positions.eligible_programs IS
  'Empty means all voters eligible for the group; otherwise only voters whose current users.program matches one of these values may vote.';

CREATE OR REPLACE FUNCTION election_position_is_eligible(
  p_position_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM positions p
      JOIN users u ON u.id = p_user_id
     WHERE p.id = p_position_id
       AND (
         cardinality(p.eligible_programs) = 0
         OR EXISTS (
           SELECT 1
             FROM unnest(p.eligible_programs) AS eligible(program)
            WHERE lower(btrim(eligible.program)) = lower(btrim(u.program))
         )
       )
  );
$$;

REVOKE ALL ON FUNCTION election_position_is_eligible(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION election_position_is_eligible(UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION cast_election_ballot(
  p_event_id          UUID,
  p_voter_id          UUID,
  p_ballot_section_id UUID,
  p_votes             JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_participant_id UUID;
  v_first_pending UUID;
  v_total_sections INTEGER;
  v_submitted_sections INTEGER;
BEGIN
  SELECT ep.id
    INTO v_participant_id
    FROM event_participants ep
   WHERE ep.event_id = p_event_id
     AND ep.user_id = p_voter_id
     AND ep.participant_type = 'ELECTION_VOTER'
   FOR UPDATE;

  IF v_participant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT section.id
    INTO v_first_pending
    FROM election_ballot_sections section
   WHERE section.event_id = p_event_id
     AND election_group_is_eligible(section.id, v_participant_id)
     AND EXISTS (
       SELECT 1
         FROM positions p
        WHERE p.ballot_section_id = section.id
          AND election_position_is_eligible(p.id, p_voter_id)
     )
     AND NOT EXISTS (
       SELECT 1
         FROM election_ballot_submissions submission
        WHERE submission.ballot_section_id = section.id
          AND submission.participant_id = v_participant_id
     )
   ORDER BY section.display_order, section.created_at, section.id
   LIMIT 1;

  IF v_first_pending IS NULL OR v_first_pending <> p_ballot_section_id THEN
    RETURN FALSE;
  END IF;

  IF jsonb_typeof(p_votes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Ballot must contain at least one vote'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_votes) = 0 THEN
    RAISE EXCEPTION 'Ballot must contain at least one vote'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_votes) AS vote
      LEFT JOIN positions p
        ON p.id = (vote->>'position_id')::UUID
       AND p.event_id = p_event_id
       AND p.ballot_section_id = p_ballot_section_id
      LEFT JOIN candidates c
        ON c.id = (vote->>'candidate_id')::UUID
       AND c.position_id = p.id
     WHERE p.id IS NULL
        OR c.id IS NULL
        OR NOT election_position_is_eligible(p.id, p_voter_id)
  ) THEN
    RAISE EXCEPTION 'Vote contains an invalid or ineligible position or candidate'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM positions p
     WHERE p.event_id = p_event_id
       AND p.ballot_section_id = p_ballot_section_id
       AND election_position_is_eligible(p.id, p_voter_id)
       AND NOT p.allow_skip
       AND NOT EXISTS (
         SELECT 1
           FROM jsonb_array_elements(p_votes) AS vote
          WHERE (vote->>'position_id')::UUID = p.id
       )
  ) THEN
    RAISE EXCEPTION 'Ballot omits a required position'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (
        SELECT (entry->>'position_id')::UUID AS position_id, COUNT(*) AS vote_count
          FROM jsonb_array_elements(p_votes) AS entry
         GROUP BY (entry->>'position_id')::UUID
      ) selected
      JOIN positions p ON p.id = selected.position_id
     WHERE p.event_id = p_event_id
       AND p.ballot_section_id = p_ballot_section_id
       AND selected.vote_count > p.max_vote
  ) THEN
    RAISE EXCEPTION 'Ballot exceeds the maximum votes for a position'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO election_votes (event_id, voter_id, position_id, candidate_id)
  SELECT
    p_event_id,
    p_voter_id,
    (vote->>'position_id')::UUID,
    (vote->>'candidate_id')::UUID
  FROM jsonb_array_elements(p_votes) AS vote;

  INSERT INTO election_ballot_submissions (
    event_id,
    ballot_section_id,
    participant_id
  ) VALUES (
    p_event_id,
    p_ballot_section_id,
    v_participant_id
  );

  SELECT COUNT(*)
    INTO v_total_sections
    FROM election_ballot_sections section
   WHERE section.event_id = p_event_id
     AND election_group_is_eligible(section.id, v_participant_id)
     AND EXISTS (
       SELECT 1
         FROM positions p
        WHERE p.ballot_section_id = section.id
          AND election_position_is_eligible(p.id, p_voter_id)
     );

  SELECT COUNT(*)
    INTO v_submitted_sections
    FROM election_ballot_submissions submission
    JOIN election_ballot_sections section
      ON section.id = submission.ballot_section_id
   WHERE submission.event_id = p_event_id
     AND submission.participant_id = v_participant_id
     AND election_group_is_eligible(section.id, v_participant_id)
     AND EXISTS (
       SELECT 1
         FROM positions p
        WHERE p.ballot_section_id = section.id
          AND election_position_is_eligible(p.id, p_voter_id)
     );

  UPDATE event_participants
     SET has_voted = v_submitted_sections = v_total_sections,
         voting_nonce = NULL
   WHERE id = v_participant_id;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION cast_election_ballot(UUID, UUID, UUID, JSONB) IS
  'Atomically records one ordered group ballot, enforcing position program eligibility and requiring selections only for eligible positions.';

COMMIT;
