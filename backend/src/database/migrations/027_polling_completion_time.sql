-- Phase 9 — Polling completion time tracking
-- Add started_at and completed_at to poll_submissions for analytics.

ALTER TABLE poll_submissions
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill completed_at for existing submissions (set to created_at)
UPDATE poll_submissions
SET
    completed_at = created_at
WHERE
    completed_at IS NULL;

-- Backfill started_at for existing submissions (set to 2 minutes before created_at as estimate)
UPDATE poll_submissions
SET
    started_at = created_at - interval '2 minutes'
WHERE
    started_at IS NULL;

COMMENT ON COLUMN poll_submissions.started_at IS 'When the respondent started the poll (client-reported).';

COMMENT ON COLUMN poll_submissions.completed_at IS 'When the submission was recorded on the server.';