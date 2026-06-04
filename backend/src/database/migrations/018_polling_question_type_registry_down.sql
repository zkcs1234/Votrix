-- DOWN migration for 017_polling_question_type_registry.sql

BEGIN;

DROP VIEW IF EXISTS v_poll_question_types;

DROP TRIGGER IF EXISTS trg_poll_question_types_updated_at ON poll_question_types;
DROP TABLE IF EXISTS poll_question_types;

DROP TRIGGER IF EXISTS trg_system_poll_question_types_updated_at ON system_poll_question_types;
DROP TABLE IF EXISTS system_poll_question_types;

-- type_config on poll_questions
ALTER TABLE poll_questions DROP COLUMN IF EXISTS type_config;

-- Note: poll_question_type enum values (multiple_choice, likert_scale, open_text,
-- ranking) cannot be removed in Postgres. They remain in the enum but are no
-- longer referenced by the application code.

COMMIT;
