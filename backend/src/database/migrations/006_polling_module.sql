-- Phase 8 — Polling module

ALTER TYPE poll_question_type ADD VALUE IF NOT EXISTS 'checkbox';
ALTER TYPE poll_question_type ADD VALUE IF NOT EXISTS 'yes_no';

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS polling_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS poll_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS poll_allow_multiple_submissions BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS poll_expires_at TIMESTAMPTZ;

ALTER TABLE poll_questions
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE poll_options (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   UUID NOT NULL REFERENCES poll_questions (id) ON DELETE CASCADE,
  label         VARCHAR(255) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_poll_options_question_id ON poll_options (question_id);

CREATE TABLE poll_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  voter_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_poll_submissions_event_id ON poll_submissions (event_id);
CREATE INDEX idx_poll_submissions_voter_id ON poll_submissions (voter_id);

ALTER TABLE poll_answers
  ADD COLUMN IF NOT EXISTS submission_id UUID REFERENCES poll_submissions (id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_poll_answers_one_per_voter;

CREATE INDEX idx_poll_answers_submission_id ON poll_answers (submission_id);

-- One answer row per question per submission
CREATE UNIQUE INDEX idx_poll_answers_submission_question
  ON poll_answers (submission_id, question_id)
  WHERE submission_id IS NOT NULL;

COMMENT ON TABLE poll_options IS 'Choices for multiple choice, checkbox, and yes/no questions.';
COMMENT ON TABLE poll_submissions IS 'One record per voter poll submission (supports multiple submissions per event).';
