-- Serialize native live-session activation per parent event. Categories and
-- rounds remain independent, but only one native scoring session may be active
-- for an event at a time.
BEGIN;

DO $$
BEGIN
 IF to_regclass('public.competition_child_sessions') IS NULL
 OR to_regclass('public.competitions') IS NULL
 THEN
   RAISE EXCEPTION 'MIGRATIONS_103_AND_105_REQUIRED';
 END IF;

 IF EXISTS(
   SELECT 1
   FROM public.competition_child_sessions
   WHERE status='active'
   GROUP BY event_id
   HAVING count(*)>1
 ) THEN
   RAISE EXCEPTION 'CLOSE_DUPLICATE_ACTIVE_NATIVE_SESSIONS_BEFORE_MIGRATION_119';
 END IF;
END $$;

CREATE INDEX IF NOT EXISTS competition_child_active_sessions_by_event
ON public.competition_child_sessions(event_id)
WHERE status='active';

CREATE OR REPLACE FUNCTION public.competition_child_single_active_event_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=public
AS $$
BEGIN
 IF NEW.status='active' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(NEW.event_id::text,0));
   IF EXISTS(
     SELECT 1
     FROM public.competition_child_sessions active_session
     WHERE active_session.event_id=NEW.event_id
       AND active_session.status='active'
       AND active_session.id IS DISTINCT FROM NEW.id
   ) THEN
     RAISE EXCEPTION 'ACTIVE_CATEGORY_CONFLICT';
   END IF;
 END IF;
 RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS competition_child_single_active_event_guard
ON public.competition_child_sessions;
CREATE TRIGGER competition_child_single_active_event_guard
BEFORE INSERT OR UPDATE OF status,event_id
ON public.competition_child_sessions
FOR EACH ROW
EXECUTE FUNCTION public.competition_child_single_active_event_guard();

REVOKE ALL ON FUNCTION public.competition_child_single_active_event_guard()
FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
