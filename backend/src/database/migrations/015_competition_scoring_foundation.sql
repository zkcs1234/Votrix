-- Phase 4 — Competition Scoring Foundation
-- Goal: extend the competition scoring model into a dynamic scoring engine that
-- supports unlimited Categories, Rounds, and Criteria without code changes.
--
-- The existing schema (events → competition_contestants, competition_criteria,
-- competition_scores) is preserved and extended with:
--
--   • competition_categories   — top-level grouping (e.g. "Talent", "Evening Gown")
--   • competition_rounds       — temporal stages within a category or event
--   • competition_judges       — first-class judge model (replaces voter-as-judge)
--   • competition_judge_assignments — flexible (event / category / round) scope
--   • competition_round_contestants — many-to-many contestants ↔ rounds
--   • competition_round_criteria    — many-to-many criteria ↔ rounds
--
-- Permission roles for Phase 6 land in the same migration family (017_*).
-- Scoring config (Phase 5) lives in events + competition_categories tables
-- (columns added in 016_scoring_config.sql). The defaults in this migration
-- keep the existing simple-event flow working unchanged.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competition_assignment_scope') THEN
    CREATE TYPE competition_assignment_scope AS ENUM (
      'event',      -- judge can score every contestant × criterion in the event
      'category',   -- judge can score only inside one or more categories
      'round'       -- judge can score only inside one or more rounds
    );
  END IF;
END
$$;

-- judge_role is added in 017. Forward-declared here as a no-op so the
-- competition_judges.role column can be a real enum instead of free text.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competition_judge_role') THEN
    CREATE TYPE competition_judge_role AS ENUM (
      'judge',            -- can submit scores
      'head_judge',       -- can submit scores + finalize/close rounds
      'score_reviewer'    -- read-only access to scores and rankings
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. competition_categories
--    Categories are an optional grouping layer above criteria. Many
--    competitions (pageants, dance, music) group scoring into categories
--    like "Talent", "Swimwear", "Evening Gown". Each category may contain
--    its own criteria and rounds, and has its own weight.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competition_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    event_id UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    weight NUMERIC(5, 2) NOT NULL DEFAULT 0, -- percentage; categories must total 100 at scoring time
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT competition_categories_weight_range CHECK (
        weight >= 0
        AND weight <= 100
    )
);

CREATE INDEX IF NOT EXISTS idx_competition_categories_event_id ON competition_categories (event_id);

CREATE INDEX IF NOT EXISTS idx_competition_categories_event_order ON competition_categories (event_id, display_order);

CREATE TRIGGER trg_competition_categories_updated_at
  BEFORE UPDATE ON competition_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON
TABLE competition_categories IS 'Phase 4: optional top-level grouping for criteria and rounds. Weight % contributes to final ranking.';

-- ---------------------------------------------------------------------------
-- 3. competition_rounds
--    Rounds are stages of the competition, e.g. "Preliminary", "Final", or
--    each segment of a pageant. A round can belong to an event directly,
--    or to a specific category. It carries its own weight used when
--    combining the final score.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competition_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    event_id UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    category_id UUID REFERENCES competition_categories (id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    weight NUMERIC(5, 2) NOT NULL DEFAULT 0, -- percentage; rounds must total 100 at scoring time
    is_open BOOLEAN NOT NULL DEFAULT FALSE, -- organizer can open/close per round
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT competition_rounds_weight_range CHECK (
        weight >= 0
        AND weight <= 100
    )
);

CREATE INDEX IF NOT EXISTS idx_competition_rounds_event_id ON competition_rounds (event_id);

CREATE INDEX IF NOT EXISTS idx_competition_rounds_category_id ON competition_rounds (category_id);

CREATE INDEX IF NOT EXISTS idx_competition_rounds_event_order ON competition_rounds (event_id, display_order);

CREATE TRIGGER trg_competition_rounds_updated_at
  BEFORE UPDATE ON competition_rounds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON
TABLE competition_rounds IS 'Phase 4: stages of a competition. A round can be event-wide or scoped to a category. Weight % contributes to final ranking.';

-- ---------------------------------------------------------------------------
-- 4. Extend competition_criteria with category_id + display_order
--    Existing rows: category_id defaults to NULL (criteria apply event-wide)
--    display_order is backfilled using creation order for stable UI.
-- ---------------------------------------------------------------------------
ALTER TABLE competition_criteria
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES competition_categories (id) ON DELETE SET NULL;

ALTER TABLE competition_criteria
ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_competition_criteria_category_id ON competition_criteria (category_id);

CREATE INDEX IF NOT EXISTS idx_competition_criteria_event_order ON competition_criteria (event_id, display_order);

WITH
    ordered AS (
        SELECT id, ROW_NUMBER() OVER (
                PARTITION BY
                    event_id
                ORDER BY created_at, id
            ) - 1 AS rn
        FROM competition_criteria
    )
UPDATE competition_criteria c
SET
    display_order = o.rn
FROM ordered o
WHERE
    o.id = c.id
    AND c.display_order = 0
    AND c.category_id IS NULL;

COMMENT ON COLUMN competition_criteria.category_id IS 'Phase 4: optional category this criterion belongs to. NULL = applies to the whole event.';

COMMENT ON COLUMN competition_criteria.display_order IS 'Phase 4: ascending sort order inside its (event | category) bucket.';

-- ---------------------------------------------------------------------------
-- 5. competition_round_contestants — which contestants appear in each round
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competition_round_contestants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    round_id UUID NOT NULL REFERENCES competition_rounds (id) ON DELETE CASCADE,
    contestant_id UUID NOT NULL REFERENCES competition_contestants (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT competition_round_contestants_unique UNIQUE (round_id, contestant_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_round_contestants_round_id ON competition_round_contestants (round_id);

CREATE INDEX IF NOT EXISTS idx_competition_round_contestants_contestant_id ON competition_round_contestants (contestant_id);

-- ---------------------------------------------------------------------------
-- 6. competition_round_criteria — which criteria are scored in each round
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competition_round_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    round_id UUID NOT NULL REFERENCES competition_rounds (id) ON DELETE CASCADE,
    criteria_id UUID NOT NULL REFERENCES competition_criteria (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT competition_round_criteria_unique UNIQUE (round_id, criteria_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_round_criteria_round_id ON competition_round_criteria (round_id);

CREATE INDEX IF NOT EXISTS idx_competition_round_criteria_criteria_id ON competition_round_criteria (criteria_id);

-- ---------------------------------------------------------------------------
-- 7. competition_judges
--    A first-class judge model decoupled from the voter/judge fusion.
--    Phase 6 keeps the legacy event_voters.is_judge path working for
--    already-invited judges (see view below).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competition_judges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    event_id UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role competition_judge_role NOT NULL DEFAULT 'judge',
    display_name VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    has_submitted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT competition_judges_unique UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_judges_event_id ON competition_judges (event_id);

CREATE INDEX IF NOT EXISTS idx_competition_judges_user_id ON competition_judges (user_id);

CREATE INDEX IF NOT EXISTS idx_competition_judges_event_role ON competition_judges (event_id, role);

CREATE TRIGGER trg_competition_judges_updated_at
  BEFORE UPDATE ON competition_judges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON
TABLE competition_judges IS 'Phase 4: first-class judge model. Decoupled from event_voters.is_judge. Phase 6 introduces flexible assignment scopes.';

-- ---------------------------------------------------------------------------
-- 8. competition_judge_assignments
--    Granular, flexible scope for a judge. The triple (scope, scope_id)
--    identifies what a judge can score:
--       scope='event'    → scope_id = event_id, judge can score everything
--       scope='category' → scope_id = category_id, judge only scores that category
--       scope='round'    → scope_id = round_id, judge only scores that round
--    Multiple rows per (event, user) are allowed: a judge can be assigned to
--    one event + several rounds, for example.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competition_judge_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id            UUID NOT NULL REFERENCES competition_judges (id) ON DELETE CASCADE,
  scope               competition_assignment_scope NOT NULL,
  scope_id            UUID NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

-- (event, category, round) all reference events/categories/rounds by id,
-- enforced with a CHECK that all scope_ids belong to the same event as the
-- parent judge row. The DB can't easily express cross-table FKs per
-- scope value, so application layer validates and we add a uniqueness
-- constraint that is sufficient for the engine.

CONSTRAINT competition_judge_assignments_unique
    UNIQUE (judge_id, scope, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_judge_assignments_judge_id ON competition_judge_assignments (judge_id);

CREATE INDEX IF NOT EXISTS idx_competition_judge_assignments_scope ON competition_judge_assignments (scope, scope_id);

COMMENT ON
TABLE competition_judge_assignments IS 'Phase 4/6: judge scope. (event, category, round) define what a judge can score.';

-- ---------------------------------------------------------------------------
-- 9. Extend competition_scores with round_id and category_id
--    Existing rows: round_id/category_id are NULL. The unique constraint
--    (judge × contestant × criteria) still applies, so re-submitting for a
--    given round will update the same row in the legacy path.
--    For round-aware scoring the unique constraint is widened to include
--    round_id.
-- ---------------------------------------------------------------------------
ALTER TABLE competition_scores
ADD COLUMN IF NOT EXISTS round_id UUID REFERENCES competition_rounds (id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES competition_categories (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_competition_scores_round_id ON competition_scores (round_id);

CREATE INDEX IF NOT EXISTS idx_competition_scores_category_id ON competition_scores (category_id);

-- Old constraint: UNIQUE (judge_id, contestant_id, criteria_id)
-- New constraint: UNIQUE (judge_id, contestant_id, criteria_id, round_id)
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'competition_scores'::regclass
     AND contype = 'u'
     AND pg_get_constraintdef(oid) LIKE '%(judge_id, contestant_id, criteria_id)%';

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
       AND pg_get_constraintdef(oid) LIKE '%(judge_id, contestant_id, criteria_id, round_id)%'
  ) THEN
    ALTER TABLE competition_scores
      ADD CONSTRAINT competition_scores_unique_with_round
      UNIQUE (judge_id, contestant_id, criteria_id, round_id);

END IF;

END $$;

COMMENT ON COLUMN competition_scores.round_id IS 'Phase 4: optional round this score was submitted in. NULL = event-wide score.';

COMMENT ON COLUMN competition_scores.category_id IS 'Phase 4: optional category this score belongs to. Denormalized for fast ranking.';

-- ---------------------------------------------------------------------------
-- 10. events.scoring_config (Phase 5) — single row per event as JSONB
--     Kept here so Phase 4's foundation migration owns the events extension
--     surface; default keeps existing behaviour.
-- ---------------------------------------------------------------------------
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS scoring_config JSONB NOT NULL DEFAULT '{
    "scoreType": "range_1_100",
    "calculationMethod": "weighted_average",
    "decimalPlaces": 2,
    "dropHighest": 0,
    "dropLowest": 0
  }'::jsonb;

CREATE INDEX IF NOT EXISTS idx_events_scoring_config_gin ON events USING GIN (scoring_config);

COMMENT ON COLUMN events.scoring_config IS 'Phase 5: organizer-configured scoring rules. scoreType, calculationMethod, weights.';

-- ---------------------------------------------------------------------------
-- 11. Backward-compat view: legacy voter-as-judge surface
--     The application layer in Phase 4 still uses event_voters.is_judge for
--     already-invited judges. The view keeps reports and ranking services
--     working while judges are gradually migrated to competition_judges.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_legacy_competition_judges AS
  SELECT
    ev.event_id,
    ev.voter_id        AS user_id,
    'judge'::competition_judge_role AS role,
    ev.is_judge        AS is_active,
    ev.has_scored      AS has_submitted
  FROM event_voters ev
 WHERE ev.is_judge = TRUE;

COMMIT;