-- Migration 065 — Make participant_id required (Step 5, final tightening)
--
-- Follows 061 (columns+backfill), 062 (FKs), 064 (auto-fill triggers).
-- After this, a vote/score with NO matching event_participants row is
-- impossible at the database level — the point of Issue D.
--
-- SAFETY GUARDS (this migration aborts itself, changing nothing, if unsafe):
--   1. Verifies the four 064 auto-fill triggers exist. Without them, new
--      inserts by the current app would violate NOT NULL. If any is missing
--      the migration raises and rolls back — apply 064 first.
--   2. Re-verifies zero NULL participant_id across all four tables at run time
--      (not just when you checked earlier). Any orphan aborts the migration.
--   Both guards run inside the same transaction as the ALTERs, so a failure
--   leaves the schema exactly as it was.
--
-- Reversible via 065_down_participant_id_not_null.sql.

BEGIN;

-- Guard 1: the 064 triggers must be present. --------------------------------
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(t.tg, ', ') INTO missing
  FROM (VALUES
    ('trg_election_votes_set_participant'),
    ('trg_poll_submissions_set_participant'),
    ('trg_session_judge_scores_set_participant'),
    ('trg_competition_scores_set_participant')
  ) AS t(tg)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = t.tg AND NOT tgisinternal
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Aborting: migration 064 auto-fill trigger(s) missing: %. Apply 064 before 065.', missing;
  END IF;
END
$$;

-- Guard 2: no NULL participant_id may remain. -------------------------------
DO $$
DECLARE
  n bigint;
BEGIN
  SELECT
      (SELECT count(*) FROM election_votes                    WHERE participant_id IS NULL)
    + (SELECT count(*) FROM poll_submissions                  WHERE participant_id IS NULL)
    + (SELECT count(*) FROM competition_scores                WHERE participant_id IS NULL)
    + (SELECT count(*) FROM competition_session_judge_scores  WHERE participant_id IS NULL)
    INTO n;

  IF n > 0 THEN
    RAISE EXCEPTION
      'Aborting: % row(s) still have NULL participant_id. Resolve orphans before tightening.', n;
  END IF;
END
$$;

-- Tighten. -----------------------------------------------------------------
ALTER TABLE election_votes                    ALTER COLUMN participant_id SET NOT NULL;
ALTER TABLE poll_submissions                  ALTER COLUMN participant_id SET NOT NULL;
ALTER TABLE competition_scores                ALTER COLUMN participant_id SET NOT NULL;
ALTER TABLE competition_session_judge_scores  ALTER COLUMN participant_id SET NOT NULL;

COMMIT;
