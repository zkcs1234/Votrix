-- Calculate first; appoint and verify an independent reviewer at finalization.
-- Scoring lineage, configured deduction resolution, immutable calculations,
-- independent verification, and publication guards remain authoritative.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN
 IF to_regprocedure('public.competition_child_native_deductions_enabled(jsonb,uuid)') IS NULL THEN
  RAISE EXCEPTION 'MIGRATION_123_REQUIRED';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.competition_child_tabulation_snapshot(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_reviewer boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; c competitions; deductions jsonb; policy competition_child_review_policies; calculation competition_child_calculations; digest text; evidence jsonb; pending boolean; deductions_enabled boolean; scopes jsonb; all_deductions jsonb; previous jsonb; previous_state jsonb; target jsonb; qualification jsonb; policy_state jsonb; entries jsonb; complete boolean;
BEGIN
 IF p_reviewer THEN PERFORM competition_child_reviewer_authority(p_event,p_competition,p_actor); ELSE PERFORM competition_native_foundation(p_event,p_competition,p_actor); END IF;
 SELECT * INTO c FROM competitions WHERE id=p_competition AND event_id=p_event;
 state:=competition_child_current_sources(p_event,p_competition,p_round);
 IF state->'rules'->'configuration_snapshot'->>'structure'='single' AND p_round IS NOT NULL OR state->'rules'->'configuration_snapshot'->>'structure'='multiple' AND NOT EXISTS(SELECT 1 FROM competition_child_rounds WHERE id=p_round AND competition_id=p_competition) THEN RAISE EXCEPTION 'SCOPING_FORBIDDEN'; END IF;
 SELECT * INTO policy FROM competition_child_review_policies WHERE competition_id=p_competition;
 policy_state:=CASE WHEN policy.competition_id IS NULL THEN NULL ELSE to_jsonb(policy)||jsonb_build_object('active',EXISTS(SELECT 1 FROM event_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.id=policy.participant_id AND ep.event_id=p_event AND ep.user_id=policy.reviewer_id AND ep.is_active AND ep.judge_role::text='score_reviewer' AND ep.participant_type::text='COMPETITION_JUDGE' AND u.account_status::text='active' AND u.role::text IN('participant','voter'))) END;
 SELECT coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('status',coalesce(review.action,'pending'),'scope_round_id',sess.round_id,'review',to_jsonb(review)) ORDER BY d.id),'[]') INTO deductions FROM competition_child_deduction_decisions d JOIN competition_child_sessions sess ON sess.id=d.session_id LEFT JOIN LATERAL(SELECT * FROM competition_child_deduction_reviews WHERE decision_id=d.id ORDER BY version DESC LIMIT 1) review ON true WHERE sess.competition_id=p_competition AND sess.round_id IS NOT DISTINCT FROM p_round;
 deductions_enabled:=public.competition_child_native_deductions_enabled(state->'rules'->'configuration_snapshot',p_round);
 pending:=deductions_enabled AND EXISTS(SELECT 1 FROM jsonb_array_elements(deductions) d WHERE d->>'status'='pending');
 complete:=(state->>'complete')::boolean;scopes:=jsonb_build_array(jsonb_build_object('session',state->'session','submissions',state->'submissions'));all_deductions:=deductions;
 SELECT value INTO target FROM jsonb_array_elements(state->'rules'->'configuration_snapshot'->'rounds') WHERE value->>'id'=p_round::text;
 IF (target->>'displayOrder')::integer>0 THEN
  qualification:=competition_child_qualification_state(p_event,p_competition,p_round);
  complete:=complete AND coalesce((qualification->>'current')::boolean,false);
 END IF;
 IF coalesce(target->>'progression','back_to_zero') IN('carry_forward','weighted') AND ((target->>'progression')='carry_forward' OR (target->>'displayOrder')::integer=jsonb_array_length(state->'rules'->'configuration_snapshot'->'rounds')-1) THEN
  FOR previous IN SELECT value FROM jsonb_array_elements(state->'rules'->'configuration_snapshot'->'rounds') WHERE (value->>'displayOrder')::integer<(target->>'displayOrder')::integer ORDER BY (value->>'displayOrder')::integer LOOP
   previous_state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,(previous->>'id')::uuid,p_reviewer);
   complete:=complete AND previous_state->'complete'='true'::jsonb AND previous_state->'calculation'->'finalized'='true'::jsonb;
   pending:=pending OR previous_state->'deductionsResolved' IS DISTINCT FROM 'true'::jsonb;
   scopes:=scopes||jsonb_build_array(jsonb_build_object('session',previous_state->'session','submissions',previous_state->'submissions','calculationId',previous_state->'calculation'->>'id','sourceDigest',previous_state->>'sourceDigest'));
   all_deductions:=all_deductions||previous_state->'deductions';
  END LOOP;
 END IF;
 evidence:=jsonb_build_object('rulesVersion',c.official_child_rules_id,'setupRevision',c.setup_revision,'inputRevision',c.input_revision,'session',state->'session','submissionIds',(SELECT coalesce(jsonb_agg(s->>'id' ORDER BY s->>'id'),'[]') FROM jsonb_array_elements(state->'submissions') s),'deductions',all_deductions,'policy',policy_state,'qualification',qualification,'scopeSources',scopes);
 -- Reviewer assignment is audit metadata, not an input to score arithmetic.
 -- Keep it in evidence while hashing only the scoring sources.
 digest:=encode(sha256(convert_to((evidence-'policy')::text,'UTF8')),'hex');
 SELECT * INTO calculation FROM competition_child_calculations WHERE competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round ORDER BY version DESC LIMIT 1;
 -- Existing current calculations retain their original digest and immutable
 -- snapshots. This also preserves downstream qualification/publication links.
 IF calculation.source_digest=encode(sha256(convert_to(evidence::text,'UTF8')),'hex') THEN
  digest:=calculation.source_digest;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',m.name,'contestantNumber',e.entry_number,'photo',to_jsonb(m)->>'photo') ORDER BY e.entry_number),'[]') INTO entries FROM competition_entries e JOIN competition_contestants m ON m.id=e.contestant_id WHERE e.competition_id=p_competition AND state->'session'->'entry_ids' ? e.id::text;
 RETURN jsonb_build_object('eventId',p_event,'competitionId',p_competition,'roundId',p_round,'viewerId',p_actor,'setupRevision',c.setup_revision,'inputRevision',c.input_revision,'complete',coalesce(complete,false),'progress',state->'progress','session',state->'session','reviewPolicy',policy_state,'deductions',CASE WHEN complete AND deductions_enabled THEN deductions ELSE '[]'::jsonb END,'deductionsResolved',NOT pending,'sourceDigest',digest,'calculationStale',calculation.id IS NOT NULL AND calculation.source_digest IS DISTINCT FROM digest,
  'reviewerOptions',CASE WHEN p_reviewer THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('participantId',ep.id,'judgeId',ep.user_id,'name',coalesce(nullif(btrim(concat_ws(' ',to_jsonb(u)->>'first_name',to_jsonb(u)->>'last_name')),''),to_jsonb(u)->>'email',u.id::text)) ORDER BY ep.id) FROM event_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.event_id=p_event AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.is_active AND ep.judge_role::text='score_reviewer' AND ep.user_id<>p_actor AND u.account_status::text='active' AND u.role::text IN('participant','voter')),'[]') END,
  'entries',CASE WHEN complete THEN entries ELSE '[]'::jsonb END,'scopes',CASE WHEN complete THEN scopes ELSE '[]'::jsonb END,'allDeductions',CASE WHEN complete THEN all_deductions ELSE '[]'::jsonb END,'qualificationCurrent',qualification->'current',
  'evidence',CASE WHEN complete THEN evidence ELSE NULL END,'rules',CASE WHEN complete THEN state->'rules' ELSE NULL END,'submissions',CASE WHEN complete THEN state->'submissions' ELSE '[]'::jsonb END,
  'calculation',CASE WHEN complete AND NOT pending AND state->'session'->>'status'='closed' AND (coalesce(policy_state->'active'='true'::jsonb,false) OR NOT EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calculation.id)) AND calculation.source_digest=digest THEN to_jsonb(calculation)||jsonb_build_object('verified',EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calculation.id AND action='verify'),'finalized',EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calculation.id AND action='finalize')) ELSE NULL END);
END $$;

CREATE OR REPLACE FUNCTION public.competition_child_official_calculate(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_digest text,p_input jsonb,p_output jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; c competitions; calc competition_child_calculations; expected integer; deductions_enabled boolean;
BEGIN
 c:=competition_native_authority(p_event,p_competition,p_actor,false);
 PERFORM 1 FROM competition_child_sessions WHERE competition_id=c.id FOR UPDATE;
 state:=competition_child_tabulation_snapshot(p_event,c.id,p_actor,p_round,false);
 deductions_enabled:=public.competition_child_native_deductions_enabled(state->'rules'->'configuration_snapshot',p_round);
 IF state->'complete' IS DISTINCT FROM 'true'::jsonb OR state->'session'->>'status' IS DISTINCT FROM 'closed' OR deductions_enabled AND state->'deductionsResolved' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CLOSED_COMPLETE_RESOLVED_SOURCES_REQUIRED'; END IF;
 IF state->>'sourceDigest' IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'STALE_CALCULATION_INPUTS'; END IF;
 IF state->'calculation'->'finalized'='true'::jsonb THEN RAISE EXCEPTION 'CURRENT_CALCULATION_ALREADY_FINALIZED'; END IF;
 expected:=jsonb_array_length(state->'session'->'entry_ids');
 IF p_input->'rules'->>'id' IS DISTINCT FROM c.official_child_rules_id::text OR p_output->'ready' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_output->'results') IS DISTINCT FROM 'array' OR jsonb_array_length(p_output->'results')<>expected OR (SELECT count(DISTINCT r->>'contestantId') FROM jsonb_array_elements(p_output->'results') r)<>expected OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_output->'results') r WHERE NOT state->'session'->'entry_ids' ? (r->>'contestantId')) THEN RAISE EXCEPTION 'INVALID_OFFICIAL_ENGINE_OUTPUT'; END IF;
 IF state->'rules'->'configuration_snapshot'->'scoringConfig'->>'calculationMethod'='manual' AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_output->'results') r WHERE r->'manual' IS DISTINCT FROM 'true'::jsonb OR r->>'finalScore' IS NOT NULL OR (r->>'rank')::numeric<1 OR (r->>'rank')::numeric<>trunc((r->>'rank')::numeric)) THEN RAISE EXCEPTION 'EXPLICIT_MANUAL_PLACEMENTS_REQUIRED'; END IF;
 INSERT INTO competition_child_calculations(event_id,competition_id,round_id,session_id,rules_version,source_digest,source_snapshot,input_snapshot,output_snapshot,version,created_by)
 VALUES(p_event,c.id,p_round,(state->'session'->>'id')::uuid,c.official_child_rules_id,p_digest,state-'calculation',p_input,p_output,coalesce((SELECT max(version)+1 FROM competition_child_calculations WHERE competition_id=c.id),1),p_actor) RETURNING * INTO calc;
 RETURN jsonb_build_object('calculationId',calc.id,'version',calc.version);
END $$;

REVOKE ALL ON FUNCTION public.competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean),public.competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean),public.competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
