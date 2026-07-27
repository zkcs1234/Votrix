-- Phase 4 — Election Management Further Enhancements
--
-- Migration: 032_election_further_enhancements.sql
-- Description: Adds voting nonce for replay protection, email delivery status tracking,
--              extended election status lifecycle, and timeline analytics indexes/views.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. event_voters — Ballot Submission Replay Protection
-- ---------------------------------------------------------------------------
ALTER TABLE event_voters
  ADD COLUMN IF NOT EXISTS voting_nonce UUID DEFAULT gen_random_uuid();

COMMENT ON COLUMN event_voters.voting_nonce IS
  'One-time UUID nonce required during ballot submission to prevent request replay attacks. Cleared after vote is recorded.';

-- ---------------------------------------------------------------------------
-- 2. invitations — Email Delivery Status Tracking
-- ---------------------------------------------------------------------------
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS email_status VARCHAR(20) DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent', 'delivered', 'bounced', 'opened')),
  ADD COLUMN IF NOT EXISTS email_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_bounced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invitations_event_status
  ON invitations (event_id, invitation_sent, email_status);

COMMENT ON COLUMN invitations.email_status IS
  'Status of email delivery via Resend/provider: pending | sent | delivered | bounced | opened';

-- ---------------------------------------------------------------------------
-- 3. events — Election Status Lifecycle Management
-- ---------------------------------------------------------------------------
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS election_status VARCHAR(20) DEFAULT 'draft'
    CHECK (election_status IN ('draft', 'active', 'closed', 'finalized', 'archived'));

CREATE INDEX IF NOT EXISTS idx_events_election_status
  ON events (election_status);

COMMENT ON COLUMN events.election_status IS
  'Extended election status lifecycle: draft | active | closed | finalized | archived';

-- ---------------------------------------------------------------------------
-- 4. Performance Indexes & Time-Series Analytics View
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_election_votes_created_at_event
  ON election_votes (event_id, created_at);

CREATE OR REPLACE VIEW v_election_vote_timeline AS
SELECT
  event_id,
  DATE_TRUNC('hour', created_at) AS period_hour,
  DATE_TRUNC('day', created_at) AS period_day,
  COUNT(*) AS vote_count,
  COUNT(DISTINCT voter_id) AS unique_voters
FROM election_votes
GROUP BY 1, 2, 3;

COMMIT;
