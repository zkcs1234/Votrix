-- Multiple ordered ballots within one election event.
-- Existing elections receive one default section so their behavior is unchanged.

BEGIN;

CREATE TABLE election_ballot_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    event_id UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT election_ballot_sections_id_event_unique UNIQUE (id, event_id)
);

CREATE INDEX idx_election_ballot_sections_event_order ON election_ballot_sections (
    event_id,
    display_order,
    created_at
);

CREATE TRIGGER trg_election_ballot_sections_updated_at
  BEFORE UPDATE ON election_ballot_sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO
    election_ballot_sections (event_id, name, display_order)
SELECT e.id, 'Main Election', 0
FROM events e
WHERE
    e.event_type = 'election';

ALTER TABLE event_participants
ADD CONSTRAINT event_participants_id_event_unique UNIQUE (id, event_id);

ALTER TABLE positions ADD COLUMN ballot_section_id UUID;

UPDATE positions p
SET
    ballot_section_id = s.id
FROM election_ballot_sections s
WHERE
    s.event_id = p.event_id;

ALTER TABLE positions
ALTER COLUMN ballot_section_id
SET
    NOT NULL,
ADD CONSTRAINT positions_ballot_section_event_fk FOREIGN KEY (ballot_section_id, event_id) REFERENCES election_ballot_sections (id, event_id) ON DELETE CASCADE;

CREATE INDEX idx_positions_ballot_section_id ON positions (ballot_section_id);

CREATE OR REPLACE FUNCTION fn_positions_assign_default_ballot_section()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ballot_section_id IS NULL THEN
        SELECT section.id
            INTO NEW.ballot_section_id
            FROM election_ballot_sections section
         WHERE section.event_id = NEW.event_id
         ORDER BY section.display_order, section.created_at, section.id
         LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_positions_assign_default_ballot_section
    BEFORE INSERT ON positions
    FOR EACH ROW EXECUTE FUNCTION fn_positions_assign_default_ballot_section();

CREATE TABLE election_ballot_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    event_id UUID NOT NULL,
    ballot_section_id UUID NOT NULL,
    participant_id UUID NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT election_ballot_submissions_once UNIQUE (
        ballot_section_id,
        participant_id
    ),
    CONSTRAINT election_ballot_submissions_section_event_fk FOREIGN KEY (ballot_section_id, event_id) REFERENCES election_ballot_sections (id, event_id) ON DELETE CASCADE,
    CONSTRAINT election_ballot_submissions_participant_event_fk FOREIGN KEY (participant_id, event_id) REFERENCES event_participants (id, event_id) ON DELETE CASCADE
);

CREATE INDEX idx_election_ballot_submissions_event ON election_ballot_submissions (event_id, submitted_at);

CREATE INDEX idx_election_ballot_submissions_participant ON election_ballot_submissions (participant_id, event_id);

-- Preserve completion for voters who already submitted a legacy one-part ballot.
INSERT INTO
    election_ballot_submissions (
        event_id,
        ballot_section_id,
        participant_id,
        submitted_at
    )
SELECT ep.event_id, section.id, ep.id, COALESCE(ep.updated_at, NOW())
FROM
    event_participants ep
    JOIN election_ballot_sections section ON section.event_id = ep.event_id
    JOIN events e ON e.id = ep.event_id
    AND e.event_type = 'election'
WHERE
    ep.participant_type = 'ELECTION_VOTER'
    AND ep.has_voted = TRUE;

COMMIT;