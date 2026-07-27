-- Migration: 032_down_election_further_enhancements.sql

BEGIN;

DROP VIEW IF EXISTS v_election_vote_timeline;
DROP INDEX IF EXISTS idx_election_votes_created_at_event;
DROP INDEX IF EXISTS idx_events_election_status;
DROP INDEX IF EXISTS idx_invitations_event_status;

ALTER TABLE events
  DROP COLUMN IF EXISTS election_status;

ALTER TABLE invitations
  DROP COLUMN IF EXISTS email_bounced_at,
  DROP COLUMN IF EXISTS email_delivered_at,
  DROP COLUMN IF EXISTS email_status;

ALTER TABLE event_voters
  DROP COLUMN IF EXISTS voting_nonce;

COMMIT;
