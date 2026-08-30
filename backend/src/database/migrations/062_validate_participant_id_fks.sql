-- Migration 062 — Anchor votes/scores to event_participants (ADD FOREIGN KEYS)
--
-- Follows 061. Adds a foreign key from each participant_id column to
-- event_participants(id). ON DELETE CASCADE matches how the underlying
-- (event_id, user_id) relationships already cascade from events/users.
--
-- SAFETY:
--   • Each FK is added NOT VALID first (no scan, cannot fail the DDL), then
--     VALIDATE CONSTRAINT checks existing rows in a brief lock. Because 061
--     only set participant_id when a real event_participants row existed,
--     every non-NULL value already points at a valid row, so VALIDATE passes.
--   • NULL participant_id values (un-enrolled "orphan" rows, if any) are
--     ALLOWED by a FK — this migration does NOT block them and does NOT set
--     NOT NULL. Current application/RPC INSERTs that don't yet write
--     participant_id keep working (they insert NULL, which the FK permits).
--   • Tightening to NOT NULL is a SEPARATE, later migration (063+) to run only
--     AFTER the RPCs are updated to populate participant_id and the orphan
--     count is zero. See the runbook.
--
-- PRE-CHECK (run first — see runbook). If any table reports orphans you may
-- still apply this migration safely; just do NOT proceed to the NOT NULL step
-- until they are resolved.
--
-- Reversible via 062_down_validate_participant_id_fks.sql.

BEGIN;

-- election_votes -------------------------------------------------------------
ALTER TABLE election_votes
  DROP CONSTRAINT IF EXISTS election_votes_participant_fk;
ALTER TABLE election_votes
  ADD CONSTRAINT election_votes_participant_fk
  FOREIGN KEY (participant_id) REFERENCES event_participants (id) ON DELETE CASCADE
  NOT VALID;
ALTER TABLE election_votes
  VALIDATE CONSTRAINT election_votes_participant_fk;

-- poll_submissions -----------------------------------------------------------
ALTER TABLE poll_submissions
  DROP CONSTRAINT IF EXISTS poll_submissions_participant_fk;
ALTER TABLE poll_submissions
  ADD CONSTRAINT poll_submissions_participant_fk
  FOREIGN KEY (participant_id) REFERENCES event_participants (id) ON DELETE CASCADE
  NOT VALID;
ALTER TABLE poll_submissions
  VALIDATE CONSTRAINT poll_submissions_participant_fk;

-- competition_scores ---------------------------------------------------------
ALTER TABLE competition_scores
  DROP CONSTRAINT IF EXISTS competition_scores_participant_fk;
ALTER TABLE competition_scores
  ADD CONSTRAINT competition_scores_participant_fk
  FOREIGN KEY (participant_id) REFERENCES event_participants (id) ON DELETE CASCADE
  NOT VALID;
ALTER TABLE competition_scores
  VALIDATE CONSTRAINT competition_scores_participant_fk;

-- competition_session_judge_scores ------------------------------------------
ALTER TABLE competition_session_judge_scores
  DROP CONSTRAINT IF EXISTS competition_session_judge_scores_participant_fk;
ALTER TABLE competition_session_judge_scores
  ADD CONSTRAINT competition_session_judge_scores_participant_fk
  FOREIGN KEY (participant_id) REFERENCES event_participants (id) ON DELETE CASCADE
  NOT VALID;
ALTER TABLE competition_session_judge_scores
  VALIDATE CONSTRAINT competition_session_judge_scores_participant_fk;

COMMIT;
