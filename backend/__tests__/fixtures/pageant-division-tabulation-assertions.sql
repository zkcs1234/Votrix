DO $$
DECLARE f pageant_division_fixture; state jsonb; result jsonb; output jsonb; input jsonb; member jsonb; results jsonb:='[]'; saved jsonb; projection jsonb; picked jsonb;
BEGIN
 SELECT * INTO f FROM pageant_division_fixture;
 state:=competition_child_tabulation_snapshot(f.event_id,f.child,f.actor,NULL,false);
 IF state->'divisionRanking'->>'mode'<>'division' OR jsonb_array_length(state->'divisionRanking'->'divisions')<>2 OR state->>'sourceDigest'=f.old_digest OR state->'calculationStale' IS DISTINCT FROM 'true'::jsonb OR state->'calculation'<>'null'::jsonb THEN RAISE EXCEPTION 'COMBINED_CALCULATION_NOT_INVALIDATED'; END IF;
 SELECT to_jsonb(calc) INTO saved FROM competition_child_calculations calc WHERE id=(f.old_calc->>'id')::uuid;
 IF saved IS DISTINCT FROM f.old_calc THEN RAISE EXCEPTION 'HISTORICAL_CALCULATION_REWRITTEN'; END IF;
 FOR member IN SELECT value FROM jsonb_array_elements(state->'divisionRanking'->'entries') LOOP
  results:=results||jsonb_build_array(jsonb_build_object('contestantId',member->>'entryId','divisionId',member->>'divisionId','divisionName',member->>'divisionName','contestantNumber',member->'contestantNumber','rank',member->'contestantNumber','baseScore',member->'contestantNumber','finalScore',member->'contestantNumber'));
 END LOOP;
 input:=jsonb_build_object('rules',jsonb_build_object('id',state->'rules'->>'id','scoringConfig',jsonb_build_object('perDivision',true,'calculationMethod','rank_based')));
 output:=jsonb_build_object('ready',true,'results',results,'divisionRanking',state->'divisionRanking');
 BEGIN
  PERFORM competition_child_official_calculate(f.event_id,f.child,f.actor,NULL,state->>'sourceDigest',input,output-'divisionRanking');
  RAISE EXCEPTION 'COMBINED_OUTPUT_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PAGEANT_DIVISION_CALCULATION_REQUIRED' THEN RAISE; END IF; END;
 result:=competition_child_official_calculate(f.event_id,f.child,f.actor,NULL,state->>'sourceDigest',input,output);
 state:=competition_child_tabulation_snapshot(f.event_id,f.child,f.actor,NULL,false);
 IF state->'calculation'->>'id' IS DISTINCT FROM result->>'calculationId' THEN RAISE EXCEPTION 'DIVISION_CALCULATION_NOT_CURRENT'; END IF;
 projection:=competition_child_public_projection((result->>'calculationId')::uuid);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(projection->'standings') s WHERE s->'tied'='true'::jsonb) OR projection->'divisionRanking' ? 'entries' THEN RAISE EXCEPTION 'CROSS_DIVISION_TIE_OR_PRIVATE_ROSTER_EXPOSED'; END IF;
 picked:=competition_child_division_qualifiers(results,jsonb_build_object('advancementType','top_n','advancementValue',1));
 IF jsonb_array_length(picked)<>2 THEN RAISE EXCEPTION 'TOP_N_NOT_PER_DIVISION'; END IF;
 picked:=competition_child_division_qualifiers(results,jsonb_build_object('advancementType','top_percent','advancementValue',50));
 IF jsonb_array_length(picked)<>2 THEN RAISE EXCEPTION 'PERCENT_NOT_PER_DIVISION'; END IF;
 IF has_function_privilege('service_role','competition_child_tabulation_snapshot_v130(uuid,uuid,uuid,uuid,boolean)','EXECUTE') OR has_function_privilege('authenticated','competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean)','EXECUTE') THEN RAISE EXCEPTION 'PRIVATE_DELEGATE_EXPOSED'; END IF;
 RAISE NOTICE 'PASS separate division evidence, guarded immutable calculations, per-division cutoffs, safe public projection and permissions';
END $$;
