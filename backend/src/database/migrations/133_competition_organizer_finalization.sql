-- Organizers may finalize a current calculation without independent reviewer
-- assignment or verification. Reviewer verification remains optional metadata.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN
 IF to_regprocedure('competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean)') IS NULL
 OR to_regprocedure('competition_child_official_transition(uuid,uuid,uuid,uuid,text,text)') IS NULL
 THEN RAISE EXCEPTION 'MIGRATION_131_REQUIRED'; END IF;
 IF to_regprocedure('competition_child_tabulation_snapshot_v133(uuid,uuid,uuid,uuid,boolean)') IS NULL THEN
  ALTER FUNCTION competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean)
   RENAME TO competition_child_tabulation_snapshot_v133;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION competition_child_tabulation_snapshot(
 p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_reviewer boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; calculation competition_child_calculations; qualification competition_child_qualifications; qualification_current boolean;
BEGIN
 state:=competition_child_tabulation_snapshot_v133(p_event,p_competition,p_actor,p_round,p_reviewer);
 IF state->'complete'='true'::jsonb
  AND state->'session'->>'status'='closed'
  AND state->'deductionsResolved'='true'::jsonb
  AND state->>'calculationStale' IS DISTINCT FROM 'true'
 THEN
  SELECT * INTO calculation
  FROM competition_child_calculations
  WHERE event_id=p_event AND competition_id=p_competition
   AND round_id IS NOT DISTINCT FROM p_round
   AND source_digest=state->>'sourceDigest'
  ORDER BY version DESC LIMIT 1;
 END IF;
 IF calculation.id IS NULL THEN
  RETURN state;
 END IF;
 state:=state||jsonb_build_object(
  'calculation',to_jsonb(calculation)||jsonb_build_object(
   'verified',EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calculation.id AND action='verify'),
   'finalized',EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calculation.id AND action='finalize')
  )
 );
 IF state->'advancement' IS NOT NULL AND state->'advancement' IS DISTINCT FROM 'null'::jsonb THEN
  SELECT * INTO qualification
  FROM competition_child_qualifications
  WHERE event_id=p_event AND competition_id=p_competition
   AND from_round=p_round AND to_round=(state->'advancement'->>'toRoundId')::uuid
  ORDER BY version DESC LIMIT 1;
  qualification_current:=coalesce(
   qualification.id IS NOT NULL
   AND state->'complete'='true'::jsonb
   AND state->'calculation'->'finalized'='true'::jsonb
   AND qualification.calculation_id::text=state->'calculation'->>'id'
   AND qualification.source_digest=state->>'sourceDigest',
   false
  );
  state:=state||jsonb_build_object(
   'advancement',state->'advancement'||jsonb_build_object(
    'qualificationCurrent',qualification_current,
    'qualificationVersion',CASE WHEN qualification_current THEN qualification.version ELSE NULL END,
    'qualifiedEntryIds',CASE WHEN qualification_current THEN qualification.qualifier_ids ELSE '[]'::jsonb END
   )
  );
 END IF;
 RETURN state;
END $$;

CREATE OR REPLACE FUNCTION competition_child_official_transition(
 p_event uuid,p_competition uuid,p_actor uuid,p_calculation uuid,p_action text,p_reason text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE calculation competition_child_calculations; state jsonb;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 PERFORM 1 FROM competitions WHERE id=p_competition AND event_id=p_event FOR UPDATE;
 SELECT * INTO calculation FROM competition_child_calculations
 WHERE id=p_calculation AND event_id=p_event AND competition_id=p_competition;
 IF calculation.id IS NULL THEN RAISE EXCEPTION 'CALCULATION_FORBIDDEN'; END IF;
 IF p_action='verify' THEN
  PERFORM competition_child_reviewer_authority(p_event,p_competition,p_actor);
  IF p_actor=calculation.created_by THEN RAISE EXCEPTION 'INDEPENDENT_APPROVAL_REQUIRED'; END IF;
 ELSIF p_action='finalize' THEN
  PERFORM competition_native_foundation(p_event,p_competition,p_actor);
 ELSE
  RAISE EXCEPTION 'INVALID_OFFICIAL_TRANSITION';
 END IF;
 state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,calculation.round_id,p_action='verify');
 IF state->'calculation'->>'id' IS DISTINCT FROM calculation.id::text
  OR state->>'sourceDigest' IS DISTINCT FROM calculation.source_digest
  OR state->'complete' IS DISTINCT FROM 'true'::jsonb
  OR state->'session'->>'status' IS DISTINCT FROM 'closed'
  OR state->'deductionsResolved' IS DISTINCT FROM 'true'::jsonb
 THEN RAISE EXCEPTION 'STALE_OR_INCOMPLETE_CALCULATION'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'EXPLICIT_REVIEW_REASON_REQUIRED'; END IF;
 IF p_action='finalize' AND EXISTS(
  SELECT 1 FROM competition_child_calculation_transitions
  WHERE calculation_id=calculation.id AND action='finalize'
 ) THEN RAISE EXCEPTION 'CURRENT_CALCULATION_ALREADY_FINALIZED'; END IF;
 INSERT INTO competition_child_calculation_transitions(calculation_id,action,actor_id,reason)
 VALUES(calculation.id,p_action,p_actor,p_reason);
 RETURN jsonb_build_object('calculationId',calculation.id,'action',p_action);
END $$;

REVOKE ALL ON FUNCTION competition_child_tabulation_snapshot_v133(uuid,uuid,uuid,uuid,boolean),
 competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean),
 competition_child_official_transition(uuid,uuid,uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean),
 competition_child_official_transition(uuid,uuid,uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
