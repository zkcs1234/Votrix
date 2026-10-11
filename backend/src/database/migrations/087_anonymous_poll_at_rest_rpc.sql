-- Migration: 087_anonymous_poll_at_rest_rpc.sql
-- Description: Updates cast_poll_response to support true anonymity at rest.
--              When p_is_anonymous is TRUE, voter_id in poll_submissions and
--              poll_answers is recorded as NULL, preserving participant privacy.

BEGIN;

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
       AND participant_type = 'POLLING_RESPONDENT';
  ELSE
    -- Single submission: atomic claim — only the first submission flips the
    -- flag FALSE→TRUE. A second concurrent request claims nothing.
    UPDATE event_participants
       SET has_responded = TRUE
     WHERE event_id = p_event_id
       AND user_id  = p_voter_id
       AND participant_type = 'POLLING_RESPONDENT'
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

-- Backward-compatible overload for 5-argument callers
CREATE OR REPLACE FUNCTION cast_poll_response(
  p_event_id       UUID,
  p_voter_id       UUID,
  p_started_at     TIMESTAMPTZ,
  p_allow_multiple BOOLEAN,
  p_answers        JSONB
) RETURNS UUID
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN cast_poll_response(p_event_id, p_voter_id, p_started_at, p_allow_multiple, p_answers, FALSE);
END;
$$;

COMMENT ON FUNCTION cast_poll_response(UUID, UUID, TIMESTAMPTZ, BOOLEAN, JSONB, BOOLEAN) IS
  'Atomically claims the single-submission slot, inserts the poll_submissions row, and inserts all poll_answers rows. When p_is_anonymous is TRUE, voter_id is stored as NULL at rest for complete voter confidentiality.';

COMMIT;
