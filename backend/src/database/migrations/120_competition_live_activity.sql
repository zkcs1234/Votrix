-- Expose only authorized, score-free live activity metadata to the API.
BEGIN;

DO $$
BEGIN
 IF to_regprocedure('public.competition_child_scoring_choices(uuid,uuid,boolean)') IS NULL
 OR to_regclass('public.competition_child_sessions') IS NULL
 OR to_regclass('public.competition_child_scoring_audit') IS NULL
 THEN
   RAISE EXCEPTION 'MIGRATION_105_REQUIRED';
 END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.competition_child_live_activity(p_event uuid,p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE result jsonb;
BEGIN
 IF NOT competition_owns_event(p_event,p_actor)
 OR NOT EXISTS(
   SELECT 1 FROM public.users
   WHERE id=p_actor AND role::text='organizer' AND account_status::text='active'
 ) THEN
   RAISE EXCEPTION 'ORGANIZER_FORBIDDEN';
 END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'competitionId',activity.competition_id,
   'roundId',activity.round_id,
   'action',activity.action,
   'actorId',activity.actor_id,
   'createdAt',activity.created_at
 ) ORDER BY activity.created_at DESC),'[]'::jsonb)
 INTO result
 FROM (
   SELECT session.competition_id,session.round_id,audit.action,audit.actor_id,audit.created_at
   FROM public.competition_child_sessions session
   JOIN public.competition_child_scoring_audit audit ON audit.session_id=session.id
   WHERE session.event_id=p_event
   ORDER BY audit.created_at DESC
   LIMIT 25
 ) activity;

 RETURN result;
END
$$;

REVOKE ALL ON FUNCTION public.competition_child_live_activity(uuid,uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.competition_child_live_activity(uuid,uuid)
TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
