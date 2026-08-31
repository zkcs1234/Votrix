-- ---------------------------------------------------------------------------
-- 066 DOWN — remove Competition Awards. Reversible.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS competition_awards;

ALTER TABLE events
  DROP COLUMN IF EXISTS awards_enabled;
