-- Phase 6 — Election module: votes, voting toggle, voter names on enrollment

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS voting_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE event_voters
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);

CREATE TABLE election_votes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  voter_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  position_id   UUID NOT NULL REFERENCES positions (id) ON DELETE CASCADE,
  candidate_id  UUID NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT election_votes_unique_ballot UNIQUE (event_id, voter_id, position_id, candidate_id)
);

CREATE INDEX idx_election_votes_event_id ON election_votes (event_id);
CREATE INDEX idx_election_votes_position_id ON election_votes (position_id);
CREATE INDEX idx_election_votes_candidate_id ON election_votes (candidate_id);
CREATE INDEX idx_election_votes_voter_event ON election_votes (event_id, voter_id);

COMMENT ON TABLE election_votes IS 'One row per candidate selected per voter per position in an election event.';
