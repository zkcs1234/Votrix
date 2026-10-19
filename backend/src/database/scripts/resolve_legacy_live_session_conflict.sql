-- Targeted repair for the conflict observed before migration 087.
-- Keep the newer active session; complete only the older paused session.
-- Run only after reviewing these exact IDs. No scores or sessions are deleted.
ROLLBACK;
BEGIN;
LOCK TABLE competition_sessions IN SHARE ROW EXCLUSIVE MODE;

DO $repair$
BEGIN
 PERFORM 1 FROM competition_sessions
 WHERE id IN ('ac71900f-8ef0-4c19-8954-9f2c8db1b0f0','6220504e-d773-46c7-950a-60855d9ee86a')
 ORDER BY id FOR UPDATE;
 IF to_regclass('public.competition_rule_versions') IS NOT NULL THEN
   RAISE EXCEPTION 'This repair is only for the legacy schema before migration 087';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM competition_sessions
   WHERE id='ac71900f-8ef0-4c19-8954-9f2c8db1b0f0'
     AND event_id='3beb7871-cee3-42cf-8436-02c4d9af4bbd' AND status='active'
 ) THEN
   RAISE EXCEPTION 'Expected current active session has changed; review before repairing';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM competition_sessions
   WHERE id='6220504e-d773-46c7-950a-60855d9ee86a'
     AND event_id='3beb7871-cee3-42cf-8436-02c4d9af4bbd' AND status='paused'
 ) THEN
   RAISE EXCEPTION 'Expected obsolete paused session has changed; review before repairing';
 END IF;
 IF EXISTS (SELECT 1 FROM competition_session_judge_scores WHERE session_id='6220504e-d773-46c7-950a-60855d9ee86a')
    OR EXISTS (SELECT 1 FROM competition_result_calculations WHERE session_id='6220504e-d773-46c7-950a-60855d9ee86a') THEN
   RAISE EXCEPTION 'Paused session now has score or result records; review before repairing';
 END IF;
 IF EXISTS (
   SELECT 1 FROM competition_sessions
   WHERE event_id='3beb7871-cee3-42cf-8436-02c4d9af4bbd' AND status='completed'
 ) THEN
   RAISE EXCEPTION 'Legacy completed-session uniqueness needs review before repairing';
 END IF;
END;
$repair$;

UPDATE competition_sessions
SET status='completed',completed_at=coalesce(completed_at,now())
WHERE id='6220504e-d773-46c7-950a-60855d9ee86a'
  AND event_id='3beb7871-cee3-42cf-8436-02c4d9af4bbd' AND status='paused'
RETURNING id,event_id,status,completed_at;

COMMIT;
