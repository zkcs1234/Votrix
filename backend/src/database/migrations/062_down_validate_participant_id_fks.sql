-- Down migration 062 — Drop the participant_id foreign keys added by 062.
-- Leaves the participant_id columns themselves in place (that is 061's down).

BEGIN;

ALTER TABLE election_votes
  DROP CONSTRAINT IF EXISTS election_votes_participant_fk;

ALTER TABLE poll_submissions
  DROP CONSTRAINT IF EXISTS poll_submissions_participant_fk;

ALTER TABLE competition_scores
  DROP CONSTRAINT IF EXISTS competition_scores_participant_fk;

ALTER TABLE competition_session_judge_scores
  DROP CONSTRAINT IF EXISTS competition_session_judge_scores_participant_fk;

COMMIT;
