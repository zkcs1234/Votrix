-- Vital for getting all votes for an event
CREATE INDEX IF NOT EXISTS idx_votes_event_id ON election_votes(event_id);

-- Vital for calculating results
CREATE INDEX IF NOT EXISTS idx_votes_candidate_id ON election_votes(candidate_id);

-- Vital for checking if a voter already voted
CREATE INDEX IF NOT EXISTS idx_event_voters_composite ON event_voters(event_id, voter_id);

-- Vital for listing candidates by position
CREATE INDEX IF NOT EXISTS idx_candidates_position_id ON candidates(position_id);
