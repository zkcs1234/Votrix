-- Migration 064 — Auto-fill participant_id on new votes/scores (Step 4)
--
-- Follows 061 (columns + backfill) and 062 (foreign keys). This makes every
-- NEW row populate participant_id automatically, so the column is never NULL
-- going forward — the prerequisite for the later NOT NULL tightening.
--
-- WHY A TRIGGER (instead of editing app code):
--   The inserts happen in several places — the cast_election_ballot /
--   cast_poll_response RPC functions, the live-session score inserts, and the
--   batch pageant score path. A BEFORE INSERT trigger fills participant_id from
--   the columns already present on each row, so ALL paths are covered at once
--   with no application change and nothing to miss.
--
-- SAFETY:
--   • BEFORE INSERT only — existing rows are untouched; reads are unaffected.
--   • Sets participant_id ONLY when it is NULL, so an explicit value (if app
--     code later sets one) always wins.
--   • event_participants has UNIQUE (event_id, user_id), so each lookup resolves
--     to at most one row (deterministic).
--   • If no participant is found (a not-enrolled writer), participant_id stays
--     NULL — the FK allows that, so the insert still succeeds. Enrollment is
--     already enforced by the service layer before any score/vote is written.
--
-- Reversible via 064_down_autofill_participant_id.sql.

BEGIN;

-- election_votes: event_id + voter_id --------------------------------------
CREATE OR REPLACE FUNCTION fn_election_votes_set_participant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.participant_id IS NULL THEN
    SELECT ep.id INTO NEW.participant_id
      FROM event_participants ep
     WHERE ep.event_id = NEW.event_id
       AND ep.user_id  = NEW.voter_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_election_votes_set_participant ON election_votes;
CREATE TRIGGER trg_election_votes_set_participant
  BEFORE INSERT ON election_votes
  FOR EACH ROW EXECUTE FUNCTION fn_election_votes_set_participant();

-- poll_submissions: event_id + voter_id ------------------------------------
CREATE OR REPLACE FUNCTION fn_poll_submissions_set_participant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.participant_id IS NULL THEN
    SELECT ep.id INTO NEW.participant_id
      FROM event_participants ep
     WHERE ep.event_id = NEW.event_id
       AND ep.user_id  = NEW.voter_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_poll_submissions_set_participant ON poll_submissions;
CREATE TRIGGER trg_poll_submissions_set_participant
  BEFORE INSERT ON poll_submissions
  FOR EACH ROW EXECUTE FUNCTION fn_poll_submissions_set_participant();

-- competition_session_judge_scores: event_id + judge_id --------------------
CREATE OR REPLACE FUNCTION fn_session_judge_scores_set_participant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.participant_id IS NULL THEN
    SELECT ep.id INTO NEW.participant_id
      FROM event_participants ep
     WHERE ep.event_id = NEW.event_id
       AND ep.user_id  = NEW.judge_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_judge_scores_set_participant ON competition_session_judge_scores;
CREATE TRIGGER trg_session_judge_scores_set_participant
  BEFORE INSERT ON competition_session_judge_scores
  FOR EACH ROW EXECUTE FUNCTION fn_session_judge_scores_set_participant();

-- competition_scores: derive event from the contestant, match judge_id -----
CREATE OR REPLACE FUNCTION fn_competition_scores_set_participant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.participant_id IS NULL THEN
    SELECT ep.id INTO NEW.participant_id
      FROM competition_contestants cc
      JOIN event_participants ep
        ON ep.event_id = cc.event_id
       AND ep.user_id  = NEW.judge_id
     WHERE cc.id = NEW.contestant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_competition_scores_set_participant ON competition_scores;
CREATE TRIGGER trg_competition_scores_set_participant
  BEFORE INSERT ON competition_scores
  FOR EACH ROW EXECUTE FUNCTION fn_competition_scores_set_participant();

COMMIT;
