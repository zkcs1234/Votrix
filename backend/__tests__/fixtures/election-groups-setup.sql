-- Minimal relationships needed to execute the real 078/079/080 migrations.
CREATE ROLE service_role;
CREATE TABLE events(id UUID PRIMARY KEY, event_type TEXT);
CREATE TABLE event_participants(id UUID PRIMARY KEY, event_id UUID REFERENCES events(id), user_id UUID,
  participant_type TEXT, has_voted BOOLEAN DEFAULT FALSE, voting_nonce UUID, updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE positions(id UUID PRIMARY KEY, event_id UUID REFERENCES events(id), name TEXT, max_vote INT DEFAULT 1, allow_skip BOOLEAN DEFAULT FALSE);
CREATE TABLE candidates(id UUID PRIMARY KEY, position_id UUID REFERENCES positions(id) ON DELETE CASCADE);
CREATE TABLE election_votes(event_id UUID REFERENCES events(id), voter_id UUID, position_id UUID REFERENCES positions(id), candidate_id UUID REFERENCES candidates(id),
  UNIQUE(event_id, voter_id, position_id, candidate_id));
CREATE FUNCTION set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
INSERT INTO events VALUES ('10000000-0000-0000-0000-000000000001', 'election');
INSERT INTO event_participants(id,event_id,user_id,participant_type,has_voted) VALUES
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','ELECTION_VOTER',TRUE);
