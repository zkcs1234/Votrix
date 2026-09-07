-- 071_minor_criteria.sql
-- Add a MINOR-CRITERIA level beneath competition_criteria.
--
-- Structure:
--     competition_rounds  →  competition_criteria  →  competition_minor_criteria
--
-- Judges now score MINOR criteria, not criteria directly. A criterion's score is
-- the AVERAGE of its minor criteria (minors carry NO percentage — equal weight).
-- The SCORE TYPE (range_1_10, range_1_100, decimal, custom_range) moves DOWN onto
-- each minor criterion, so a single criterion may mix scales; the scoring engine
-- normalizes each minor to a percentage of its own max before averaging.
--
-- Additive and reversible. Backfill preserves every existing event and score:
-- each existing criterion gets ONE default minor criterion inheriting the event's
-- current scoring_config.scoreType, and existing scores re-point to it.
--
-- Apply in the Supabase SQL Editor in numeric order (see database/README.md).

BEGIN;

-- 1. competition_minor_criteria -------------------------------------------------
CREATE TABLE IF NOT EXISTS competition_minor_criteria (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    criteria_id   UUID NOT NULL REFERENCES competition_criteria (id) ON DELETE CASCADE,
    event_id      UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    score_type    VARCHAR(32)  NOT NULL DEFAULT 'range_1_100',
    custom_min    NUMERIC(10, 2),
    custom_max    NUMERIC(10, 2),
    display_order INTEGER      NOT NULL DEFAULT 0,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT competition_minor_criteria_score_type_chk
        CHECK (score_type IN ('range_1_10', 'range_1_100', 'decimal', 'custom_range')),
    CONSTRAINT competition_minor_criteria_custom_range_chk
        CHECK (custom_min IS NULL OR custom_max IS NULL OR custom_max >= custom_min)
);

CREATE INDEX IF NOT EXISTS idx_competition_minor_criteria_criteria_id
    ON competition_minor_criteria (criteria_id);
CREATE INDEX IF NOT EXISTS idx_competition_minor_criteria_event_id
    ON competition_minor_criteria (event_id);
CREATE INDEX IF NOT EXISTS idx_competition_minor_criteria_criteria_order
    ON competition_minor_criteria (criteria_id, display_order);

CREATE TRIGGER trg_competition_minor_criteria_updated_at
    BEFORE UPDATE ON competition_minor_criteria
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE competition_minor_criteria IS
    'Minor criteria beneath a competition_criteria. Judges score these. No percentage '
    '(equal weight within the parent criterion). Score type lives here per minor.';
COMMENT ON COLUMN competition_minor_criteria.score_type IS
    'Scale judges use for THIS minor (range_1_10 | range_1_100 | decimal | custom_range). '
    'The engine normalizes each minor to a percent of its max before averaging into the criterion.';

-- 2. competition_scores.minor_criteria_id --------------------------------------
ALTER TABLE competition_scores
    ADD COLUMN IF NOT EXISTS minor_criteria_id UUID
        REFERENCES competition_minor_criteria (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_competition_scores_minor_criteria_id
    ON competition_scores (minor_criteria_id);

COMMENT ON COLUMN competition_scores.minor_criteria_id IS
    'Minor criterion this score is for. Backfilled for legacy rows to the criterion''s '
    'single default minor. NULL only during the deploy window before backfill.';

-- 3. Backfill: one default minor per existing criterion ------------------------
-- Inherits the event''s current scoreType (and custom bounds when custom_range),
-- named after the criterion so the UI stays recognizable.
INSERT INTO competition_minor_criteria
    (criteria_id, event_id, name, score_type, custom_min, custom_max, display_order)
SELECT
    c.id,
    c.event_id,
    c.name,
    COALESCE(NULLIF(e.scoring_config ->> 'scoreType', ''), 'range_1_100'),
    NULLIF(e.scoring_config ->> 'customMin', '')::numeric,
    NULLIF(e.scoring_config ->> 'customMax', '')::numeric,
    0
FROM competition_criteria c
JOIN events e ON e.id = c.event_id
WHERE NOT EXISTS (
    SELECT 1 FROM competition_minor_criteria m WHERE m.criteria_id = c.id
);

-- 4. Re-point existing scores to that default minor ----------------------------
-- Safe because step 3 gives each criterion exactly one minor.
UPDATE competition_scores s
SET minor_criteria_id = m.id
FROM competition_minor_criteria m
WHERE m.criteria_id = s.criteria_id
  AND s.minor_criteria_id IS NULL;

-- 5. Widen the uniqueness of a score cell to include the minor -----------------
-- Old: UNIQUE (judge_id, contestant_id, criteria_id, round_id)
-- New: UNIQUE (judge_id, contestant_id, criteria_id, minor_criteria_id, round_id)
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'competition_scores'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) LIKE '%(judge_id, contestant_id, criteria_id, round_id)%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE competition_scores DROP CONSTRAINT %I', cname);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'competition_scores'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid)
           LIKE '%(judge_id, contestant_id, criteria_id, minor_criteria_id, round_id)%'
  ) THEN
    ALTER TABLE competition_scores
      ADD CONSTRAINT competition_scores_unique_with_minor
      UNIQUE (judge_id, contestant_id, criteria_id, minor_criteria_id, round_id);
  END IF;
END
$$;

COMMIT;
