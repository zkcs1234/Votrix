-- Phase 1 - Image support for questions and options
-- Add image_url to poll_questions and poll_options tables.

ALTER TABLE poll_questions
ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE poll_options
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Index for question image queries (if needed for fast lookups or cleanup)
CREATE INDEX IF NOT EXISTS idx_poll_questions_image_url
  ON poll_questions (image_url)
  WHERE image_url IS NOT NULL;
