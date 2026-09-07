-- ---------------------------------------------------------------------------
-- 068 — Judge score weighting + tier (score-band) awards
--
-- Additive and reversible. Both features are opt-in and NULL/absent by default,
-- so every existing competition scores exactly as it did before.
--
-- 1. event_participants.judge_weight — how much a judge's scores count when
--    combining judges. NULL means "counts the same as everyone else", which is
--    what every existing judge gets. The scoring engine only switches to the
--    weighted path when at least one judge on the event carries a weight.
--
-- 2. competition_awards gains method 'tier' plus tier_bands — score ranges that
--    map to labels (Platinum / Gold / Silver). Unlike the other methods this is
--    not a contest between contestants: everyone whose final score lands in a
--    band earns that band, so a band may have many winners or none.
-- ---------------------------------------------------------------------------

BEGIN;

-- 1. Judge weighting -------------------------------------------------------
ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS judge_weight NUMERIC(5, 2);

ALTER TABLE event_participants
  DROP CONSTRAINT IF EXISTS event_participants_judge_weight_chk;

ALTER TABLE event_participants
  ADD CONSTRAINT event_participants_judge_weight_chk
  CHECK (judge_weight IS NULL OR (judge_weight >= 0 AND judge_weight <= 100));

COMMENT ON COLUMN event_participants.judge_weight IS
  'Optional judge score weight (0-100). NULL = weighted equally with all other judges.';

-- 2. Tier awards -----------------------------------------------------------
ALTER TABLE competition_awards
  ADD COLUMN IF NOT EXISTS tier_bands JSONB;

ALTER TABLE competition_awards
  DROP CONSTRAINT IF EXISTS competition_awards_method_chk;

ALTER TABLE competition_awards
  ADD CONSTRAINT competition_awards_method_chk
  CHECK (method IN ('score', 'criteria', 'vote', 'selection', 'tier'));

COMMENT ON COLUMN competition_awards.tier_bands IS
  'Only for method = tier. JSON array of { min, max, label } score bands; every contestant landing in a band earns it.';

COMMIT;
