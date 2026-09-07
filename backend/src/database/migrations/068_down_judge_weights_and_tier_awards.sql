-- ---------------------------------------------------------------------------
-- 068 DOWN — revert judge score weighting + tier (score-band) awards.
--
-- Any 'tier' awards are removed first: the method CHECK cannot be narrowed back
-- while rows still use the value.
-- ---------------------------------------------------------------------------

BEGIN;

DELETE FROM competition_awards WHERE method = 'tier';

ALTER TABLE competition_awards
  DROP CONSTRAINT IF EXISTS competition_awards_method_chk;

ALTER TABLE competition_awards
  ADD CONSTRAINT competition_awards_method_chk
  CHECK (method IN ('score', 'criteria', 'vote', 'selection'));

ALTER TABLE competition_awards
  DROP COLUMN IF EXISTS tier_bands;

ALTER TABLE event_participants
  DROP CONSTRAINT IF EXISTS event_participants_judge_weight_chk;

ALTER TABLE event_participants
  DROP COLUMN IF EXISTS judge_weight;

COMMIT;
