BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN
 IF to_regprocedure('public.competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'MIGRATION_124_REQUIRED';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.competition_child_official_calculate(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_digest text,p_input jsonb,p_output jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; c competitions; calc competition_child_calculations; expected integer; deductions_enabled boolean;
BEGIN
 c:=competition_native_authority(p_event,p_competition,p_actor,false);
 PERFORM 1 FROM competition_child_sessions WHERE competition_id=c.id FOR UPDATE;
 state:=competition_child_tabulation_snapshot(p_event,c.id,p_actor,p_round,false);
 deductions_enabled:=public.competition_child_native_deductions_enabled(state->'rules'->'configuration_snapshot',p_round);
 IF state->'complete' IS DISTINCT FROM 'true'::jsonb OR state->'session'->>'status' IS NULL OR state->'session'->>'status' NOT IN ('active','closed') OR deductions_enabled AND state->'deductionsResolved' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'ACTIVE_COMPLETE_RESOLVED_SOURCES_REQUIRED'; END IF;
 IF state->'rules'->'configuration_snapshot'->'scoringConfig'->>'calculationMethod'='manual' AND state->'session'->>'status' IS DISTINCT FROM 'closed' THEN RAISE EXCEPTION 'CLOSED_MANUAL_DECISION_REQUIRED'; END IF;
 IF state->>'sourceDigest' IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'STALE_CALCULATION_INPUTS'; END IF;
 SELECT * INTO calc FROM competition_child_calculations
  WHERE competition_id=c.id AND round_id IS NOT DISTINCT FROM p_round AND source_digest=p_digest
  ORDER BY version DESC LIMIT 1;
 IF calc.id IS NOT NULL THEN RETURN jsonb_build_object('calculationId',calc.id,'version',calc.version,'reused',true); END IF;
 IF state->'calculation'->'finalized'='true'::jsonb THEN RAISE EXCEPTION 'CURRENT_CALCULATION_ALREADY_FINALIZED'; END IF;
 expected:=jsonb_array_length(state->'session'->'entry_ids');
 IF p_input->'rules'->>'id' IS DISTINCT FROM c.official_child_rules_id::text OR p_output->'ready' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_output->'results') IS DISTINCT FROM 'array' OR jsonb_array_length(p_output->'results')<>expected OR (SELECT count(DISTINCT r->>'contestantId') FROM jsonb_array_elements(p_output->'results') r)<>expected OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_output->'results') r WHERE NOT state->'session'->'entry_ids' ? (r->>'contestantId')) THEN RAISE EXCEPTION 'INVALID_OFFICIAL_ENGINE_OUTPUT'; END IF;
 IF state->'rules'->'configuration_snapshot'->'scoringConfig'->>'calculationMethod'='manual' AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_output->'results') r WHERE r->'manual' IS DISTINCT FROM 'true'::jsonb OR r->>'finalScore' IS NOT NULL OR (r->>'rank')::numeric<1 OR (r->>'rank')::numeric<>trunc((r->>'rank')::numeric)) THEN RAISE EXCEPTION 'EXPLICIT_MANUAL_PLACEMENTS_REQUIRED'; END IF;
 INSERT INTO competition_child_calculations(event_id,competition_id,round_id,session_id,rules_version,source_digest,source_snapshot,input_snapshot,output_snapshot,version,created_by)
 VALUES(p_event,c.id,p_round,(state->'session'->>'id')::uuid,c.official_child_rules_id,p_digest,state-'calculation',p_input,p_output,coalesce((SELECT max(version)+1 FROM competition_child_calculations WHERE competition_id=c.id),1),p_actor) RETURNING * INTO calc;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details)
 VALUES(p_actor,'competition.tabulation.calculated','competition_child_calculations',calc.id,
  jsonb_build_object('eventId',p_event,'competitionId',c.id,'roundId',p_round,'version',calc.version,'sourceDigest',p_digest));
 RETURN jsonb_build_object('calculationId',calc.id,'version',calc.version,'reused',false);
END $$;

CREATE OR REPLACE FUNCTION public.competition_save_auto_calculation(p_event uuid,p_actor uuid,p_round uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing competition_result_calculations; saved competition_result_calculations; digest text; revision bigint; rules uuid;
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM events e JOIN organizations o ON o.id=e.organization_id
  WHERE e.id=p_event AND o.organizer_id=p_actor
 ) THEN RAISE EXCEPTION 'COMPETITION_OWNER_REQUIRED'; END IF;
 digest:=p_payload->>'source_digest';
 revision:=(p_payload->>'source_input_revision')::bigint;
 rules:=(p_payload->>'rules_version')::uuid;
 IF p_payload->'configuration_snapshot'->>'method'='manual'
  OR digest IS NULL OR digest!~'^[a-f0-9]{64}$' OR revision IS NULL OR rules IS NULL
  OR p_payload->>'status'<>'ready_for_verification'
  OR jsonb_typeof(p_payload->'result_snapshot') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'INVALID_AUTOMATIC_CALCULATION'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  p_event::text||':'||coalesce(p_round::text,'single')||':'||rules::text||':'||digest||':'||revision::text,0
 ));
 SELECT * INTO existing FROM competition_result_calculations
  WHERE event_id=p_event AND round_id IS NOT DISTINCT FROM p_round
    AND rules_version=rules AND source_digest=digest AND source_input_revision=revision
    AND configuration_snapshot->>'method'<>'manual'
  ORDER BY created_at DESC LIMIT 1;
 IF existing.id IS NOT NULL THEN RETURN to_jsonb(existing)||jsonb_build_object('reused',true); END IF;
 INSERT INTO competition_result_calculations(
  event_id,session_id,round_id,status,rules_version,source_versions,source_digest,
  source_input_revision,configuration_snapshot,result_snapshot,created_by
 ) VALUES(
  p_event,(p_payload->>'session_id')::uuid,p_round,p_payload->>'status',rules,
  p_payload->'source_versions',digest,revision,p_payload->'configuration_snapshot',
  p_payload->'result_snapshot',p_actor
 ) RETURNING * INTO saved;
 RETURN to_jsonb(saved)||jsonb_build_object('reused',false);
END $$;

REVOKE ALL ON FUNCTION public.competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.competition_save_auto_calculation(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.competition_save_auto_calculation(uuid,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
