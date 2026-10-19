-- Phase 8: additive metadata RPC and authorized draft-only membership removal.
-- No backfill, historical rewrite, scoring formula or existing RPC replacement.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.competition_child_owned_results(uuid,uuid,uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'REVIEWED_107_REQUIRED'; END IF;
END $$;
CREATE OR REPLACE FUNCTION competition_child_judge_navigation(p_event uuid,p_actor uuid,p_reviewers boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE contexts jsonb; item jsonb; view jsonb; result jsonb:='[]'; state text; available boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM event_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.event_id=p_event AND ep.user_id=p_actor AND ep.is_active AND ep.participant_type::text='COMPETITION_JUDGE' AND u.account_status::text='active' AND u.role::text IN('participant','voter')) THEN RAISE EXCEPTION 'JUDGE_FORBIDDEN'; END IF;
 contexts:=competition_child_scoring_choices(p_event,p_actor,false);
 FOR item IN SELECT value FROM jsonb_array_elements(contexts) LOOP
  BEGIN
   view:=competition_child_live_view(p_event,(item->>'competitionId')::uuid,p_actor,(item->>'roundId')::uuid,false);
   available:=false;
   -- jsonb null differs from SQL NULL. Only a current head can mean submitted.
   IF view->>'laterRoundBlocked'='true' THEN state:='waiting';available:=false;
   ELSIF view->'submission' IS DISTINCT FROM 'null'::jsonb AND view->'submission' IS NOT NULL THEN state:='submitted';available:=false;
   ELSIF view->'session'->>'status'='closed' OR view->>'eventStatus' NOT IN('draft','active') THEN state:='closed';available:=false;
   ELSIF view->'session'->>'status'='paused' THEN state:='paused';available:=false;
   ELSIF view->>'scoringAvailable'='true' AND EXISTS(SELECT 1 FROM jsonb_array_elements(view->'criteria') c WHERE c->>'open'='true') AND EXISTS(SELECT 1 FROM jsonb_array_elements(view->'contestants') e WHERE e->>'open'='true') THEN state:='open';available:=true;
   ELSE state:='waiting';available:=false;END IF;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN state:='waiting';available:=false;
  END;
  result:=result||jsonb_build_array(item||jsonb_build_object('eventId',p_event,'state',state,'scoringAvailable',available,'reviewer',false));
 END LOOP;
 IF p_reviewers THEN
  FOR item IN SELECT value FROM jsonb_array_elements(competition_child_reviewer_choices(p_event,p_actor)) LOOP
   result:=result||jsonb_build_array(item||jsonb_build_object('eventId',p_event,'state','review','scoringAvailable',false,'reviewer',true));
  END LOOP;
 END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION competition_remove_native_draft_entry(p_event uuid,p_competition uuid,p_actor uuid,p_entry uuid,p_setup bigint,p_input bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; removed uuid;
BEGIN
 c:=competition_native_authority(p_event,p_competition,p_actor,true);
 IF c.setup_revision IS DISTINCT FROM p_setup OR c.input_revision IS DISTINCT FROM p_input THEN RAISE EXCEPTION 'CHILD_REVISION_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM competition_child_sessions WHERE competition_id=c.id) THEN RAISE EXCEPTION 'SCORING_HISTORY_FORBIDDEN'; END IF;
 IF EXISTS(SELECT 1 FROM competition_child_rounds r WHERE r.competition_id=c.id AND r.definition->'entryIds' ? p_entry::text) THEN RAISE EXCEPTION 'REMOVE_FROM_PLANNED_ROSTER_FIRST'; END IF;
 DELETE FROM competition_entries WHERE id=p_entry AND competition_id=c.id AND event_id=p_event RETURNING id INTO removed;
 SELECT * INTO c FROM competitions WHERE id=c.id;
 RETURN jsonb_build_object('removed',removed IS NOT NULL,'setupRevision',c.setup_revision,'inputRevision',c.input_revision);
END $$;
REVOKE ALL ON FUNCTION competition_child_judge_navigation(uuid,uuid,boolean),competition_remove_native_draft_entry(uuid,uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION competition_child_judge_navigation(uuid,uuid,boolean),competition_remove_native_draft_entry(uuid,uuid,uuid,uuid,bigint,bigint) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
