-- Reuse existing sections and preserve all legacy names, positions and votes.
BEGIN;

ALTER TABLE election_ballot_sections ADD COLUMN eligibility_mode TEXT NOT NULL DEFAULT 'all'
  CHECK (eligibility_mode IN ('all', 'selected'));

CREATE TABLE election_group_voters (
  event_id UUID NOT NULL,
  ballot_section_id UUID NOT NULL,
  participant_id UUID NOT NULL,
  PRIMARY KEY (ballot_section_id, participant_id),
  FOREIGN KEY (ballot_section_id, event_id) REFERENCES election_ballot_sections(id, event_id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id, event_id) REFERENCES event_participants(id, event_id) ON DELETE CASCADE
);
CREATE INDEX election_group_voters_event_idx ON election_group_voters(event_id, participant_id);
ALTER TABLE election_group_voters ENABLE ROW LEVEL SECURITY;

-- Check new names without rewriting or deleting legacy duplicate names.
CREATE FUNCTION enforce_election_group_name() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name THEN RETURN NEW; END IF;
  NEW.name := btrim(NEW.name);
  IF NEW.name IS NULL OR NEW.name = '' THEN
    RAISE EXCEPTION 'Election group name is required' USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.event_id::text || lower(NEW.name), 0));
  IF EXISTS (SELECT 1 FROM election_ballot_sections s
    WHERE s.event_id = NEW.event_id AND s.id <> NEW.id AND lower(btrim(s.name)) = lower(NEW.name)) THEN
    RAISE EXCEPTION 'An election group with this name already exists' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER election_group_name_guard BEFORE INSERT OR UPDATE OF name ON election_ballot_sections
  FOR EACH ROW EXECUTE FUNCTION enforce_election_group_name();
CREATE INDEX election_group_name_lookup ON election_ballot_sections(event_id, lower(btrim(name)));

-- New positions must specify their group. Existing assignments are untouched.
DROP TRIGGER IF EXISTS trg_positions_assign_default_ballot_section ON positions;

CREATE FUNCTION election_group_is_eligible(p_section_id UUID, p_participant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM election_ballot_sections s
    JOIN event_participants ep ON ep.event_id = s.event_id
    WHERE s.id = p_section_id AND ep.id = p_participant_id AND ep.participant_type = 'ELECTION_VOTER'
    AND (s.eligibility_mode = 'all' OR EXISTS (SELECT 1 FROM election_group_voters gv
      WHERE gv.ballot_section_id = s.id AND gv.participant_id = ep.id)));
$$;

CREATE FUNCTION set_election_group_eligibility(p_event_id UUID, p_section_id UUID, p_mode TEXT, p_participant_ids UUID[])
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM events WHERE id = p_event_id FOR UPDATE;
  PERFORM 1 FROM election_ballot_sections WHERE id = p_section_id AND event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Election group not found'; END IF;
  IF p_mode NOT IN ('all', 'selected') THEN RAISE EXCEPTION 'Invalid eligibility mode'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_participant_ids) requested(id)
    WHERE NOT EXISTS (SELECT 1 FROM event_participants ep WHERE ep.id = requested.id
      AND ep.event_id = p_event_id AND ep.participant_type = 'ELECTION_VOTER')) THEN
    RAISE EXCEPTION 'Voter must be enrolled in this election event';
  END IF;
  -- Never revoke eligibility for a voter whose ballot is already recorded.
  IF p_mode = 'selected' AND EXISTS (SELECT 1 FROM election_ballot_submissions
    WHERE ballot_section_id = p_section_id AND NOT (participant_id = ANY(p_participant_ids))) THEN
    RAISE EXCEPTION 'Cannot remove eligibility from voters with submitted ballots';
  END IF;
  DELETE FROM election_group_voters WHERE ballot_section_id = p_section_id;
  IF p_mode = 'selected' THEN
    INSERT INTO election_group_voters(event_id, ballot_section_id, participant_id)
      SELECT p_event_id, p_section_id, id FROM (SELECT DISTINCT unnest(p_participant_ids) id) voters;
  END IF;
  UPDATE election_ballot_sections SET eligibility_mode = p_mode WHERE id = p_section_id;
  -- has_voted remains a summary; submission uniqueness is enforced per group.
  UPDATE event_participants ep SET has_voted =
    EXISTS (SELECT 1 FROM election_ballot_sections s WHERE s.event_id = p_event_id AND election_group_is_eligible(s.id, ep.id))
    AND NOT EXISTS (SELECT 1 FROM election_ballot_sections s WHERE s.event_id = p_event_id
      AND election_group_is_eligible(s.id, ep.id) AND NOT EXISTS (
        SELECT 1 FROM election_ballot_submissions bs WHERE bs.ballot_section_id = s.id AND bs.participant_id = ep.id))
    WHERE ep.event_id = p_event_id AND ep.participant_type = 'ELECTION_VOTER';
END;
$$;
REVOKE ALL ON FUNCTION set_election_group_eligibility(UUID, UUID, TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_election_group_eligibility(UUID, UUID, TEXT, UUID[]) TO service_role;

-- The existing atomic submission function is replaced below with the same
-- position/candidate validation, nonce handling and per-group uniqueness.

CREATE OR REPLACE FUNCTION cast_election_ballot(
  p_event_id          UUID,
  p_voter_id          UUID,
  p_ballot_section_id UUID,
  p_votes             JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_participant_id UUID;
  v_first_pending UUID;
  v_total_sections INTEGER;
  v_submitted_sections INTEGER;
BEGIN
  SELECT ep.id
    INTO v_participant_id
    FROM event_participants ep
   WHERE ep.event_id = p_event_id
     AND ep.user_id = p_voter_id
     AND ep.participant_type = 'ELECTION_VOTER'
   FOR UPDATE;

  IF v_participant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT section.id
    INTO v_first_pending
    FROM election_ballot_sections section
   WHERE section.event_id = p_event_id AND election_group_is_eligible(section.id, v_participant_id)
     AND NOT EXISTS (
       SELECT 1
         FROM election_ballot_submissions submission
        WHERE submission.ballot_section_id = section.id
          AND submission.participant_id = v_participant_id
     )
   ORDER BY section.display_order, section.created_at, section.id
   LIMIT 1;

  IF v_first_pending IS NULL OR v_first_pending <> p_ballot_section_id THEN
    RETURN FALSE;
  END IF;

  IF jsonb_typeof(p_votes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Ballot must contain at least one vote'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_votes) = 0 THEN
    RAISE EXCEPTION 'Ballot must contain at least one vote'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_votes) AS vote
      LEFT JOIN positions p
        ON p.id = (vote->>'position_id')::UUID
       AND p.event_id = p_event_id
       AND p.ballot_section_id = p_ballot_section_id
      LEFT JOIN candidates c
        ON c.id = (vote->>'candidate_id')::UUID
       AND c.position_id = p.id
     WHERE p.id IS NULL OR c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Vote contains an invalid position or candidate'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM positions p
     WHERE p.event_id = p_event_id
       AND p.ballot_section_id = p_ballot_section_id
       AND NOT p.allow_skip
       AND NOT EXISTS (
         SELECT 1
           FROM jsonb_array_elements(p_votes) AS vote
          WHERE (vote->>'position_id')::UUID = p.id
       )
  ) THEN
    RAISE EXCEPTION 'Ballot omits a required position'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (
        SELECT (entry->>'position_id')::UUID AS position_id, COUNT(*) AS vote_count
          FROM jsonb_array_elements(p_votes) AS entry
         GROUP BY (entry->>'position_id')::UUID
      ) selected
      JOIN positions p ON p.id = selected.position_id
     WHERE p.event_id = p_event_id
       AND p.ballot_section_id = p_ballot_section_id
       AND selected.vote_count > p.max_vote
  ) THEN
    RAISE EXCEPTION 'Ballot exceeds the maximum votes for a position'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO election_votes (event_id, voter_id, position_id, candidate_id)
  SELECT
    p_event_id,
    p_voter_id,
    (vote->>'position_id')::UUID,
    (vote->>'candidate_id')::UUID
  FROM jsonb_array_elements(p_votes) AS vote;

  INSERT INTO election_ballot_submissions (
    event_id,
    ballot_section_id,
    participant_id
  ) VALUES (
    p_event_id,
    p_ballot_section_id,
    v_participant_id
  );

  SELECT COUNT(*)
    INTO v_total_sections
    FROM election_ballot_sections
   WHERE event_id = p_event_id AND election_group_is_eligible(id, v_participant_id);

  SELECT COUNT(*)
    INTO v_submitted_sections
    FROM election_ballot_submissions
   WHERE event_id = p_event_id
     AND participant_id = v_participant_id AND election_group_is_eligible(ballot_section_id, v_participant_id);

  UPDATE event_participants
     SET has_voted = v_submitted_sections = v_total_sections,
         voting_nonce = NULL
   WHERE id = v_participant_id;

  RETURN TRUE;
END;
$$;


COMMIT;
