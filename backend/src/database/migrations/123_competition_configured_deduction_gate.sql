BEGIN;

DO $$
BEGIN
 IF to_regprocedure('public.competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean)') IS NULL
 OR to_regprocedure('public.competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb)') IS NULL
 OR to_regprocedure('public.competition_child_deduction_action(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL
 THEN
   RAISE EXCEPTION 'MIGRATION_106_REQUIRED';
 END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.competition_child_native_deductions_enabled(p_configuration jsonb,p_round uuid)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE target jsonb; configured_round jsonb; configured_deduction jsonb; criterion jsonb; scope_round_id uuid; included_round_ids uuid[]:='{}'; final_round_id uuid; structure text;
BEGIN
 structure:=coalesce(p_configuration->>'structure','single');
 SELECT value INTO target
 FROM jsonb_array_elements(coalesce(p_configuration->'rounds','[]'::jsonb))
 WHERE value->>'id'=p_round::text;
 IF p_round IS NOT NULL AND target IS NULL THEN RETURN false; END IF;
 IF target IS NOT NULL THEN
  IF coalesce(target->>'progression','back_to_zero') IN('carry_forward','weighted')
     AND (target->>'progression'='carry_forward' OR (target->>'displayOrder')::integer=(
       SELECT count(*)-1 FROM jsonb_array_elements(coalesce(p_configuration->'rounds','[]'::jsonb))
     )) THEN
   FOR configured_round IN
    SELECT value FROM jsonb_array_elements(coalesce(p_configuration->'rounds','[]'::jsonb))
    WHERE (value->>'displayOrder')::integer<=(target->>'displayOrder')::integer
   LOOP included_round_ids:=array_append(included_round_ids,(configured_round->>'id')::uuid); END LOOP;
  ELSE included_round_ids:=array_append(included_round_ids,p_round); END IF;
 END IF;
 SELECT (value->>'id')::uuid INTO final_round_id
 FROM jsonb_array_elements(coalesce(p_configuration->'rounds','[]'::jsonb))
 ORDER BY (value->>'displayOrder')::integer DESC LIMIT 1;
 FOR configured_deduction IN
  SELECT value FROM jsonb_array_elements(coalesce(p_configuration->'scoringConfig'->'deductionRules','[]'::jsonb))
 LOOP
  criterion:=NULL;
  IF nullif(configured_deduction->>'criteriaId','') IS NOT NULL THEN
   SELECT value INTO criterion
   FROM jsonb_array_elements(coalesce(p_configuration->'criteria','[]'::jsonb))
   WHERE value->>'id'=configured_deduction->>'criteriaId';
   IF structure='multiple' AND nullif(criterion->>'roundId','') IS NULL THEN CONTINUE; END IF;
  END IF;
  scope_round_id:=coalesce(nullif(configured_deduction->>'roundId','')::uuid,nullif(criterion->>'roundId','')::uuid);
  IF scope_round_id IS NOT NULL AND scope_round_id=ANY(included_round_ids) THEN RETURN true; END IF;
  IF scope_round_id IS NULL AND (
    (p_round IS NULL AND structure<>'multiple')
    OR final_round_id=ANY(included_round_ids)
  ) THEN RETURN true; END IF;
 END LOOP;
 RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.competition_child_current_sources(p_event uuid,p_competition uuid,p_round uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s competition_child_sessions; v competition_child_rule_versions; panel jsonb; progress jsonb:='[]'; submitted jsonb:='[]'; j uuid; sub competition_child_submissions; ok boolean; assignment_ok boolean; ready boolean:=true; major jsonb; target jsonb; e text; cells integer; item jsonb; issues jsonb;
BEGIN
 SELECT * INTO s FROM competition_child_sessions WHERE competition_id=p_competition AND event_id=p_event AND round_id IS NOT DISTINCT FROM p_round;
 SELECT rv.* INTO v FROM competition_child_rule_versions rv JOIN competitions c ON c.official_child_rules_id=rv.id WHERE c.id=p_competition AND c.event_id=p_event AND c.origin='native' AND rv.setup_revision=c.setup_revision AND rv.input_revision=c.input_revision;
 IF v.id IS NULL THEN RAISE EXCEPTION 'CURRENT_FROZEN_RULES_REQUIRED'; END IF;
 SELECT coalesce(jsonb_agg(DISTINCT a->>'judgeId'),'[]') INTO panel FROM jsonb_array_elements(v.assignment_snapshot) a WHERE a->>'round_id' IS NULL OR a->>'round_id'=p_round::text;
 IF s.id IS NULL OR jsonb_array_length(panel)=0 THEN ready:=false; END IF;
 FOR j IN SELECT value::uuid FROM jsonb_array_elements_text(panel) LOOP
  SELECT payload.* INTO sub FROM competition_child_submission_heads h JOIN competition_child_submissions payload ON payload.id=h.submission_id AND payload.session_id=h.session_id AND payload.judge_id=h.judge_id WHERE h.session_id=s.id AND h.judge_id=j;
  assignment_ok:=EXISTS(SELECT 1 FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id JOIN users u ON u.id=ep.user_id WHERE a.competition_id=p_competition AND (a.round_id IS NULL OR a.round_id=p_round) AND ep.user_id=j AND ep.event_id=p_event AND ep.is_active AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.judge_role::text IN('judge','head_judge') AND u.account_status::text='active' AND u.role::text IN('participant','voter'));
  issues:='[]'::jsonb;
  IF sub.id IS NULL THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','missing_submission','message','No current submitted sheet exists for this judge.')); END IF;
  IF sub.id IS NOT NULL AND sub.rules_version IS DISTINCT FROM v.id THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','stale_rules','message','The submission uses a different frozen rule revision.')); END IF;
  IF NOT assignment_ok THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','unauthorized','message','The submitter is not an active eligible judge assigned to this round.')); END IF;
  ok:=sub.id IS NOT NULL AND sub.rules_version=v.id AND assignment_ok;
  cells:=0;
  IF ok THEN
   FOR e IN SELECT value FROM jsonb_array_elements_text(s.entry_ids) LOOP
    FOR major IN SELECT value FROM jsonb_array_elements(v.configuration_snapshot->'criteria') WHERE (value->>'roundId')::uuid IS NOT DISTINCT FROM p_round LOOP
     cells:=cells+1;
     SELECT value INTO item FROM jsonb_array_elements(sub.sources) WHERE value->>'entry_id'=e AND value->>'criterion_id'=major->>'id';
     IF item IS NULL THEN
      ok:=false;
      issues:=issues||jsonb_build_array(jsonb_build_object('code','missing_criterion','entryId',e,'criterionId',major->>'id','message','A required criterion score is missing.'));
     ELSIF item->>'session_id' IS DISTINCT FROM s.id::text OR item->>'judge_id' IS DISTINCT FROM j::text OR item->'locked' IS DISTINCT FROM 'true'::jsonb OR NOT EXISTS(SELECT 1 FROM competition_child_score_drafts d WHERE d.session_id=s.id AND d.judge_id=j AND d.entry_id=e::uuid AND d.criterion_id=(major->>'id')::uuid AND d.locked AND d.revision=(item->>'revision')::bigint AND d.scores=item->'scores') THEN
      ok:=false;
      issues:=issues||jsonb_build_array(jsonb_build_object('code','invalid_lineage','entryId',e,'criterionId',major->>'id','message','The submitted score source does not match the current locked draft.'));
     END IF;
     FOR target IN SELECT value FROM jsonb_array_elements(
      CASE
       WHEN v.configuration_snapshot->'scoringConfig'->>'criterionBasis'='points'
        OR jsonb_array_length(coalesce(major->'minorCriteria','[]'))=0
       THEN jsonb_build_array(major)
       ELSE major->'minorCriteria'
      END
     ) LOOP
      IF jsonb_typeof(item->'scores'->(target->>'id')) IS DISTINCT FROM 'number' THEN
       ok:=false;
       issues:=issues||jsonb_build_array(jsonb_build_object('code','missing_score','entryId',e,'criterionId',major->>'id','targetId',target->>'id','message','A required scoring target has no numeric score.'));
      ELSIF (item->'scores'->>(target->>'id'))::numeric NOT BETWEEN (target->>'minScore')::numeric AND (target->>'maxScore')::numeric THEN
       ok:=false;
       issues:=issues||jsonb_build_array(jsonb_build_object('code','invalid_score','entryId',e,'criterionId',major->>'id','targetId',target->>'id','message','A score is outside the frozen score range.'));
      END IF;
     END LOOP;
    END LOOP;
   END LOOP;
   IF cells=0 OR jsonb_array_length(sub.sources)<>cells THEN
    ok:=false;
    issues:=issues||jsonb_build_array(jsonb_build_object('code','unexpected_source_count','message','The submitted sheet has an unexpected number of score sources or no active criteria.'));
   END IF;
  END IF;
  progress:=progress||jsonb_build_array(jsonb_build_object(
   'judgeId',j,'submitted',coalesce(ok,false),
   'submissionState',CASE WHEN sub.id IS NULL THEN 'missing' WHEN sub.rules_version IS DISTINCT FROM v.id THEN 'stale_rules' WHEN NOT assignment_ok THEN 'unauthorized' WHEN ok THEN 'complete' ELSE 'incomplete' END,
   'submissionId',CASE WHEN ok THEN sub.id ELSE NULL END,'submittedAt',CASE WHEN ok THEN sub.submitted_at ELSE NULL END,'issues',issues
  ));
  ready:=ready AND coalesce(ok,false);
  IF ok THEN submitted:=submitted||jsonb_build_array(to_jsonb(sub)||jsonb_build_object('round_id',p_round,'entry_ids',s.entry_ids)); END IF;
 END LOOP;
 RETURN jsonb_build_object('complete',ready,'progress',progress,'session',CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END,'rules',to_jsonb(v),'submissions',CASE WHEN ready THEN submitted ELSE '[]'::jsonb END);
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
 digest:=encode(sha256(convert_to(evidence::text,'UTF8')),'hex');
 SELECT * INTO calculation FROM competition_child_calculations WHERE competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round ORDER BY version DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',m.name,'contestantNumber',e.entry_number,'photo',to_jsonb(m)->>'photo') ORDER BY e.entry_number),'[]') INTO entries FROM competition_entries e JOIN competition_contestants m ON m.id=e.contestant_id WHERE e.competition_id=p_competition AND state->'session'->'entry_ids' ? e.id::text;
 RETURN jsonb_build_object('eventId',p_event,'competitionId',p_competition,'roundId',p_round,'viewerId',p_actor,'setupRevision',c.setup_revision,'inputRevision',c.input_revision,'complete',coalesce(complete,false),'progress',state->'progress','session',state->'session','reviewPolicy',policy_state,'deductions',CASE WHEN complete AND deductions_enabled THEN deductions ELSE '[]'::jsonb END,'deductionsResolved',NOT pending,'sourceDigest',digest,'calculationStale',calculation.id IS NOT NULL AND calculation.source_digest IS DISTINCT FROM digest,
  'reviewerOptions',CASE WHEN p_reviewer THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('participantId',ep.id,'judgeId',ep.user_id,'name',coalesce(nullif(btrim(concat_ws(' ',to_jsonb(u)->>'first_name',to_jsonb(u)->>'last_name')),''),to_jsonb(u)->>'email',u.id::text)) ORDER BY ep.id) FROM event_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.event_id=p_event AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.is_active AND ep.judge_role::text='score_reviewer' AND ep.user_id<>p_actor AND u.account_status::text='active' AND u.role::text IN('participant','voter')),'[]') END,
  'entries',CASE WHEN complete THEN entries ELSE '[]'::jsonb END,'scopes',CASE WHEN complete THEN scopes ELSE '[]'::jsonb END,'allDeductions',CASE WHEN complete THEN all_deductions ELSE '[]'::jsonb END,'qualificationCurrent',qualification->'current',
  'evidence',CASE WHEN complete THEN evidence ELSE NULL END,'rules',CASE WHEN complete THEN state->'rules' ELSE NULL END,'submissions',CASE WHEN complete THEN state->'submissions' ELSE '[]'::jsonb END,
  'calculation',CASE WHEN complete AND NOT pending AND state->'session'->>'status'='closed' AND policy_state->'active'='true'::jsonb AND calculation.source_digest=digest THEN to_jsonb(calculation)||jsonb_build_object('verified',EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calculation.id AND action='verify'),'finalized',EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calculation.id AND action='finalize')) ELSE NULL END);
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
 PERFORM competition_child_reviewer_authority(p_event,c.id,(state->'reviewPolicy'->>'reviewer_id')::uuid);
 IF state->'calculation'->'finalized'='true'::jsonb THEN RAISE EXCEPTION 'CURRENT_CALCULATION_ALREADY_FINALIZED'; END IF;
 expected:=jsonb_array_length(state->'session'->'entry_ids');
 IF p_input->'rules'->>'id' IS DISTINCT FROM c.official_child_rules_id::text OR p_output->'ready' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_output->'results') IS DISTINCT FROM 'array' OR jsonb_array_length(p_output->'results')<>expected OR (SELECT count(DISTINCT r->>'contestantId') FROM jsonb_array_elements(p_output->'results') r)<>expected OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_output->'results') r WHERE NOT state->'session'->'entry_ids' ? (r->>'contestantId')) THEN RAISE EXCEPTION 'INVALID_OFFICIAL_ENGINE_OUTPUT'; END IF;
 IF state->'rules'->'configuration_snapshot'->'scoringConfig'->>'calculationMethod'='manual' AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_output->'results') r WHERE r->'manual' IS DISTINCT FROM 'true'::jsonb OR r->>'finalScore' IS NOT NULL OR (r->>'rank')::numeric<1 OR (r->>'rank')::numeric<>trunc((r->>'rank')::numeric)) THEN RAISE EXCEPTION 'EXPLICIT_MANUAL_PLACEMENTS_REQUIRED'; END IF;
 INSERT INTO competition_child_calculations(event_id,competition_id,round_id,session_id,rules_version,source_digest,source_snapshot,input_snapshot,output_snapshot,version,created_by)
 VALUES(p_event,c.id,p_round,(state->'session'->>'id')::uuid,c.official_child_rules_id,p_digest,state-'calculation',p_input,p_output,coalesce((SELECT max(version)+1 FROM competition_child_calculations WHERE competition_id=c.id),1),p_actor) RETURNING * INTO calc;
 RETURN jsonb_build_object('calculationId',calc.id,'version',calc.version);
END $$;

CREATE OR REPLACE FUNCTION public.competition_child_deduction_action(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_action text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s competition_child_sessions; state jsonb; rule jsonb; decision competition_child_deduction_decisions; last_action text; configured_rules jsonb;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;PERFORM 1 FROM competitions WHERE id=p_competition AND event_id=p_event FOR UPDATE;
 IF p_action='propose' THEN PERFORM competition_native_foundation(p_event,p_competition,p_actor); ELSE PERFORM competition_child_reviewer_authority(p_event,p_competition,p_actor); END IF;
 state:=competition_child_current_sources(p_event,p_competition,p_round);
 SELECT * INTO s FROM competition_child_sessions WHERE competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'SCORING_SESSION_REQUIRED'; END IF;
 IF p_action='propose' THEN
  configured_rules:=coalesce(state->'rules'->'configuration_snapshot'->'scoringConfig'->'deductionRules','[]'::jsonb);
  IF jsonb_array_length(configured_rules)=0 THEN RAISE EXCEPTION 'DEDUCTIONS_DISABLED'; END IF;
  SELECT value INTO rule FROM jsonb_array_elements(configured_rules) WHERE value->>'id'=p_body->>'ruleKey';
  IF rule IS NULL OR NOT s.entry_ids ? (p_body->>'entryId') OR rule->>'roundId' IS NOT NULL AND rule->>'roundId' IS DISTINCT FROM p_round::text OR rule->>'criteriaId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state->'rules'->'configuration_snapshot'->'criteria') k WHERE k->>'id'=rule->>'criteriaId' AND (k->>'roundId')::uuid IS NOT DISTINCT FROM p_round) THEN RAISE EXCEPTION 'DEDUCTION_SCOPE_FORBIDDEN'; END IF;
  IF p_round IS NOT NULL AND rule->>'roundId' IS NULL AND rule->>'criteriaId' IS NULL AND EXISTS(SELECT 1 FROM competition_child_rounds WHERE competition_id=p_competition AND display_order>(SELECT display_order FROM competition_child_rounds WHERE id=p_round)) THEN RAISE EXCEPTION 'GLOBAL_DEDUCTION_REQUIRES_FINAL_SCOPE'; END IF;
  IF length(btrim(coalesce(p_body->>'offenseKey','')))=0 OR length(btrim(coalesce(p_body->>'reason','')))<5 THEN RAISE EXCEPTION 'DEDUCTION_OFFENSE_REASON_REQUIRED'; END IF;
  INSERT INTO competition_child_deduction_decisions(session_id,entry_id,rule_key,offense_key,rule_snapshot,reason,proposed_by) VALUES(s.id,(p_body->>'entryId')::uuid,p_body->>'ruleKey',p_body->>'offenseKey',rule,p_body->>'reason',p_actor) RETURNING * INTO decision;
 ELSE
  SELECT * INTO decision FROM competition_child_deduction_decisions WHERE id=(p_body->>'decisionId')::uuid AND session_id=s.id;
  IF decision.id IS NULL OR decision.proposed_by=p_actor THEN RAISE EXCEPTION 'DEDUCTION_REVIEW_FORBIDDEN'; END IF;
  SELECT action INTO last_action FROM competition_child_deduction_reviews WHERE decision_id=decision.id ORDER BY version DESC LIMIT 1;
  IF p_action NOT IN('approve','reject','revoke') OR p_action IN('approve','reject') AND last_action IS NOT NULL OR p_action='revoke' AND last_action IS DISTINCT FROM 'approve' THEN RAISE EXCEPTION 'INVALID_DEDUCTION_TRANSITION'; END IF;
  IF length(btrim(coalesce(p_body->>'reason','')))<5 THEN RAISE EXCEPTION 'DEDUCTION_REVIEW_REASON_REQUIRED'; END IF;
  INSERT INTO competition_child_deduction_reviews(decision_id,action,reason,actor_id,version) VALUES(decision.id,p_action,p_body->>'reason',p_actor,coalesce((SELECT max(version)+1 FROM competition_child_deduction_reviews WHERE decision_id=decision.id),1));
 END IF;
 RETURN jsonb_build_object('decisionId',decision.id,'action',p_action);
END $$;

CREATE OR REPLACE FUNCTION public.competition_child_confirm_qualification(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_calculation uuid,p_digest text,p_qualifiers jsonb,p_reason text,p_acknowledged boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; definition jsonb; target jsonb; expected jsonb; q competition_child_qualifications; cutoff numeric; n integer; kind text; results jsonb; existing_roster jsonb;
BEGIN
 PERFORM competition_native_authority(p_event,p_competition,p_actor,false);
 state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,p_round,false);
 IF state->'complete' IS DISTINCT FROM 'true'::jsonb OR state->'calculation'->'finalized' IS DISTINCT FROM 'true'::jsonb OR state->'calculation'->>'id' IS DISTINCT FROM p_calculation::text OR state->>'sourceDigest' IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'CURRENT_FINALIZED_QUALIFICATION_REQUIRED'; END IF;
 SELECT value INTO definition FROM jsonb_array_elements(state->'rules'->'configuration_snapshot'->'rounds') WHERE value->>'id'=p_round::text;
 SELECT value INTO target
 FROM jsonb_array_elements(state->'rules'->'configuration_snapshot'->'rounds')
 WHERE value->>'purpose' IS DISTINCT FROM 'special'
   AND ((definition->>'nextRoundId' IS NOT NULL AND value->>'id'=definition->>'nextRoundId')
     OR (definition->>'nextRoundId' IS NULL AND (value->>'displayOrder')::integer>(definition->>'displayOrder')::integer))
 ORDER BY (value->>'displayOrder')::integer LIMIT 1;
 IF target IS NULL THEN RAISE EXCEPTION 'NO_OUTGOING_QUALIFICATION'; END IF;
 IF p_acknowledged IS DISTINCT FROM true OR length(btrim(coalesce(p_reason,'')))<5 OR jsonb_typeof(p_qualifiers) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'EXPLICIT_QUALIFICATION_REVIEW_REQUIRED'; END IF;
 SELECT entry_ids INTO existing_roster FROM competition_child_sessions WHERE competition_id=p_competition AND round_id=(target->>'id')::uuid;
 results:=state->'calculation'->'output_snapshot'->'results';kind:=coalesce(definition->>'advancementType','none');
 IF (SELECT count(*) FROM jsonb_array_elements_text(p_qualifiers))<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_qualifiers)) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_qualifiers) selected WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(results) r WHERE r->>'contestantId'=selected)) THEN RAISE EXCEPTION 'QUALIFIER_SCOPE_FORBIDDEN'; END IF;
 IF kind IN('top_n','top_percent') THEN
  n:=CASE WHEN kind='top_n' THEN (definition->>'advancementValue')::integer ELSE ceil(jsonb_array_length(results)*(definition->>'advancementValue')::numeric/100)::integer END;
  SELECT (r->>'rank')::numeric INTO cutoff FROM jsonb_array_elements(results) r ORDER BY (r->>'rank')::numeric OFFSET greatest(0,least(n,jsonb_array_length(results))-1) LIMIT 1;
  SELECT coalesce(jsonb_agg(r->>'contestantId' ORDER BY r->>'contestantId'),'[]') INTO expected FROM jsonb_array_elements(results) r WHERE (r->>'rank')::numeric<=cutoff;
 ELSIF kind='threshold' THEN
  SELECT coalesce(jsonb_agg(r->>'contestantId' ORDER BY r->>'contestantId'),'[]') INTO expected FROM jsonb_array_elements(results) r WHERE coalesce((SELECT (rr->>'finalScore')::numeric FROM jsonb_array_elements(state->'calculation'->'output_snapshot'->'roundResults') rr WHERE rr->>'contestantId'=r->>'contestantId' AND rr->>'roundId'=p_round::text),(r->>'finalScore')::numeric)>=(definition->>'advancementValue')::numeric;
 ELSIF kind='none' THEN SELECT coalesce(jsonb_agg(r->>'contestantId' ORDER BY r->>'contestantId'),'[]') INTO expected FROM jsonb_array_elements(results) r;
 ELSIF kind='manual' THEN expected:=p_qualifiers;
 ELSE RAISE EXCEPTION 'UNSUPPORTED_QUALIFICATION_POLICY'; END IF;
 IF kind<>'manual' AND (SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM jsonb_array_elements_text(p_qualifiers)) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FROZEN_QUALIFICATION_POLICY_MISMATCH'; END IF;
 IF target ? 'entryIds' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_qualifiers) selected WHERE NOT target->'entryIds' ? selected) THEN RAISE EXCEPTION 'TARGET_ROSTER_SCOPE_FORBIDDEN'; END IF;
 IF existing_roster IS NOT NULL THEN
  IF (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements_text(existing_roster)) IS DISTINCT FROM (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements_text(p_qualifiers)) THEN RAISE EXCEPTION 'QUALIFIED_ROSTER_CHANGE_REQUIRES_SESSION_REVISION'; END IF;
  p_qualifiers:=existing_roster;
 END IF;
 INSERT INTO competition_child_qualifications(event_id,competition_id,from_round,to_round,calculation_id,source_digest,qualifier_ids,policy_snapshot,confirmed_by,reason,version)
 VALUES(p_event,p_competition,p_round,(target->>'id')::uuid,p_calculation,p_digest,p_qualifiers,definition,p_actor,p_reason,coalesce((SELECT max(version)+1 FROM competition_child_qualifications WHERE competition_id=p_competition AND to_round=(target->>'id')::uuid),1)) RETURNING * INTO q;
 RETURN jsonb_build_object('qualificationId',q.id,'toRound',q.to_round,'qualifierIds',q.qualifier_ids);
END $$;

REVOKE ALL ON FUNCTION public.competition_child_native_deductions_enabled(jsonb,uuid),public.competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean),public.competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb),public.competition_child_deduction_action(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.competition_child_native_deductions_enabled(jsonb,uuid),public.competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean),public.competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb),public.competition_child_deduction_action(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
