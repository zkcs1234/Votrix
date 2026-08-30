-- Down migration 061 — Remove participant_id columns added by 061.
--
-- Safe to run: these columns are additive and (until 062/NOT NULL) carry no
-- constraints, so dropping them cannot affect any other data.

BEGIN;

DROP INDEX IF EXISTS idx_election_votes_participant_id;
ALTER TABLE election_votes
  DROP COLUMN IF EXISTS participant_id;

DROP INDEX IF EXISTS idx_poll_submissions_participant_id;
ALTER TABLE poll_submissions
  DROP COLUMN IF EXISTS participant_id;

DROP INDEX IF EXISTS idx_competition_scores_participant_id;
ALTER TABLE competition_scores
  DROP COLUMN IF EXISTS participant_id;

DROP INDEX IF EXISTS idx_session_judge_scores_participant_id;
ALTER TABLE competition_session_judge_scores
  DROP COLUMN IF EXISTS participant_id;

COMMIT;
