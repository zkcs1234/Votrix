-- Migration 061 — Anchor votes/scores to event_participants (EXPAND + BACKFILL)
--
-- Issue D from DATABASE_SCHEMA_CURRENT.md §6:
--   election_votes, poll_submissions, competition_scores, and
--   competition_session_judge_scores identify the voter/judge by users.id
--   (voter_id / judge_id). Nothing guarantees that user is actually enrolled
--   in the event (no FK to event_participants). This migration adds a nullable
--   participant_id column to each table and backfills it from the canonical
--   event_participants table.
--
-- SAFETY: This migration is 100% additive and non-breaking.
--   • New columns are NULLABLE with no constraints — existing INSERTs by the
--     current application/RPCs keep working untouched.
--   • No FK, NOT NULL, or unique constraint is added here (that is 062, then a
--     later NOT NULL step AFTER the RPCs are updated to write participant_id).
--   • event_participants has UNIQUE (event_id, user_id), so every backfill
--     lookup resolves to at most one row (deterministic).
--   • Rows whose user is NOT enrolled stay participant_id = NULL. They are
--     reported (not blocked) so you can investigate before tightening.
--
-- Apply in the Supabase SQL Editor (see database/README.md). Reversible via
-- 061_down_add_participant_id_to_ballots.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. election_votes.participant_id  (event_id + voter_id are both NOT NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE election_votes
  ADD COLUMN IF NOT EXISTS participant_id UUID;

UPDATE election_votes ev
   SET participant_id = ep.id
  FROM event_participants ep
 WHERE ep.event_id = ev.event_id
   AND ep.user_id  = ev.voter_id
   AND ev.participant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_election_votes_participant_id
  ON election_votes (participant_id);

COMMENT ON COLUMN election_votes.participant_id IS
  'Issue D: canonical enrollment (event_participants.id) for this vote. Backfilled from (event_id, voter_id). FK added in 062; NOT NULL after RPC writes it.';

-- ---------------------------------------------------------------------------
-- 2. poll_submissions.participant_id  (event_id + voter_id both NOT NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE poll_submissions
  ADD COLUMN IF NOT EXISTS participant_id UUID;

UPDATE poll_submissions ps
   SET participant_id = ep.id
  FROM event_participants ep
 WHERE ep.event_id = ps.event_id
   AND ep.user_id  = ps.voter_id
   AND ps.participant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_poll_submissions_participant_id
  ON poll_submissions (participant_id);

COMMENT ON COLUMN poll_submissions.participant_id IS
  'Issue D: canonical enrollment (event_participants.id) for this submission. Backfilled from (event_id, voter_id).';

-- ---------------------------------------------------------------------------
-- 3. competition_scores.participant_id
--    competition_scores.event_id is nullable (added late in 038_fix), so the
--    event is derived from the contestant, which always has a NOT NULL event_id.
-- ---------------------------------------------------------------------------
ALTER TABLE competition_scores
  ADD COLUMN IF NOT EXISTS participant_id UUID;

UPDATE competition_scores cs
   SET participant_id = ep.id
  FROM competition_contestants cc
  JOIN event_participants ep
    ON ep.event_id = cc.event_id
 WHERE cc.id = cs.contestant_id
   AND ep.user_id = cs.judge_id
   AND cs.participant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_competition_scores_participant_id
  ON competition_scores (participant_id);

COMMENT ON COLUMN competition_scores.participant_id IS
  'Issue D: canonical judge enrollment (event_participants.id). Backfilled via contestant''s event + judge_id.';

-- ---------------------------------------------------------------------------
-- 4. competition_session_judge_scores.participant_id  (event_id NOT NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE competition_session_judge_scores
  ADD COLUMN IF NOT EXISTS participant_id UUID;

UPDATE competition_session_judge_scores sjs
   SET participant_id = ep.id
  FROM event_participants ep
 WHERE ep.event_id = sjs.event_id
   AND ep.user_id  = sjs.judge_id
   AND sjs.participant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_session_judge_scores_participant_id
  ON competition_session_judge_scores (participant_id);

COMMENT ON COLUMN competition_session_judge_scores.participant_id IS
  'Issue D: canonical judge enrollment (event_participants.id). Backfilled from (event_id, judge_id).';

COMMIT;

-- ---------------------------------------------------------------------------
-- POST-CHECK (run separately; reports rows whose user is NOT enrolled).
-- Expected: all zero. Non-zero = real orphans to investigate before 062's
-- later NOT NULL tightening. These do NOT block this migration.
-- ---------------------------------------------------------------------------
-- SELECT 'election_votes'                    AS tbl, count(*) AS orphans FROM election_votes                    WHERE participant_id IS NULL
-- UNION ALL SELECT 'poll_submissions',                 count(*) FROM poll_submissions                 WHERE participant_id IS NULL
-- UNION ALL SELECT 'competition_scores',               count(*) FROM competition_scores               WHERE participant_id IS NULL
-- UNION ALL SELECT 'competition_session_judge_scores', count(*) FROM competition_session_judge_scores WHERE participant_id IS NULL;
