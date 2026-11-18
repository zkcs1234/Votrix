-- Migration 145 — Election and polling database functions accept STUDENT enrollments
--
-- Since migration 136 a student is enrolled in an election or poll with
-- event_participants.participant_type = 'STUDENT' (the cohort invite and the
-- auto-assign trigger both write it). These functions were written before that
-- and only matched the legacy per-event values, so for a STUDENT enrollment:
--   - cast_election_ballot() returned FALSE (the student could not vote),
--   - cast_poll_response() claimed nothing (the student could not submit),
--   - election_group_is_eligible() / set_election_group_eligibility() treated the
--     student as not enrolled (group eligibility could not be saved).
--
-- Each now accepts STUDENT as well as its legacy value, so enrollments created
-- before and after 136 both work. Bodies are otherwise identical to their latest
-- definitions (130 for cast_election_ballot, 087 for cast_poll_response, 080 for
-- the two group functions). CREATE OR REPLACE keeps the existing grants.
--
-- Idempotent and safe to re-run.

BEGIN;

-- election_group_is_eligible must exist before the functions that call it.
CREATE OR REPLACE FUNCTION election_group_is_eligible(p_section_id UUID, p_participant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM election_ballot_sections s
    JOIN event_participants ep ON ep.event_id = s.event_id
    WHERE s.id = p_section_id AND ep.id = p_participant_id AND ep.participant_type::text IN ('STUDENT', 'ELECTION_VOTER')
    AND (s.eligibility_mode = 'all' OR EXISTS (SELECT 1 FROM election_group_voters gv
      WHERE gv.ballot_section_id = s.id AND gv.participant_id = ep.id)));
$$;

CREATE OR REPLACE FUNCTION set_election_group_eligibility(p_event_id UUID, p_section_id UUID, p_mode TEXT, p_participant_ids UUID[])
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM events WHERE id = p_event_id FOR UPDATE;
  PERFORM 1 FROM election_ballot_sections WHERE id = p_section_id AND event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Election group not found'; END IF;
  IF p_mode NOT IN ('all', 'selected') THEN RAISE EXCEPTION 'Invalid eligibility mode'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_participant_ids) requested(id)
    WHERE NOT EXISTS (SELECT 1 FROM event_participants ep WHERE ep.id = requested.id
      AND ep.event_id = p_event_id AND ep.participant_type::text IN ('STUDENT', 'ELECTION_VOTER'))) THEN
    RAISE EXCEPTION 'Voter must be enrolled in this election event';
  END IF;
  -- Never revoke eligibility for a voter whose ballot is already recorded.
  IF p_mode = 'selected' AND EXISTS (SELECT 1 FROM election_ballot_submissions
    WHERE ballot_section_id = p_section_id AND NOT (participant_id = ANY(p_participant_ids))) THEN
    RAISE EXCEPTION 'Cannot remove eligibility from voters with submitted ballots';
  END IF;
  DELETE FROM election_group_voters WHERE ballot_section_id = p_section_id;
  IF p_mode = 'selected' THEN
    INSERT INTO election_group_voters(event_id, ballot_section_id, participant_id)
      SELECT p_event_id, p_section_id, id FROM (SELECT DISTINCT unnest(p_participant_ids) id) voters;
  END IF;
  UPDATE election_ballot_sections SET eligibility_mode = p_mode WHERE id = p_section_id;
  -- has_voted remains a summary; submission uniqueness is enforced per group.
  UPDATE event_participants ep SET has_voted =
    EXISTS (SELECT 1 FROM election_ballot_sections s WHERE s.event_id = p_event_id AND election_group_is_eligible(s.id, ep.id))
    AND NOT EXISTS (SELECT 1 FROM election_ballot_sections s WHERE s.event_id = p_event_id
      AND election_group_is_eligible(s.id, ep.id) AND NOT EXISTS (
        SELECT 1 FROM election_ballot_submissions bs WHERE bs.ballot_section_id = s.id AND bs.participant_id = ep.id))
    WHERE ep.event_id = p_event_id AND ep.participant_type::text IN ('STUDENT', 'ELECTION_VOTER');
END;
$$;

REVOKE ALL ON FUNCTION set_election_group_eligibility(UUID, UUID, TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_election_group_eligibility(UUID, UUID, TEXT, UUID[]) TO service_role;

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
     AND ep.participant_type::text IN ('STUDENT', 'ELECTION_VOTER')
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
  'Atomically records one ordered group ballot, enforcing position program eligibility and requiring selections only for eligible positions. Accepts STUDENT and legacy ELECTION_VOTER enrollments.';

CREATE OR REPLACE FUNCTION cast_poll_response(
  p_event_id       UUID,
  p_voter_id       UUID,
  p_started_at     TIMESTAMPTZ,
  p_allow_multiple BOOLEAN,
  p_answers        JSONB,   -- array of { "question_id": uuid, "answer": text }
  p_is_anonymous   BOOLEAN DEFAULT FALSE
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked            INT;
  v_submission_id     UUID;
  v_recorded_voter_id UUID;
BEGIN
  IF p_is_anonymous THEN
    v_recorded_voter_id := NULL;
  ELSE
    v_recorded_voter_id := p_voter_id;
  END IF;

  IF p_allow_multiple THEN
    -- Multiple submissions allowed: mark the respondent as responded
    -- (idempotent) and always proceed to record a new submission.
    UPDATE event_participants
       SET has_responded = TRUE
     WHERE event_id = p_event_id
       AND user_id  = p_voter_id
       AND participant_type::text IN ('STUDENT', 'POLLING_RESPONDENT');
  ELSE
    -- Single submission: atomic claim — only the first submission flips the
    -- flag FALSE→TRUE. A second concurrent request claims nothing.
    UPDATE event_participants
       SET has_responded = TRUE
     WHERE event_id = p_event_id
       AND user_id  = p_voter_id
       AND participant_type::text IN ('STUDENT', 'POLLING_RESPONDENT')
       AND has_responded = FALSE;

    GET DIAGNOSTICS v_locked = ROW_COUNT;

    -- Already responded (or not enrolled): claim nothing, record nothing.
    IF v_locked = 0 THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Record the submission. When anonymous, voter_id is NULL.
  INSERT INTO poll_submissions (event_id, voter_id, started_at, completed_at)
  VALUES (p_event_id, v_recorded_voter_id, p_started_at, NOW())
  RETURNING id INTO v_submission_id;

  IF p_answers IS NOT NULL AND jsonb_array_length(p_answers) > 0 THEN
    INSERT INTO poll_answers (question_id, voter_id, submission_id, answer)
    SELECT (e->>'question_id')::UUID,
           v_recorded_voter_id,
           v_submission_id,
           e->>'answer'
      FROM jsonb_array_elements(p_answers) AS e;
  END IF;

  RETURN v_submission_id;
END;
$$;

COMMENT ON FUNCTION cast_poll_response(UUID, UUID, TIMESTAMPTZ, BOOLEAN, JSONB, BOOLEAN) IS
  'Atomically claims the single-submission slot, inserts the poll_submissions row, and inserts all poll_answers rows. When p_is_anonymous is TRUE, voter_id is stored as NULL at rest. Accepts STUDENT and legacy POLLING_RESPONDENT enrollments.';

COMMIT;
