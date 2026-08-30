-- Rollback for 059_election_cast_ballot_rpc.sql
--
-- Dropping the function is safe once the application code no longer calls it
-- (i.e. after reverting the backend to the two-step write). No data is
-- affected — this function owns no tables or columns.

DROP FUNCTION IF EXISTS cast_election_ballot(UUID, UUID, JSONB);
