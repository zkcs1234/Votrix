-- Down for 145: intentionally a no-op.
--
-- Rolling back would restore functions that only match the legacy
-- ELECTION_VOTER / POLLING_RESPONDENT values, which stops every STUDENT
-- enrollment from voting or responding. To do it anyway, re-run the function
-- definitions in 080_election_groups.sql (election_group_is_eligible,
-- set_election_group_eligibility), 130_election_position_program_eligibility.sql
-- (cast_election_ballot) and 087_anonymous_poll_at_rest_rpc.sql
-- (cast_poll_response, six-argument version).
SELECT 1;
