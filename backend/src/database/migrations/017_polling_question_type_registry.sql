-- Phase 7 — Polling Management Enhancement
-- Goal: move question-type knowledge out of application code and into the
-- database. A new type can be added by inserting a single row (and, if
-- desired, a tiny UI hint in the `ui` JSONB column).
--
-- Design:
--   • system_poll_question_types     — built-in, seeded by this migration
--   • poll_question_types            — per-organization overrides / custom types
--   • poll_questions.type_config     — per-question override (e.g. 1–10 rating,
--                                     custom Likert labels, ranking option count)
--   • poll_options                    — already supports options; ranking and
--                                     choice questions share the table
--
-- Backward compatibility:
--   • Existing rows in poll_questions keep their `type` enum value unchanged.
--   • The application code reads the registry first and falls back to the
--     enum value if the registry row is missing.
--   • Removing a built-in enum value is not supported by Postgres, so the
--     existing poll_question_type enum is kept but no longer authoritative.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. system_poll_question_types
--    Built-in, globally available types. The `key` matches the existing
--    poll_question_type enum value where one exists, so legacy data still
--    resolves cleanly.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_poll_question_types (
  key             VARCHAR(64) PRIMARY KEY,
  label           VARCHAR(255) NOT NULL,
  description     TEXT,
  answer_format   JSONB NOT NULL,
  config_schema   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ui              JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT system_poll_question_types_key_not_empty CHECK (length(key) > 0)
);

CREATE TRIGGER trg_system_poll_question_types_updated_at
  BEFORE UPDATE ON system_poll_question_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE system_poll_question_types IS
  'Phase 7: built-in polling question type registry. Add a new type by inserting a row.';

-- ---------------------------------------------------------------------------
-- 2. poll_question_types — per-organization overrides / custom types
--    org_id NULL means "global custom" (shared by every organizer).
--    Otherwise the row overrides the system type with the same `key`.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS poll_question_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations (id) ON DELETE CASCADE,
  key             VARCHAR(64) NOT NULL,
  label           VARCHAR(255) NOT NULL,
  description     TEXT,
  answer_format   JSONB NOT NULL,
  config_schema   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ui              JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT poll_question_types_unique_per_org
    UNIQUE (organization_id, key)
);

CREATE INDEX IF NOT EXISTS idx_poll_question_types_org_id
  ON poll_question_types (organization_id);

CREATE INDEX IF NOT EXISTS idx_poll_question_types_org_active
  ON poll_question_types (organization_id, is_active, sort_order);

CREATE TRIGGER trg_poll_question_types_updated_at
  BEFORE UPDATE ON poll_question_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE poll_question_types IS
  'Phase 7: organizer-overridable or custom polling question types. organization_id NULL ⇒ global.';

-- ---------------------------------------------------------------------------
-- 3. Extend poll_questions with type_config (per-question override)
--    type_config lets the organizer customize a question without registering
--    a new type — e.g. a 1–10 rating, a custom Likert label set, or a ranking
--    list with a minimum number of items.
-- ---------------------------------------------------------------------------
ALTER TABLE poll_questions
  ADD COLUMN IF NOT EXISTS type_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN poll_questions.type_config IS
  'Phase 7: per-question type config (e.g. min/max for rating, scale labels for Likert).';

-- ---------------------------------------------------------------------------
-- 4. Seed the built-in types
--    The answer_format JSONB is consumed by the engine to validate and
--    serialize answers; the `ui` JSONB is consumed by the React form.
-- ---------------------------------------------------------------------------
INSERT INTO system_poll_question_types (key, label, description, answer_format, config_schema, ui, sort_order)
VALUES
  (
    'single_choice',
    'Single Choice',
    'Respondents pick exactly one option.',
    jsonb_build_object(
      'kind', 'choice',
      'cardinality', 'one',
      'value', 'option_id'
    ),
    jsonb_build_object(
      'options', jsonb_build_object('type', 'array', 'minItems', 2, 'items', jsonb_build_object('type', 'string', 'minLength', 1))
    ),
    jsonb_build_object('input', 'radio', 'optionEditor', 'options', 'autoOptions', false),
    10
  ),
  (
    'multiple_choice',
    'Multiple Choice',
    'Legacy alias for single_choice — kept for compatibility.',
    jsonb_build_object(
      'kind', 'choice',
      'cardinality', 'one',
      'value', 'option_id'
    ),
    jsonb_build_object(
      'options', jsonb_build_object('type', 'array', 'minItems', 2, 'items', jsonb_build_object('type', 'string', 'minLength', 1))
    ),
    jsonb_build_object('input', 'radio', 'optionEditor', 'options', 'autoOptions', false),
    20
  ),
  (
    'checkbox',
    'Multiple Selection',
    'Respondents can pick any number of options.',
    jsonb_build_object(
      'kind', 'choice',
      'cardinality', 'many',
      'value', 'option_ids'
    ),
    jsonb_build_object(
      'options', jsonb_build_object('type', 'array', 'minItems', 2, 'items', jsonb_build_object('type', 'string', 'minLength', 1)),
      'minSelected', jsonb_build_object('type', 'integer', 'minimum', 0),
      'maxSelected', jsonb_build_object('type', 'integer', 'minimum', 1)
    ),
    jsonb_build_object('input', 'checkbox', 'optionEditor', 'options', 'autoOptions', false),
    30
  ),
  (
    'yes_no',
    'Yes / No',
    'A binary question. Yes/No options are created automatically.',
    jsonb_build_object(
      'kind', 'choice',
      'cardinality', 'one',
      'value', 'option_id',
      'autoOptions', jsonb_build_array('Yes', 'No')
    ),
    jsonb_build_object(),
    jsonb_build_object('input', 'radio', 'autoOptions', true),
    40
  ),
  (
    'rating',
    'Rating Scale',
    'Numeric rating. Default 1–5; configurable up to 1–10.',
    jsonb_build_object(
      'kind', 'numeric',
      'min', 1,
      'max', 5,
      'step', 1
    ),
    jsonb_build_object(
      'min', jsonb_build_object('type', 'integer', 'minimum', 0, 'maximum', 10),
      'max', jsonb_build_object('type', 'integer', 'minimum', 1, 'maximum', 10),
      'step', jsonb_build_object('type', 'number', 'enum', jsonb_build_array(0.5, 1))
    ),
    jsonb_build_object('input', 'rating'),
    50
  ),
  (
    'likert_scale',
    'Likert Scale',
    'Ordered agreement scale. Labels are configurable (default 5-point).',
    jsonb_build_object(
      'kind', 'choice',
      'cardinality', 'one',
      'value', 'option_id',
      'autoOptionsFromConfig', true
    ),
    jsonb_build_object(
      'points', jsonb_build_object('type', 'integer', 'minimum', 3, 'maximum', 11, 'default', 5),
      'lowLabel', jsonb_build_object('type', 'string', 'default', 'Strongly disagree'),
      'highLabel', jsonb_build_object('type', 'string', 'default', 'Strongly agree')
    ),
    jsonb_build_object('input', 'likert'),
    60
  ),
  (
    'open_text',
    'Open Text',
    'Free-form text answer.',
    jsonb_build_object(
      'kind', 'text',
      'maxLength', 4000
    ),
    jsonb_build_object(
      'multiline', jsonb_build_object('type', 'boolean', 'default', true),
      'maxLength', jsonb_build_object('type', 'integer', 'minimum', 1, 'maximum', 10000)
    ),
    jsonb_build_object('input', 'textarea'),
    70
  ),
  (
    'ranking',
    'Ranking',
    'Respondents order a list of items. Ties are allowed.',
    jsonb_build_object(
      'kind', 'ranking',
      'value', 'ranking_map',
      'tiePolicy', 'allow'
    ),
    jsonb_build_object(
      'options', jsonb_build_object('type', 'array', 'minItems', 2, 'items', jsonb_build_object('type', 'string', 'minLength', 1)),
      'minItems', jsonb_build_object('type', 'integer', 'minimum', 2),
      'allowTies', jsonb_build_object('type', 'boolean', 'default', true)
    ),
    jsonb_build_object('input', 'ranking', 'optionEditor', 'options'),
    80
  )
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      answer_format = EXCLUDED.answer_format,
      config_schema = EXCLUDED.config_schema,
      ui = EXCLUDED.ui,
      sort_order = EXCLUDED.sort_order,
      updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 5. New alias enum values for the new built-in types.
--    Existing poll_question_type enum already has: single_choice, checkbox,
--    yes_no, text, rating. We add: likert_scale, open_text, ranking, multiple_choice.
--    ALTER TYPE ADD VALUE cannot run inside a transaction in older Postgres,
--    so these are emitted without BEGIN/COMMIT.
-- ---------------------------------------------------------------------------
ALTER TYPE poll_question_type ADD VALUE IF NOT EXISTS 'multiple_choice';
ALTER TYPE poll_question_type ADD VALUE IF NOT EXISTS 'likert_scale';
ALTER TYPE poll_question_type ADD VALUE IF NOT EXISTS 'open_text';
ALTER TYPE poll_question_type ADD VALUE IF NOT EXISTS 'ranking';

-- ---------------------------------------------------------------------------
-- 6. Helper view used by the engine to resolve a question's effective type
--    in one round-trip: system_poll_question_types UNION poll_question_types
--    (per-org overrides win).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_poll_question_types AS
  SELECT
    NULL::UUID        AS id,
    NULL::UUID        AS organization_id,
    s.key,
    s.label,
    s.description,
    s.answer_format,
    s.config_schema,
    s.ui,
    s.is_active,
    s.sort_order
  FROM system_poll_question_types s
  WHERE s.is_active = TRUE
UNION ALL
  SELECT
    o.id,
    o.organization_id,
    o.key,
    o.label,
    o.description,
    o.answer_format,
    o.config_schema,
    o.ui,
    o.is_active,
    o.sort_order
  FROM poll_question_types o
  WHERE o.is_active = TRUE;

COMMENT ON VIEW v_poll_question_types IS
  'Phase 7: effective type registry. Per-org overrides (poll_question_types) shadow built-ins (system_poll_question_types).';

COMMIT;
