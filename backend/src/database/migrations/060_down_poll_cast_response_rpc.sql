-- Rollback for 060_poll_cast_response_rpc.sql
--
-- Dropping the function is safe once the application code no longer calls it
-- (i.e. after reverting the backend to the three-step write). No data is
-- affected — this function owns no tables or columns.

DROP FUNCTION IF EXISTS cast_poll_response(UUID, UUID, TIMESTAMPTZ, BOOLEAN, JSONB);
