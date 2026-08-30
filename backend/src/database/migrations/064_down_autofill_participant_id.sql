-- Down migration 064 — Remove the participant_id auto-fill triggers.
-- New rows will again leave participant_id NULL unless app code sets it.

BEGIN;

DROP TRIGGER IF EXISTS trg_election_votes_set_participant ON election_votes;
DROP FUNCTION IF EXISTS fn_election_votes_set_participant();

DROP TRIGGER IF EXISTS trg_poll_submissions_set_participant ON poll_submissions;
DROP FUNCTION IF EXISTS fn_poll_submissions_set_participant();

DROP TRIGGER IF EXISTS trg_session_judge_scores_set_participant ON competition_session_judge_scores;
DROP FUNCTION IF EXISTS fn_session_judge_scores_set_participant();

DROP TRIGGER IF EXISTS trg_competition_scores_set_participant ON competition_scores;
DROP FUNCTION IF EXISTS fn_competition_scores_set_participant();

COMMIT;
