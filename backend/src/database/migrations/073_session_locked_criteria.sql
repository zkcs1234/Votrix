-- 073_session_locked_criteria.sql
-- Per-criterion locking for live judge scores (#6).
--
-- Until now a judge's live score row (competition_session_judge_scores) locked as
-- a WHOLE via is_locked: "Submit & lock" froze every criterion for that contestant
-- at once. That clashes with progressively opening criteria over time (score
-- Talent now, Q&A later — same contestant). This adds a per-criterion lock set so
-- a judge commits ONE criterion at a time; a criterion the organizer opens later
-- stays scorable even after earlier ones were locked.
--
--   locked_criteria = the CRITERION ids locked for this (judge, session, round,
--   contestant) row. is_locked stays as a DERIVED "fully locked" flag (the app
--   sets it true when locked_criteria covers all the round's criteria), kept for
--   compatibility with existing queries/rankings.
--
-- Additive and reversible. Backfill: every currently locked row is treated as
-- fully locked, so its locked_criteria becomes the criterion ids assigned to its
-- round (or, for flat events with no round_criteria membership, all of the event's
-- criteria).
--
-- Apply in the Supabase SQL Editor in numeric order (see database/README.md).

BEGIN;

ALTER TABLE competition_session_judge_scores
    ADD COLUMN IF NOT EXISTS locked_criteria JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN competition_session_judge_scores.locked_criteria IS
    'Per-criterion lock set (#6): criterion ids the judge has committed for this '
    'row. is_locked is derived (true when this covers all the round''s criteria).';

-- Backfill existing fully-locked rows so they stay fully locked (read-only) and
-- the derived is_locked flag stays consistent.
UPDATE competition_session_judge_scores s
SET locked_criteria = COALESCE(
        (
            SELECT jsonb_agg(rc.criteria_id)
            FROM competition_round_criteria rc
            WHERE rc.round_id = s.round_id
        ),
        (
            SELECT jsonb_agg(c.id)
            FROM competition_criteria c
            WHERE c.event_id = s.event_id
        ),
        '[]'::jsonb
    )
WHERE s.is_locked = TRUE
  AND s.locked_criteria = '[]'::jsonb;

COMMIT;
