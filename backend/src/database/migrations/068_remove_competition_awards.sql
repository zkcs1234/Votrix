-- ---------------------------------------------------------------------------
-- 068 — Remove Competition Awards (Cleanup)
--
-- Drops the competition_award_selections and competition_awards tables,
-- and removes the awards_enabled flag from the events table.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS competition_award_selections;
DROP TABLE IF EXISTS competition_awards;

ALTER TABLE events
  DROP COLUMN IF EXISTS awards_enabled;
