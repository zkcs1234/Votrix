-- Roll back section metadata only when no voter has submitted a multi-section event.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM election_ballot_sections section
     WHERE EXISTS (
       SELECT 1
         FROM election_ballot_submissions submission
        WHERE submission.event_id = section.event_id
     )
       AND (
         SELECT COUNT(*)
           FROM election_ballot_sections event_section
          WHERE event_section.event_id = section.event_id
       ) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot roll back ballot sections after a multi-section event has received submissions';
  END IF;
END;
$$;

DROP TABLE election_ballot_submissions;

DROP TRIGGER IF EXISTS trg_positions_assign_default_ballot_section ON positions;

DROP FUNCTION IF EXISTS fn_positions_assign_default_ballot_section ();

ALTER TABLE positions
DROP CONSTRAINT positions_ballot_section_event_fk,
DROP COLUMN ballot_section_id;

DROP INDEX IF EXISTS idx_positions_ballot_section_id;

DROP TRIGGER IF EXISTS trg_election_ballot_sections_updated_at ON election_ballot_sections;

DROP TABLE election_ballot_sections;

ALTER TABLE event_participants
DROP CONSTRAINT event_participants_id_event_unique;

COMMIT;