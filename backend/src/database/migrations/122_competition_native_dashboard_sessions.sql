-- Expose owner-authorized metadata for active native scoring sessions on the organizer dashboard.
BEGIN;

DO $$
BEGIN
 IF to_regclass('public.competition_child_sessions') IS NULL
 OR to_regclass('public.competitions') IS NULL
 OR to_regclass('public.competition_child_rounds') IS NULL
 THEN
   RAISE EXCEPTION 'MIGRATION_105_REQUIRED';
 END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.competition_child_active_sessions_for_organizer(p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(
   SELECT 1
   FROM public.users
   WHERE id=p_actor AND role::text='organizer' AND account_status::text='active'
 ) THEN
   RAISE EXCEPTION 'ORGANIZER_FORBIDDEN';
 END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'eventId',session.event_id,
   'eventTitle',event.title,
   'competitionName',competition.name,
   'roundName',coalesce(round.definition->>'name','Single phase'),
   'sessionId',session.id,
   'status',session.status,
   'startedAt',session.created_at
 ) ORDER BY session.created_at DESC),'[]'::jsonb)
 INTO result
 FROM public.competition_child_sessions session
 JOIN public.events event ON event.id=session.event_id
 JOIN public.organizations organization
   ON organization.id=event.organization_id AND organization.organizer_id=p_actor
 JOIN public.competitions competition
   ON competition.id=session.competition_id
  AND competition.event_id=session.event_id
  AND competition.origin='native'
 LEFT JOIN public.competition_child_rounds round
   ON round.id=session.round_id
  AND round.competition_id=session.competition_id
  AND round.event_id=session.event_id
 WHERE session.status='active';

 RETURN result;
END
$$;

REVOKE ALL ON FUNCTION public.competition_child_active_sessions_for_organizer(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.competition_child_active_sessions_for_organizer(uuid)
TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
