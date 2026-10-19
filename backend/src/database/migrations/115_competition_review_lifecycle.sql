-- Forward correction after 114. No historical rules, scores or results rewritten.
-- Native events must complete event-wide review before live/scoring access.
-- Existing native events without a completion marker require explicit review;
-- mapped legacy contexts continue through their legacy endpoints.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.competition_complete_creation(uuid,uuid,jsonb)') IS NULL
 OR to_regprocedure('public.competition_child_scoring_context(uuid,uuid,uuid,uuid,boolean)') IS NULL
 THEN RAISE EXCEPTION 'MIGRATIONS_110_THROUGH_114_REQUIRED'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.competition_parent_review_token(p_event public.events)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT md5(jsonb_build_object('id',p_event.id,'organizationId',p_event.organization_id,
 'eventType',p_event.event_type,'title',p_event.title,'description',p_event.description,
 'banner',p_event.banner,'startEpoch',extract(epoch FROM p_event.start_date),
 'endEpoch',extract(epoch FROM p_event.end_date),'competitionType',p_event.competition_type)::text);
$$;
REVOKE ALL ON FUNCTION public.competition_parent_review_token(public.events) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.competition_creation_parent_review(p_event uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e events;
BEGIN
 PERFORM competition_child_authority(p_event,p_actor,false);
 SELECT * INTO e FROM events WHERE id=p_event FOR UPDATE;
 RETURN jsonb_build_object('event',to_jsonb(e),'parentReviewToken',competition_parent_review_token(e));
END $$;

-- Preserve the tested atomic all-child operation as a private implementation.
DO $$ BEGIN
 IF to_regprocedure('public.competition_complete_creation_v110(uuid,uuid,jsonb)') IS NULL THEN
  ALTER FUNCTION public.competition_complete_creation(uuid,uuid,jsonb) RENAME TO competition_complete_creation_v110;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.competition_complete_creation_v110(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Old application versions fail closed instead of completing an unreviewed parent.
CREATE OR REPLACE FUNCTION public.competition_complete_creation(p_event uuid,p_actor uuid,p_children jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM competition_child_authority(p_event,p_actor,false);
 RAISE EXCEPTION 'PARENT_REVIEW_TOKEN_REQUIRED';
END $$;

CREATE OR REPLACE FUNCTION public.competition_complete_creation(p_event uuid,p_actor uuid,p_children jsonb,p_parent_review_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e events;
BEGIN
 PERFORM competition_child_authority(p_event,p_actor,false);
 SELECT * INTO e FROM events WHERE id=p_event FOR UPDATE;
 IF p_parent_review_token IS NULL OR p_parent_review_token='' THEN RAISE EXCEPTION 'PARENT_REVIEW_TOKEN_REQUIRED'; END IF;
 IF p_parent_review_token IS DISTINCT FROM competition_parent_review_token(e) THEN RAISE EXCEPTION 'PARENT_REVISION_CONFLICT'; END IF;
 RETURN competition_complete_creation_v110(p_event,p_actor,p_children);
END $$;

-- Wrap the common scoring boundary, used by both live and judge operations.
DO $$ BEGIN
 IF to_regprocedure('public.competition_child_scoring_context_v105(uuid,uuid,uuid,uuid,boolean)') IS NULL THEN
  ALTER FUNCTION public.competition_child_scoring_context(uuid,uuid,uuid,uuid,boolean) RENAME TO competition_child_scoring_context_v105;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.competition_child_scoring_context_v105(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.competition_child_scoring_context(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_owner boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE context jsonb;
BEGIN
 -- Check authority and frozen scope first; do not expose another event's state.
 context:=competition_child_scoring_context_v105(p_event,p_competition,p_actor,p_round,p_owner);
 IF NOT EXISTS(SELECT 1 FROM events WHERE id=p_event AND competition_created_at IS NOT NULL) THEN
  RAISE EXCEPTION 'EVENT_CREATION_REVIEW_REQUIRED';
 END IF;
 RETURN context;
END $$;
REVOKE ALL ON FUNCTION public.competition_child_scoring_context(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.competition_creation_parent_review(uuid,uuid),public.competition_complete_creation(uuid,uuid,jsonb),public.competition_complete_creation(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.competition_creation_parent_review(uuid,uuid),public.competition_complete_creation(uuid,uuid,jsonb,text) TO service_role;
-- The old signature remains unavailable to the backend as well.
REVOKE ALL ON FUNCTION public.competition_complete_creation(uuid,uuid,jsonb) FROM service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
