-- 057_down_competition_type.sql
-- Rollback for 057_competition_type.sql. Drops the index and the column.
-- Data loss is limited to the competition_type labels themselves (display-only).

DROP INDEX IF EXISTS idx_events_competition_type;

ALTER TABLE events
  DROP COLUMN IF EXISTS competition_type;
