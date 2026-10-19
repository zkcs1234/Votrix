-- Optional judge input precision and named single scope. No existing data is rewritten.
BEGIN;
CREATE OR REPLACE FUNCTION competition_validate_native_configuration(p_event uuid,p_competition uuid,p_config jsonb,p_complete boolean)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r jsonb; criterion jsonb; minor jsonb; penalty jsonb; method text; ids uuid[]; round_ids uuid[]; scope uuid; total numeric; ordinal integer:=0;
BEGIN
 IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' OR p_config->>'structure' IS NULL OR p_config->>'structure' NOT IN('single','multiple') OR jsonb_typeof(p_config->'rounds') IS DISTINCT FROM 'array' OR jsonb_typeof(p_config->'criteria') IS DISTINCT FROM 'array' OR jsonb_typeof(p_config->'scoringConfig') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_NATIVE_CONFIGURATION'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_config->'scoringConfig') k WHERE k NOT IN('calculationMethod','criterionBasis','tiePolicy','decimalPlaces','dropHighest','dropLowest','deductionRules','manualBasis','numericCarryBasis','inputDecimalPlaces','defaultMinScore','defaultMaxScore','singleRoundName')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_SCORING_OPTION'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_config) k WHERE k NOT IN('structure','rounds','criteria','scoringConfig')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_CONFIGURATION_FIELD'; END IF;
 method:=p_config->'scoringConfig'->>'calculationMethod';
 IF coalesce(p_config->'scoringConfig'->>'criterionBasis','percentage') NOT IN('percentage','points') THEN RAISE EXCEPTION 'UNSUPPORTED_CRITERION_BASIS'; END IF;
 IF method IS NULL OR method NOT IN('weighted_average','sum','rank_based','highest_score','lowest_removal','manual','undecided') OR p_complete AND method='undecided' THEN RAISE EXCEPTION 'UNSUPPORTED_CALCULATION_METHOD'; END IF;
 IF coalesce(p_config->'scoringConfig'->>'tiePolicy','shared') NOT IN('shared','highest_criterion') OR method='rank_based' AND coalesce(p_config->'scoringConfig'->>'tiePolicy','shared')<>'shared' THEN RAISE EXCEPTION 'UNSUPPORTED_TIE_POLICY'; END IF;
 IF coalesce((p_config->'scoringConfig'->>'decimalPlaces')::numeric,2) NOT BETWEEN 0 AND 6 OR coalesce((p_config->'scoringConfig'->>'decimalPlaces')::numeric,2)<>trunc(coalesce((p_config->'scoringConfig'->>'decimalPlaces')::numeric,2)) THEN RAISE EXCEPTION 'INVALID_PRECISION'; END IF;
 IF p_config->'scoringConfig' ? 'numericCarryBasis' AND (p_config->'scoringConfig'->>'numericCarryBasis'<>'weighted_judge_average' OR method<>'rank_based') THEN RAISE EXCEPTION 'INVALID_NUMERIC_CARRY_BASIS'; END IF;
 IF method='manual' AND p_complete AND length(btrim(coalesce(p_config->'scoringConfig'->>'manualBasis','')))=0 THEN RAISE EXCEPTION 'MANUAL_BASIS_REQUIRED'; END IF;
 IF p_config->'scoringConfig' ? 'manualBasis' AND jsonb_typeof(p_config->'scoringConfig'->'manualBasis') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'INVALID_MANUAL_BASIS'; END IF;
 IF coalesce((p_config->'scoringConfig'->>'dropHighest')::numeric,0)<0 OR coalesce((p_config->'scoringConfig'->>'dropLowest')::numeric,0)<0 OR coalesce((p_config->'scoringConfig'->>'dropHighest')::numeric,0)<>trunc(coalesce((p_config->'scoringConfig'->>'dropHighest')::numeric,0)) OR coalesce((p_config->'scoringConfig'->>'dropLowest')::numeric,0)<>trunc(coalesce((p_config->'scoringConfig'->>'dropLowest')::numeric,0)) THEN RAISE EXCEPTION 'INVALID_REMOVAL_COUNTS'; END IF;
 IF p_config->>'structure'='single' AND jsonb_array_length(p_config->'rounds')<>0 OR p_config->>'structure'='multiple' AND jsonb_array_length(p_config->'rounds')<1 THEN RAISE EXCEPTION 'INVALID_SCORING_STRUCTURE'; END IF;
 SELECT array_agg((v->>'id')::uuid) INTO round_ids FROM jsonb_array_elements(p_config->'rounds') v;
 IF cardinality(round_ids)<>(SELECT count(DISTINCT x) FROM unnest(round_ids) x) THEN RAISE EXCEPTION 'DUPLICATE_ROUND_ID'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_config->'rounds') LOOP
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(r) k WHERE k NOT IN('id','name','displayOrder','progression','weight','advancementType','advancementValue','nextRoundId','entryIds','calculationMethod')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_ROUND_FIELD'; END IF;
   IF r->>'id' IS NULL OR length(btrim(coalesce(r->>'name','')))=0 OR (r->>'displayOrder')::integer IS DISTINCT FROM ordinal THEN RAISE EXCEPTION 'INVALID_ROUND_ORDER'; END IF;
   IF EXISTS(SELECT 1 FROM competition_child_rounds WHERE id=(r->>'id')::uuid AND competition_id<>p_competition) THEN RAISE EXCEPTION 'CROSS_COMPETITION_ROUND'; END IF;
   IF r->>'progression'='weighted' AND (r->>'weight' IS NULL OR (r->>'weight')::numeric NOT BETWEEN 0.000001 AND 100) THEN RAISE EXCEPTION 'INVALID_ROUND_CONTRIBUTION'; END IF;
   IF r ? 'calculationMethod' AND (r->>'calculationMethod' NOT IN('weighted_average','sum','rank_based','highest_score','lowest_removal','manual') OR r->>'calculationMethod'='manual' AND method<>'manual') THEN RAISE EXCEPTION 'UNSUPPORTED_ROUND_METHOD'; END IF;
   IF r ? 'calculationMethod' AND r->>'calculationMethod'<>method AND (EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') x WHERE coalesce(x->>'progression','back_to_zero')<>'back_to_zero')) THEN RAISE EXCEPTION 'INCOMPATIBLE_ROUND_METHODS'; END IF;
   IF coalesce(r->>'progression','back_to_zero') NOT IN('back_to_zero','weighted','carry_forward') THEN RAISE EXCEPTION 'UNSUPPORTED_CARRY_POLICY'; END IF;
   IF coalesce(r->>'progression','back_to_zero')<>'back_to_zero' AND method IN('rank_based','manual') AND NOT(method='rank_based' AND r->>'progression'='weighted' AND coalesce(p_config->'scoringConfig'->>'numericCarryBasis','')='weighted_judge_average') THEN RAISE EXCEPTION 'ORDINAL_CARRY_REQUIRES_NUMERIC_BASIS'; END IF;
   IF r->>'calculationMethod'='rank_based' AND coalesce(p_config->'scoringConfig'->>'tiePolicy','shared')<>'shared' THEN RAISE EXCEPTION 'UNSUPPORTED_TIE_POLICY'; END IF;
   IF coalesce(r->>'advancementType','none') NOT IN('none','top_n','top_percent','threshold','manual') THEN RAISE EXCEPTION 'INVALID_ADVANCEMENT'; END IF;
   IF ordinal=jsonb_array_length(p_config->'rounds')-1 AND (coalesce(r->>'advancementType','none')<>'none' OR r->>'nextRoundId' IS NOT NULL) THEN RAISE EXCEPTION 'FINAL_HAS_NO_ADVANCEMENT'; END IF;
   IF r->>'nextRoundId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') n WHERE n->>'id'=r->>'nextRoundId' AND (n->>'displayOrder')::integer>ordinal) THEN RAISE EXCEPTION 'CROSS_COMPETITION_NEXT_ROUND'; END IF;
   IF r->>'advancementType'='top_n' AND (coalesce((r->>'advancementValue')::numeric,0)<1 OR (r->>'advancementValue')::numeric<>trunc((r->>'advancementValue')::numeric)) OR r->>'advancementType'='top_percent' AND coalesce((r->>'advancementValue')::numeric,0) NOT BETWEEN 0.000001 AND 100 THEN RAISE EXCEPTION 'INVALID_ADVANCEMENT_VALUE'; END IF;
   IF r->>'advancementType'='threshold' AND (coalesce(r->>'calculationMethod',method) IN('rank_based','manual') OR r->>'advancementValue' IS NULL OR (r->>'advancementValue')::numeric<0) THEN RAISE EXCEPTION 'INCOMPATIBLE_THRESHOLD'; END IF;
   IF r ? 'entryIds' THEN
     IF jsonb_typeof(r->'entryIds')<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->'entryIds') e WHERE NOT EXISTS(SELECT 1 FROM competition_entries WHERE id=e::uuid AND event_id=p_event AND competition_id=p_competition)) THEN RAISE EXCEPTION 'CROSS_COMPETITION_ROUND_ENTRY'; END IF;
   END IF;
   ordinal:=ordinal+1;
 END LOOP;
 FOR criterion IN SELECT value FROM jsonb_array_elements(p_config->'criteria') LOOP
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(criterion) k WHERE k NOT IN('id','name','roundId','percentage','minScore','maxScore','minorCriteria','decimalPlaces')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_CRITERION_FIELD'; END IF;
   IF criterion->>'id' IS NULL OR length(btrim(coalesce(criterion->>'name','')))=0 OR coalesce(p_config->'scoringConfig'->>'criterionBasis','percentage')='percentage' AND (jsonb_typeof(criterion->'percentage') IS DISTINCT FROM 'number' OR (criterion->>'percentage')::numeric NOT BETWEEN 0.000001 AND 100) OR coalesce(p_config->'scoringConfig'->>'criterionBasis','percentage')='points' AND (jsonb_typeof(criterion->'maxScore') IS DISTINCT FROM 'number' OR (criterion->>'maxScore')::numeric<=0) THEN RAISE EXCEPTION 'INVALID_MAJOR_CRITERION'; END IF;
   IF EXISTS(SELECT 1 FROM competition_child_criteria WHERE id=(criterion->>'id')::uuid AND competition_id<>p_competition) THEN RAISE EXCEPTION 'CROSS_COMPETITION_CRITERION'; END IF;
   scope:=nullif(criterion->>'roundId','')::uuid;
   IF p_config->>'structure'='single' AND scope IS NOT NULL OR p_config->>'structure'='multiple' AND (scope IS NULL OR NOT scope=ANY(round_ids)) THEN RAISE EXCEPTION 'CROSS_COMPETITION_CRITERION_ROUND'; END IF;
   IF criterion ? 'minorCriteria' AND jsonb_typeof(criterion->'minorCriteria')<>'array' THEN RAISE EXCEPTION 'INVALID_MINOR_CRITERIA'; END IF;
   FOR minor IN SELECT value FROM jsonb_array_elements(CASE WHEN coalesce(p_config->'scoringConfig'->>'criterionBasis','percentage')='points' OR jsonb_array_length(coalesce(criterion->'minorCriteria','[]'))=0 THEN jsonb_build_array(criterion) ELSE criterion->'minorCriteria' END) LOOP
     IF minor<>criterion AND EXISTS(SELECT 1 FROM jsonb_object_keys(minor) k WHERE k NOT IN('id','name','minScore','maxScore','percentage','decimalPlaces')) THEN RAISE EXCEPTION 'MINORS_USE_EXISTING_EQUAL_AVERAGE'; END IF;
     IF jsonb_typeof(minor->'minScore') IS DISTINCT FROM 'number' OR jsonb_typeof(minor->'maxScore') IS DISTINCT FROM 'number' OR (minor->>'maxScore')::numeric<=0 OR (minor->>'minScore')::numeric>=(minor->>'maxScore')::numeric THEN RAISE EXCEPTION 'INVALID_SCORE_RANGE'; END IF;
     IF minor<>criterion AND (minor->>'id' IS NULL OR length(btrim(coalesce(minor->>'name','')))=0 OR minor ? 'weight') THEN RAISE EXCEPTION 'MINORS_USE_EXISTING_EQUAL_AVERAGE'; END IF;
     IF minor<>criterion AND EXISTS(SELECT 1 FROM competition_child_minors WHERE id=(minor->>'id')::uuid AND competition_id<>p_competition) THEN RAISE EXCEPTION 'CROSS_COMPETITION_MINOR'; END IF;
   END LOOP;
   IF coalesce(p_config->'scoringConfig'->>'criterionBasis','percentage')='points' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(criterion->'minorCriteria','[]')) m WHERE m ? 'percentage') THEN RAISE EXCEPTION 'POINT_MINOR_WEIGHTS_UNSUPPORTED'; END IF;
   IF coalesce(p_config->'scoringConfig'->>'criterionBasis','percentage')='percentage' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(criterion->'minorCriteria','[]')) m WHERE m ? 'percentage') THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(criterion->'minorCriteria') m WHERE jsonb_typeof(m->'percentage') IS DISTINCT FROM 'number' OR (m->>'percentage')::numeric NOT BETWEEN 0.000001 AND 100) OR
    abs((SELECT sum((m->>'percentage')::numeric) FROM jsonb_array_elements(criterion->'minorCriteria') m)-100)>0.001 THEN RAISE EXCEPTION 'MINOR_WEIGHTS_MUST_TOTAL_100'; END IF;
   END IF;
 END LOOP;
 SELECT array_agg((v->>'id')::uuid) INTO ids FROM jsonb_array_elements(p_config->'criteria') v;
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'DUPLICATE_CRITERION_ID'; END IF;
 FOR scope IN SELECT unnest(round_ids) UNION ALL SELECT NULL::uuid WHERE p_config->>'structure'='single' LOOP
   SELECT coalesce(sum((v->>'percentage')::numeric),0) INTO total FROM jsonb_array_elements(p_config->'criteria') v WHERE nullif(v->>'roundId','')::uuid IS NOT DISTINCT FROM scope;
   IF coalesce(p_config->'scoringConfig'->>'criterionBasis','percentage')='percentage' AND (total>100.001 OR p_complete AND abs(total-100)>0.001) THEN RAISE EXCEPTION 'SCOPE_WEIGHT_MUST_TOTAL_100'; END IF;
 END LOOP;
 FOR penalty IN SELECT value FROM jsonb_array_elements(coalesce(p_config->'scoringConfig'->'deductionRules','[]')) LOOP
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(penalty) k WHERE k NOT IN('id','description','amount','units','roundId','criteriaId')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_DEDUCTION_FIELD'; END IF;
   IF method='manual' OR jsonb_typeof(penalty->'amount') IS DISTINCT FROM 'number' OR (penalty->>'amount')::numeric<=0 OR length(btrim(coalesce(penalty->>'id','')))=0 OR length(btrim(coalesce(penalty->>'description','')))=0 OR (coalesce(penalty->>'units','') NOT IN('points','placements') OR method<>'rank_based' AND penalty->>'units'<>'points') THEN RAISE EXCEPTION 'INVALID_DEDUCTION_RULE'; END IF;
   IF p_config->'scoringConfig' ? 'numericCarryBasis' AND penalty->>'units'='placements' AND coalesce(penalty->>'roundId',(SELECT c->>'roundId' FROM jsonb_array_elements(p_config->'criteria') c WHERE c->>'id'=penalty->>'criteriaId')) IS NOT NULL AND coalesce(penalty->>'roundId',(SELECT c->>'roundId' FROM jsonb_array_elements(p_config->'criteria') c WHERE c->>'id'=penalty->>'criteriaId')) IS DISTINCT FROM (p_config->'rounds'->(jsonb_array_length(p_config->'rounds')-1)->>'id') THEN RAISE EXCEPTION 'ORDINAL_DEDUCTION_CANNOT_CARRY'; END IF;
   IF penalty->>'roundId' IS NOT NULL AND NOT (penalty->>'roundId')::uuid=ANY(coalesce(round_ids,'{}')) THEN RAISE EXCEPTION 'CROSS_COMPETITION_DEDUCTION_ROUND'; END IF;
   IF penalty->>'criteriaId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'criteria') v WHERE v->>'id'=penalty->>'criteriaId' AND (penalty->>'roundId' IS NULL OR v->>'roundId'=penalty->>'roundId')) THEN RAISE EXCEPTION 'CROSS_COMPETITION_DEDUCTION_CRITERION'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_array_elements(coalesce(p_config->'scoringConfig'->'deductionRules','[]')))<>(SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(coalesce(p_config->'scoringConfig'->'deductionRules','[]')) v) THEN RAISE EXCEPTION 'DUPLICATE_DEDUCTION_RULE_ID'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') rd WHERE rd->>'progression'='weighted') AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') rd WHERE coalesce(rd->>'progression','back_to_zero')<>'weighted') THEN RAISE EXCEPTION 'INCOMPATIBLE_ROUND_CONTRIBUTIONS'; END IF;
 -- Numeric contributions retain the existing percentage interpretation; rank
 -- aggregates must never be multiplied as percentage scores.
 IF p_complete AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') rd WHERE rd->>'progression'='weighted') AND (SELECT coalesce(sum((rd->>'weight')::numeric),0) FROM jsonb_array_elements(p_config->'rounds') rd WHERE rd->>'progression'='weighted')<>100 THEN RAISE EXCEPTION 'ROUND_CONTRIBUTIONS_MUST_TOTAL_100'; END IF;

 IF p_config->'scoringConfig' ? 'inputDecimalPlaces' AND (jsonb_typeof(p_config->'scoringConfig'->'inputDecimalPlaces') IS DISTINCT FROM 'number' OR (p_config->'scoringConfig'->>'inputDecimalPlaces')::numeric NOT BETWEEN 0 AND 6 OR (p_config->'scoringConfig'->>'inputDecimalPlaces')::numeric<>trunc((p_config->'scoringConfig'->>'inputDecimalPlaces')::numeric)) THEN RAISE EXCEPTION 'INVALID_INPUT_PRECISION'; END IF;
 IF p_config->'scoringConfig' ? 'singleRoundName' AND (jsonb_typeof(p_config->'scoringConfig'->'singleRoundName') IS DISTINCT FROM 'string' OR length(btrim(p_config->'scoringConfig'->>'singleRoundName')) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'SINGLE_ROUND_NAME_REQUIRED'; END IF;
 IF p_config->'scoringConfig' ? 'defaultMinScore' OR p_config->'scoringConfig' ? 'defaultMaxScore' THEN
  IF jsonb_typeof(p_config->'scoringConfig'->'defaultMinScore') IS DISTINCT FROM 'number' OR jsonb_typeof(p_config->'scoringConfig'->'defaultMaxScore') IS DISTINCT FROM 'number' OR (p_config->'scoringConfig'->>'defaultMaxScore')::numeric<=0 OR (p_config->'scoringConfig'->>'defaultMinScore')::numeric>=(p_config->'scoringConfig'->>'defaultMaxScore')::numeric THEN RAISE EXCEPTION 'INVALID_DEFAULT_SCORE_RANGE'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') named_round GROUP BY lower(btrim(named_round->>'name')) HAVING count(*)>1) THEN RAISE EXCEPTION 'DUPLICATE_ROUND_NAME'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'criteria') c GROUP BY c->>'roundId',lower(btrim(c->>'name')) HAVING count(*)>1) THEN RAISE EXCEPTION 'DUPLICATE_CRITERION_NAME'; END IF;
 FOR criterion IN SELECT value FROM jsonb_array_elements(p_config->'criteria') LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(criterion->'minorCriteria','[]')) m GROUP BY lower(btrim(m->>'name')) HAVING count(*)>1) THEN RAISE EXCEPTION 'DUPLICATE_MINOR_NAME'; END IF;
  FOR minor IN SELECT value FROM jsonb_array_elements(jsonb_build_array(criterion)||coalesce(criterion->'minorCriteria','[]')) LOOP
   IF minor ? 'decimalPlaces' AND (jsonb_typeof(minor->'decimalPlaces') IS DISTINCT FROM 'number' OR (minor->>'decimalPlaces')::numeric NOT BETWEEN 0 AND 6 OR (minor->>'decimalPlaces')::numeric<>trunc((minor->>'decimalPlaces')::numeric)) THEN RAISE EXCEPTION 'INVALID_INPUT_PRECISION'; END IF;
  END LOOP;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION competition_child_scoring_choices(p_event uuid,p_actor uuid,p_owner boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; cfg jsonb; choice_scope uuid; result jsonb:='[]'; context jsonb;
BEGIN
 IF p_owner AND (NOT competition_owns_event(p_event,p_actor) OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role::text='organizer' AND account_status::text='active')) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
 FOR c IN SELECT * FROM competitions WHERE event_id=p_event AND origin='native' ORDER BY name,id LOOP
  SELECT configuration INTO cfg FROM competition_child_configurations WHERE competition_id=c.id;
  FOR choice_scope IN SELECT (r->>'id')::uuid FROM jsonb_array_elements(coalesce(cfg->'rounds','[]')) r UNION ALL SELECT NULL::uuid WHERE cfg->>'structure'='single' LOOP
   IF p_owner OR EXISTS(SELECT 1 FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id JOIN users u ON u.id=ep.user_id WHERE a.competition_id=c.id AND (a.round_id IS NULL OR a.round_id=choice_scope) AND ep.user_id=p_actor AND ep.event_id=p_event AND ep.is_active AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.judge_role::text IN('judge','head_judge') AND u.role::text IN('voter','participant') AND u.account_status::text='active') THEN
    result:=result||jsonb_build_array(jsonb_build_object('competitionId',c.id,'competitionName',c.name,'roundId',choice_scope,'roundName',coalesce((SELECT r->>'name' FROM jsonb_array_elements(cfg->'rounds') r WHERE r->>'id'=choice_scope::text),cfg->'scoringConfig'->>'singleRoundName','Single Round')));
   END IF;
  END LOOP;
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION competition_child_live_view_v105(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_owner boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx jsonb; s competition_child_sessions; v competition_child_rule_versions; cfg jsonb; entries jsonb; criteria jsonb; progress jsonb; operational boolean; event_status text;
BEGIN
 ctx:=competition_child_scoring_context(p_event,p_competition,p_actor,p_round,p_owner);
 SELECT status::text INTO event_status FROM events WHERE id=p_event;operational:=event_status IN('draft','active');
 SELECT * INTO v FROM competition_child_rule_versions WHERE id=(ctx->>'rulesVersion')::uuid;cfg:=v.configuration_snapshot;
 SELECT * INTO s FROM competition_child_sessions WHERE competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round;
 SELECT coalesce(jsonb_agg(k||jsonb_strip_nulls(jsonb_build_object('decimalPlaces',coalesce(k->'decimalPlaces',cfg->'scoringConfig'->'inputDecimalPlaces')))||jsonb_build_object('minors',(SELECT coalesce(jsonb_agg(m||jsonb_strip_nulls(jsonb_build_object('decimalPlaces',coalesce(m->'decimalPlaces',cfg->'scoringConfig'->'inputDecimalPlaces'))) ORDER BY minor_order),'[]') FROM jsonb_array_elements(coalesce(k->'minorCriteria','[]')) WITH ORDINALITY AS minor_rows(m,minor_order)),'open',operational AND s.status='active' AND coalesce((s.criterion_access->>(k->>'id'))::boolean,false)) ORDER BY criterion_order),'[]') INTO criteria FROM jsonb_array_elements(cfg->'criteria') WITH ORDINALITY AS criterion_rows(k,criterion_order) WHERE (k->>'roundId')::uuid IS NOT DISTINCT FROM p_round;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'masterId',e.contestant_id,'contestantNumber',e.entry_number,'name',m.name,'photo',to_jsonb(m)->>'photo','open',operational AND s.status='active' AND coalesce((s.entry_access->>e.id::text)::boolean,false),'lockedCriteria',coalesce((SELECT jsonb_agg(d.criterion_id ORDER BY d.criterion_id) FROM competition_child_score_drafts d WHERE d.session_id=s.id AND d.judge_id=p_actor AND d.entry_id=e.id AND d.locked),'[]')) ORDER BY e.entry_number),'[]') INTO entries
 FROM competition_entries e JOIN competition_contestants m ON m.id=e.contestant_id WHERE e.competition_id=p_competition AND (s.id IS NULL OR s.entry_ids ? e.id::text);
 IF p_owner THEN
 SELECT coalesce(jsonb_agg(jsonb_build_object('judgeId',panel.judge,'judgeName',coalesce(nullif(btrim(concat_ws(' ',to_jsonb(u)->>'first_name',to_jsonb(u)->>'last_name')),''),to_jsonb(u)->>'email',panel.judge::text),'lockedCount',(SELECT count(*) FROM competition_child_score_drafts d WHERE d.session_id=s.id AND d.judge_id=panel.judge AND d.locked),'requiredCount',jsonb_array_length(entries)*jsonb_array_length(criteria),'submitted',EXISTS(SELECT 1 FROM competition_child_submission_heads h WHERE h.session_id=s.id AND h.judge_id=panel.judge)) ORDER BY panel.judge),'[]') INTO progress FROM (SELECT DISTINCT (a->>'judgeId')::uuid judge FROM jsonb_array_elements(v.assignment_snapshot) a WHERE a->>'round_id' IS NULL OR a->>'round_id'=p_round::text) panel JOIN users u ON u.id=panel.judge;
 END IF;
 RETURN jsonb_build_object('context',ctx||jsonb_build_object('sessionId',s.id,'sessionRevision',s.revision),'criterionBasis',coalesce(cfg->'scoringConfig'->>'criterionBasis','percentage'),'eventStatus',event_status,'scoringAvailable',coalesce(operational AND s.status='active',false),'viewerJudgeId',CASE WHEN p_owner THEN NULL ELSE p_actor END,'session',CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END,'contestants',entries,'criteria',criteria,'progress',progress,'submission',CASE WHEN p_owner THEN NULL ELSE (SELECT jsonb_build_object('id',h.submission_id) FROM competition_child_submission_heads h WHERE h.session_id=s.id AND h.judge_id=p_actor) END,
 'drafts',CASE WHEN p_owner THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.entry_id,d.criterion_id) FROM competition_child_score_drafts d WHERE d.session_id=s.id AND d.judge_id=p_actor),'[]') END,
 'laterRoundBlocked',p_round IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'rounds') r WHERE r->>'id'=p_round::text AND (r->>'displayOrder')::integer>0));
END $$;


CREATE OR REPLACE FUNCTION competition_child_input_precision_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE cfg jsonb; criterion jsonb; target jsonb; cell record; precision integer; n numeric;
BEGIN
 SELECT v.configuration_snapshot INTO cfg FROM competition_child_sessions s JOIN competition_child_rule_versions v ON v.id=s.rules_version WHERE s.id=NEW.session_id;
 SELECT c INTO criterion FROM jsonb_array_elements(cfg->'criteria') c WHERE c->>'id'=NEW.criterion_id::text;
 FOR cell IN SELECT * FROM jsonb_each(NEW.scores) LOOP
  SELECT t INTO target FROM jsonb_array_elements(CASE WHEN cfg->'scoringConfig'->>'criterionBasis'='points' OR jsonb_array_length(coalesce(criterion->'minorCriteria','[]'))=0 THEN jsonb_build_array(criterion) ELSE criterion->'minorCriteria' END) t WHERE t->>'id'=cell.key;
  precision:=coalesce(target->>'decimalPlaces',cfg->'scoringConfig'->>'inputDecimalPlaces')::integer;
  IF precision IS NOT NULL THEN
   n:=cell.value::text::numeric;
   IF n<>round(n,precision) THEN RAISE EXCEPTION 'SCORE_INPUT_PRECISION_EXCEEDED'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS competition_child_input_precision_guard ON competition_child_score_drafts;
CREATE TRIGGER competition_child_input_precision_guard BEFORE INSERT OR UPDATE OF scores ON competition_child_score_drafts FOR EACH ROW EXECUTE FUNCTION competition_child_input_precision_guard();
REVOKE ALL ON FUNCTION competition_child_input_precision_guard() FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
