-- Complete the organizer-only finalization flow introduced in migration 133.
-- Verification remains real, optional metadata; publication still requires
-- current, complete, finalized results with resolved deductions and closed scoring.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN
 IF to_regprocedure('competition_child_tabulation_snapshot_v133(uuid,uuid,uuid,uuid,boolean)') IS NULL
  OR to_regprocedure('competition_child_publication_action_v129(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL
  OR to_regprocedure('competition_native_round_completion_ready(uuid,uuid,uuid,uuid,boolean)') IS NULL
 THEN RAISE EXCEPTION 'MIGRATIONS_129_AND_133_REQUIRED'; END IF;
END $$;

-- Retain the outer publication wrapper, which reconciles event completion.
CREATE OR REPLACE FUNCTION competition_child_publication_action_v129(
 p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_action text,p_body jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE last_version competition_child_publications; prior_request competition_child_publications; state jsonb; publication competition_child_publications; payload jsonb; request uuid;
BEGIN
 PERFORM competition_native_authority(p_event,p_competition,p_actor,false);
 IF EXISTS(SELECT 1 FROM events WHERE id=p_event AND status::text IN('archived','cancelled')) THEN RAISE EXCEPTION 'PUBLICATION_EVENT_CLOSED'; END IF;
 IF p_action NOT IN('publish','replace','withdraw') OR p_body->'acknowledged' IS DISTINCT FROM 'true'::jsonb OR length(btrim(coalesce(p_body->>'reason','')))<5 THEN RAISE EXCEPTION 'EXPLICIT_PUBLICATION_ACTION_REASON_REQUIRED'; END IF;
 request:=(p_body->>'requestId')::uuid;
 IF request IS NULL THEN RAISE EXCEPTION 'PUBLICATION_REQUEST_REQUIRED'; END IF;
 SELECT * INTO prior_request FROM competition_child_publications WHERE competition_id=p_competition AND actor_id=p_actor AND request_id=request;
 IF prior_request.id IS NOT NULL THEN
  IF prior_request.request_payload IS DISTINCT FROM p_body OR prior_request.action<>p_action OR prior_request.round_id IS DISTINCT FROM p_round THEN RAISE EXCEPTION 'PUBLICATION_REQUEST_CONFLICT'; END IF;
  RETURN jsonb_build_object('publicationId',prior_request.id,'publicationVersion',prior_request.version,'action',prior_request.action);
 END IF;
 SELECT * INTO last_version FROM competition_child_publications WHERE competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round ORDER BY version DESC LIMIT 1;
 IF (p_body->>'expectedPublicationVersion')::integer IS DISTINCT FROM coalesce(last_version.version,0) THEN RAISE EXCEPTION 'PUBLICATION_VERSION_CONFLICT'; END IF;
 IF p_action='withdraw' THEN
  IF last_version.id IS NULL OR last_version.action='withdraw' THEN RAISE EXCEPTION 'NO_ACTIVE_PUBLICATION'; END IF;
 ELSE
  IF p_action='replace' AND (last_version.id IS NULL OR last_version.action='withdraw') OR p_action='publish' AND last_version.action IN('publish','replace') THEN RAISE EXCEPTION 'INVALID_PUBLICATION_TRANSITION'; END IF;
  state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,p_round,false);
  IF state->'complete' IS DISTINCT FROM 'true'::jsonb
   OR state->'session'->>'status' IS DISTINCT FROM 'closed'
   OR state->'deductionsResolved' IS DISTINCT FROM 'true'::jsonb
   OR state->'calculation'->'finalized' IS DISTINCT FROM 'true'::jsonb
   OR state->'calculation'->>'id' IS DISTINCT FROM p_body->>'calculationId'
   OR state->>'sourceDigest' IS DISTINCT FROM p_body->>'sourceDigest'
   OR state->'calculation'->>'source_digest' IS DISTINCT FROM state->>'sourceDigest'
  THEN RAISE EXCEPTION 'CURRENT_COMPLETE_FINALIZED_PUBLICATION_REQUIRED'; END IF;
  payload:=competition_child_public_projection((p_body->>'calculationId')::uuid);
 END IF;
 INSERT INTO competition_child_publications(event_id,competition_id,round_id,version,previous_id,action,calculation_id,public_snapshot,actor_id,reason,request_id,request_payload)
 VALUES(p_event,p_competition,p_round,coalesce(last_version.version,0)+1,last_version.id,p_action,CASE WHEN p_action='withdraw' THEN last_version.calculation_id ELSE (p_body->>'calculationId')::uuid END,payload,p_actor,p_body->>'reason',request,p_body) RETURNING * INTO publication;
 RETURN jsonb_build_object('publicationId',publication.id,'publicationVersion',publication.version,'action',publication.action);
END $$;

CREATE OR REPLACE FUNCTION competition_native_round_completion_ready(
 p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_require_publication boolean
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; v_calculation uuid; v_publication text; v_publication_calculation uuid;
BEGIN
 state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,p_round,false);
 IF state->'complete' IS DISTINCT FROM 'true'::jsonb
  OR state->'session'->>'status' IS DISTINCT FROM 'closed'
  OR state->'deductionsResolved' IS DISTINCT FROM 'true'::jsonb
  OR state->'calculation'->'finalized' IS DISTINCT FROM 'true'::jsonb
  OR state->'calculation'->>'id' IS NULL
  OR state->'calculation'->>'source_digest' IS DISTINCT FROM state->>'sourceDigest'
 THEN RETURN false; END IF;
 v_calculation:=(state->'calculation'->>'id')::uuid;
 IF p_require_publication THEN
  SELECT action,calculation_id INTO v_publication,v_publication_calculation
  FROM competition_child_publications
  WHERE event_id=p_event AND competition_id=p_competition
   AND round_id IS NOT DISTINCT FROM p_round
  ORDER BY version DESC LIMIT 1;
  IF v_publication IS NULL OR v_publication NOT IN('publish','replace')
   OR v_publication_calculation IS DISTINCT FROM v_calculation THEN RETURN false; END IF;
 END IF;
 RETURN true;
END $$;

REVOKE ALL ON FUNCTION competition_child_publication_action_v129(uuid,uuid,uuid,uuid,text,jsonb),
 competition_native_round_completion_ready(uuid,uuid,uuid,uuid,boolean)
 FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
