-- Preserve weighted numeric round averages for percentage carry; never multiply ordinal placements.
BEGIN;
CREATE OR REPLACE FUNCTION competition_validate_native_configuration(p_event uuid,p_competition uuid,p_config jsonb,p_complete boolean)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r jsonb; criterion jsonb; minor jsonb; penalty jsonb; method text; ids uuid[]; round_ids uuid[]; scope uuid; total numeric; ordinal integer:=0;
BEGIN
 IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' OR p_config->>'structure' IS NULL OR p_config->>'structure' NOT IN('single','multiple') OR jsonb_typeof(p_config->'rounds') IS DISTINCT FROM 'array' OR jsonb_typeof(p_config->'criteria') IS DISTINCT FROM 'array' OR jsonb_typeof(p_config->'scoringConfig') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_NATIVE_CONFIGURATION'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_config->'scoringConfig') k WHERE k NOT IN('calculationMethod','tiePolicy','decimalPlaces','dropHighest','dropLowest','deductionRules','manualBasis','numericCarryBasis')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_SCORING_OPTION'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_config) k WHERE k NOT IN('structure','rounds','criteria','scoringConfig')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_CONFIGURATION_FIELD'; END IF;
 method:=p_config->'scoringConfig'->>'calculationMethod';
 IF method IS NULL OR method NOT IN('weighted_average','sum','rank_based','highest_score','lowest_removal','manual','undecided') OR p_complete AND method='undecided' THEN RAISE EXCEPTION 'UNSUPPORTED_CALCULATION_METHOD'; END IF;
 IF coalesce(p_config->'scoringConfig'->>'tiePolicy','shared') NOT IN('shared','highest_criterion') OR method='rank_based' AND coalesce(p_config->'scoringConfig'->>'tiePolicy','shared')<>'shared' THEN RAISE EXCEPTION 'UNSUPPORTED_TIE_POLICY'; END IF;
 IF coalesce((p_config->'scoringConfig'->>'decimalPlaces')::numeric,2) NOT BETWEEN 0 AND 6 OR coalesce((p_config->'scoringConfig'->>'decimalPlaces')::numeric,2)<>trunc(coalesce((p_config->'scoringConfig'->>'decimalPlaces')::numeric,2)) THEN RAISE EXCEPTION 'INVALID_PRECISION'; END IF;
 IF p_config->'scoringConfig' ? 'numericCarryBasis' AND (p_config->'scoringConfig'->>'numericCarryBasis'<>'weighted_judge_average' OR method<>'rank_based' OR jsonb_array_length(coalesce(p_config->'scoringConfig'->'deductionRules','[]'))>0) THEN RAISE EXCEPTION 'INVALID_NUMERIC_CARRY_BASIS'; END IF;
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
   IF r ? 'calculationMethod' AND r->>'calculationMethod'<>method AND (EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') x WHERE coalesce(x->>'progression','back_to_zero')<>'back_to_zero') OR jsonb_array_length(coalesce(p_config->'scoringConfig'->'deductionRules','[]'))>0) THEN RAISE EXCEPTION 'INCOMPATIBLE_ROUND_METHODS'; END IF;
   IF coalesce(r->>'progression','back_to_zero') NOT IN('back_to_zero','weighted','carry_forward') THEN RAISE EXCEPTION 'UNSUPPORTED_CARRY_POLICY'; END IF;
   IF coalesce(r->>'progression','back_to_zero')<>'back_to_zero' AND method IN('rank_based','manual') AND NOT(method='rank_based' AND r->>'progression'='weighted' AND coalesce(p_config->'scoringConfig'->>'numericCarryBasis','')='weighted_judge_average') THEN RAISE EXCEPTION 'ORDINAL_CARRY_REQUIRES_NUMERIC_BASIS'; END IF;
   IF coalesce(r->>'advancementType','none') NOT IN('none','top_n','top_percent','threshold','manual') THEN RAISE EXCEPTION 'INVALID_ADVANCEMENT'; END IF;
   IF ordinal=jsonb_array_length(p_config->'rounds')-1 AND (coalesce(r->>'advancementType','none')<>'none' OR r->>'nextRoundId' IS NOT NULL) THEN RAISE EXCEPTION 'FINAL_HAS_NO_ADVANCEMENT'; END IF;
   IF r->>'nextRoundId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') n WHERE n->>'id'=r->>'nextRoundId' AND (n->>'displayOrder')::integer>ordinal) THEN RAISE EXCEPTION 'CROSS_COMPETITION_NEXT_ROUND'; END IF;
   IF r->>'advancementType'='top_n' AND (coalesce((r->>'advancementValue')::numeric,0)<1 OR (r->>'advancementValue')::numeric<>trunc((r->>'advancementValue')::numeric)) OR r->>'advancementType'='top_percent' AND coalesce((r->>'advancementValue')::numeric,0) NOT BETWEEN 0.000001 AND 100 THEN RAISE EXCEPTION 'INVALID_ADVANCEMENT_VALUE'; END IF;
   IF r->>'advancementType'='threshold' AND (method IN('rank_based','manual') OR r->>'advancementValue' IS NULL OR (r->>'advancementValue')::numeric<0) THEN RAISE EXCEPTION 'INCOMPATIBLE_THRESHOLD'; END IF;
   IF r ? 'entryIds' THEN
     IF jsonb_typeof(r->'entryIds')<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->'entryIds') e WHERE NOT EXISTS(SELECT 1 FROM competition_entries WHERE id=e::uuid AND event_id=p_event AND competition_id=p_competition)) THEN RAISE EXCEPTION 'CROSS_COMPETITION_ROUND_ENTRY'; END IF;
   END IF;
   ordinal:=ordinal+1;
 END LOOP;
 FOR criterion IN SELECT value FROM jsonb_array_elements(p_config->'criteria') LOOP
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(criterion) k WHERE k NOT IN('id','name','roundId','percentage','minScore','maxScore','minorCriteria')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_CRITERION_FIELD'; END IF;
   IF criterion->>'id' IS NULL OR length(btrim(coalesce(criterion->>'name','')))=0 OR jsonb_typeof(criterion->'percentage') IS DISTINCT FROM 'number' OR (criterion->>'percentage')::numeric NOT BETWEEN 0.000001 AND 100 THEN RAISE EXCEPTION 'INVALID_MAJOR_CRITERION'; END IF;
   IF EXISTS(SELECT 1 FROM competition_child_criteria WHERE id=(criterion->>'id')::uuid AND competition_id<>p_competition) THEN RAISE EXCEPTION 'CROSS_COMPETITION_CRITERION'; END IF;
   scope:=nullif(criterion->>'roundId','')::uuid;
   IF p_config->>'structure'='single' AND scope IS NOT NULL OR p_config->>'structure'='multiple' AND (scope IS NULL OR NOT scope=ANY(round_ids)) THEN RAISE EXCEPTION 'CROSS_COMPETITION_CRITERION_ROUND'; END IF;
   IF criterion ? 'minorCriteria' AND jsonb_typeof(criterion->'minorCriteria')<>'array' THEN RAISE EXCEPTION 'INVALID_MINOR_CRITERIA'; END IF;
   FOR minor IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_array_length(coalesce(criterion->'minorCriteria','[]'))>0 THEN criterion->'minorCriteria' ELSE jsonb_build_array(criterion) END) LOOP
     IF minor<>criterion AND EXISTS(SELECT 1 FROM jsonb_object_keys(minor) k WHERE k NOT IN('id','name','minScore','maxScore','percentage')) THEN RAISE EXCEPTION 'MINORS_USE_EXISTING_EQUAL_AVERAGE'; END IF;
     IF jsonb_typeof(minor->'minScore') IS DISTINCT FROM 'number' OR jsonb_typeof(minor->'maxScore') IS DISTINCT FROM 'number' OR (minor->>'maxScore')::numeric<=0 OR (minor->>'minScore')::numeric>=(minor->>'maxScore')::numeric THEN RAISE EXCEPTION 'INVALID_SCORE_RANGE'; END IF;
     IF minor<>criterion AND (minor->>'id' IS NULL OR length(btrim(coalesce(minor->>'name','')))=0 OR minor ? 'weight') THEN RAISE EXCEPTION 'MINORS_USE_EXISTING_EQUAL_AVERAGE'; END IF;
     IF minor<>criterion AND EXISTS(SELECT 1 FROM competition_child_minors WHERE id=(minor->>'id')::uuid AND competition_id<>p_competition) THEN RAISE EXCEPTION 'CROSS_COMPETITION_MINOR'; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(criterion->'minorCriteria','[]')) m WHERE m ? 'percentage') THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(criterion->'minorCriteria') m WHERE jsonb_typeof(m->'percentage') IS DISTINCT FROM 'number' OR (m->>'percentage')::numeric NOT BETWEEN 0.000001 AND 100) OR
    abs((SELECT sum((m->>'percentage')::numeric) FROM jsonb_array_elements(criterion->'minorCriteria') m)-100)>0.001 THEN RAISE EXCEPTION 'MINOR_WEIGHTS_MUST_TOTAL_100'; END IF;
   END IF;
 END LOOP;
 SELECT array_agg((v->>'id')::uuid) INTO ids FROM jsonb_array_elements(p_config->'criteria') v;
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'DUPLICATE_CRITERION_ID'; END IF;
 FOR scope IN SELECT unnest(round_ids) UNION ALL SELECT NULL::uuid WHERE p_config->>'structure'='single' LOOP
   SELECT coalesce(sum((v->>'percentage')::numeric),0) INTO total FROM jsonb_array_elements(p_config->'criteria') v WHERE nullif(v->>'roundId','')::uuid IS NOT DISTINCT FROM scope;
   IF total>100.001 OR p_complete AND abs(total-100)>0.001 THEN RAISE EXCEPTION 'SCOPE_WEIGHT_MUST_TOTAL_100'; END IF;
 END LOOP;
 FOR penalty IN SELECT value FROM jsonb_array_elements(coalesce(p_config->'scoringConfig'->'deductionRules','[]')) LOOP
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(penalty) k WHERE k NOT IN('id','description','amount','units','roundId','criteriaId')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_DEDUCTION_FIELD'; END IF;
   IF method='manual' OR jsonb_typeof(penalty->'amount') IS DISTINCT FROM 'number' OR (penalty->>'amount')::numeric<=0 OR length(btrim(coalesce(penalty->>'id','')))=0 OR length(btrim(coalesce(penalty->>'description','')))=0 OR penalty->>'units' IS DISTINCT FROM (CASE WHEN method='rank_based' THEN 'placements' ELSE 'points' END) THEN RAISE EXCEPTION 'INVALID_DEDUCTION_RULE'; END IF;
   IF penalty->>'roundId' IS NOT NULL AND NOT (penalty->>'roundId')::uuid=ANY(coalesce(round_ids,'{}')) THEN RAISE EXCEPTION 'CROSS_COMPETITION_DEDUCTION_ROUND'; END IF;
   IF penalty->>'criteriaId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'criteria') v WHERE v->>'id'=penalty->>'criteriaId' AND (penalty->>'roundId' IS NULL OR v->>'roundId'=penalty->>'roundId')) THEN RAISE EXCEPTION 'CROSS_COMPETITION_DEDUCTION_CRITERION'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_array_elements(coalesce(p_config->'scoringConfig'->'deductionRules','[]')))<>(SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(coalesce(p_config->'scoringConfig'->'deductionRules','[]')) v) THEN RAISE EXCEPTION 'DUPLICATE_DEDUCTION_RULE_ID'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') rd WHERE rd->>'progression'='weighted') AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') rd WHERE coalesce(rd->>'progression','back_to_zero')<>'weighted') THEN RAISE EXCEPTION 'INCOMPATIBLE_ROUND_CONTRIBUTIONS'; END IF;
 -- Numeric contributions retain the existing percentage interpretation; rank
 -- aggregates must never be multiplied as percentage scores.
 IF p_complete AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') rd WHERE rd->>'progression'='weighted') AND (SELECT coalesce(sum((rd->>'weight')::numeric),0) FROM jsonb_array_elements(p_config->'rounds') rd WHERE rd->>'progression'='weighted')<>100 THEN RAISE EXCEPTION 'ROUND_CONTRIBUTIONS_MUST_TOTAL_100'; END IF;
END $$;

CREATE OR REPLACE FUNCTION competition_child_public_projection(p_calculation uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE calc competition_child_calculations; event_name text; child_name text; round_name text; standings jsonb;
BEGIN
 SELECT * INTO calc FROM competition_child_calculations WHERE id=p_calculation;
 SELECT title INTO event_name FROM events WHERE id=calc.event_id;SELECT name INTO child_name FROM competitions WHERE id=calc.competition_id;
 SELECT definition->>'name' INTO round_name FROM competition_child_rounds WHERE id=calc.round_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('participationId',r->>'contestantId','entryNumber',r->'contestantNumber','name',coalesce(r->>'contestantName',r->>'name'),'rank',r->'rank','score',CASE WHEN r->'manual'='true'::jsonb THEN 'null'::jsonb ELSE r->'finalScore' END,'numericCarryScore',r->'numericCarryScore','manual',coalesce(r->'manual','false'::jsonb),'deductionTotal',r->'deductionTotal','deductionUnits',CASE WHEN calc.input_snapshot->'rules'->'scoringConfig'->>'calculationMethod'='rank_based' THEN 'placements' ELSE 'points' END,'tied',(SELECT count(*)>1 FROM jsonb_array_elements(calc.output_snapshot->'results') peer WHERE peer->'rank'=r->'rank')) ORDER BY (r->>'rank')::integer,r->>'contestantId'),'[]') INTO standings FROM jsonb_array_elements(calc.output_snapshot->'results') r;
 RETURN jsonb_build_object('eventId',calc.event_id,'eventName',event_name,'competitionId',calc.competition_id,'competitionName',child_name,'roundId',calc.round_id,'roundName',coalesce(round_name,'Single phase'),'calculationVersion',calc.version,'method',calc.input_snapshot->'rules'->'scoringConfig'->>'calculationMethod','tiePolicy',calc.input_snapshot->'rules'->'scoringConfig'->>'tiePolicy','precision',coalesce(calc.input_snapshot->'rules'->'scoringConfig'->'decimalPlaces','2'::jsonb),'finalizedAt',(SELECT created_at FROM competition_child_calculation_transitions WHERE calculation_id=calc.id AND action='finalize'),'standings',standings);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
