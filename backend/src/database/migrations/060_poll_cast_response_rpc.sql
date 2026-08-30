-- Phase 1 (Polling Remediation) — Atomic poll-response submission
--
-- Migration: 060_poll_cast_response_rpc.sql
-- Description: Adds a transactional stored function that claims the
--              respondent's single-submission slot (or marks them responded
--              for multi-submission polls), inserts the poll_submissions row,
--              AND inserts every poll_answers row as a single unit.
--
-- Why: The previous application code performed the has_responded flip, the
-- submission insert, and the answer insert as three separate Supabase calls
-- with hand-rolled compensation. On a partial failure the already-committed
-- submission row was never deleted (an orphan that inflated response counts),
-- and the compensation reset has_responded=FALSE — which, with no
-- UNIQUE(event_id, voter_id) on poll_submissions, silently RE-OPENED a
-- "submit once" poll. Running all statements inside one PL/pgSQL function makes
-- the write all-or-nothing: any error rolls back the flag flip and both inserts.
--
-- Safety: purely additive. Existing application code keeps working unchanged
-- until the backend is deployed to call this function, so this migration can
-- ship ahead of the backend with zero impact. The UNIQUE(submission_id,
-- question_id) index on poll_answers remains the final per-answer guard.

BEGIN;

CREATE OR REPLACE FUNCTION cast_poll_response(
  p_event_id       UUID,
  p_voter_id       UUID,
  p_started_at     TIMESTAMPTZ,
  p_allow_multiple BOOLEAN,
  p_answers        JSONB   -- array of { "question_id": uuid, "answer": text }
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_locked        INT;
  v_submission_id UUID;
BEGIN
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

  -- Record the submission. If anything below fails, the whole function rolls
  -- back — including the has_responded flip above — so no orphan submission is
  -- left behind and the respondent can safely retry.
  INSERT INTO poll_submissions (event_id, voter_id, started_at, completed_at)
  VALUES (p_event_id, p_voter_id, p_started_at, NOW())
  RETURNING id INTO v_submission_id;

  IF p_answers IS NOT NULL AND jsonb_array_length(p_answers) > 0 THEN
    INSERT INTO poll_answers (question_id, voter_id, submission_id, answer)
    SELECT (e->>'question_id')::UUID,
           p_voter_id,
           v_submission_id,
           e->>'answer'
      FROM jsonb_array_elements(p_answers) AS e;
  END IF;

  RETURN v_submission_id;
END;
$$;

COMMENT ON FUNCTION cast_poll_response(UUID, UUID, TIMESTAMPTZ, BOOLEAN, JSONB) IS
  'Atomically claims the single-submission slot (or marks responded for multi-submission polls), inserts the poll_submissions row, and inserts all poll_answers rows in one transaction. Returns the new submission id, or NULL if a single-submission respondent had already responded (or is not enrolled).';

COMMIT;
