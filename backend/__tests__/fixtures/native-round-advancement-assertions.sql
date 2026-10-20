DO $$
DECLARE f round_advancement_fixture; state jsonb; member jsonb; results jsonb:='[]'; input jsonb; output jsonb; saved jsonb; digest text; qualified jsonb; q jsonb; target jsonb; source jsonb; ctx jsonb;
BEGIN
 SELECT * INTO f FROM round_advancement_fixture;
 state:=competition_child_tabulation_snapshot(f.event_id,f.child,f.actor,f.pre_id,false);
 digest:=state->>'sourceDigest';
 IF state->'advancement'->>'toRoundId'<>f.final_id::text OR state->'advancement'->'qualificationCurrent' IS DISTINCT FROM 'false'::jsonb OR state->'advancement'->'nextSessionId'<>'null'::jsonb THEN RAISE EXCEPTION 'UNCONFIRMED_STATUS_INCORRECT'; END IF;
 FOR member IN SELECT value FROM jsonb_array_elements(state->'divisionRanking'->'entries') LOOP
  results:=results||jsonb_build_array(jsonb_build_object('contestantId',member->>'entryId','divisionId',member->>'divisionId','divisionName',member->>'divisionName','contestantNumber',member->'contestantNumber','rank',member->'contestantNumber','baseScore',member->'contestantNumber','finalScore',member->'contestantNumber'));
 END LOOP;
 input:=jsonb_build_object('rules',jsonb_build_object('id',state->'rules'->>'id','scoringConfig',jsonb_build_object('perDivision',true,'calculationMethod','weighted_average')));
 output:=jsonb_build_object('ready',true,'results',results,'divisionRanking',state->'divisionRanking');
 saved:=competition_child_official_calculate(f.event_id,f.child,f.actor,f.pre_id,digest,input,output);
 IF EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=(saved->>'calculationId')::uuid AND action='verify') THEN RAISE EXCEPTION 'UNEXPECTED_REVIEWER_VERIFICATION'; END IF;
 PERFORM competition_child_official_transition(f.event_id,f.child,f.actor,(saved->>'calculationId')::uuid,'finalize','Finalized preliminary calculation');
 state:=competition_child_tabulation_snapshot(f.event_id,f.child,f.actor,f.pre_id,false);
 IF state->>'sourceDigest'<>digest OR state->'calculation'->'finalized' IS DISTINCT FROM 'true'::jsonb
  OR state->'calculation'->'verified' IS DISTINCT FROM 'false'::jsonb
  OR state->'advancement'->'qualificationCurrent' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'DIRECT_FINALIZATION_FAILED_OR_DIGEST_CHANGED'; END IF;
 ctx:=competition_child_live_view(f.event_id,f.child,f.actor,f.final_id,true)->'context';
 BEGIN
  PERFORM competition_child_live_control(f.event_id,f.child,f.actor,f.final_id,'start',ctx||jsonb_build_object('requestId',gen_random_uuid()));
  RAISE EXCEPTION 'UNCONFIRMED_FINAL_STARTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CURRENT_CONFIRMED_QUALIFICATION_REQUIRED' THEN RAISE; END IF; END;
 qualified:=competition_child_division_qualifiers(results,jsonb_build_object('advancementType','top_n','advancementValue',1));
 IF jsonb_array_length(qualified)<>2 THEN RAISE EXCEPTION 'TOP_N_DIVISION_COUNT_INCORRECT'; END IF;
 q:=competition_child_confirm_qualification(f.event_id,f.child,f.actor,f.pre_id,(saved->>'calculationId')::uuid,digest,qualified,'Confirmed top one per division',true);
 state:=competition_child_tabulation_snapshot(f.event_id,f.child,f.actor,f.pre_id,false);
 IF state->'advancement'->'qualificationCurrent' IS DISTINCT FROM 'true'::jsonb OR jsonb_array_length(state->'advancement'->'qualifiedEntryIds')<>2 OR state->>'sourceDigest'<>digest THEN RAISE EXCEPTION 'CONFIRMATION_NOT_PERSISTENT_OR_DIGEST_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM competition_child_sessions WHERE competition_id=f.child AND round_id=f.final_id) THEN RAISE EXCEPTION 'CONFIRMATION_STARTED_FINAL_AUTOMATICALLY'; END IF;
 PERFORM competition_child_live_control(f.event_id,f.child,f.actor,f.final_id,'start',ctx||jsonb_build_object('requestId',gen_random_uuid()));
 IF NOT EXISTS(SELECT 1 FROM competition_child_sessions WHERE competition_id=f.child AND round_id=f.final_id AND status='active' AND jsonb_array_length(entry_ids)=2 AND entry_ids=qualified) THEN RAISE EXCEPTION 'FINAL_ROSTER_NOT_CONFIRMED_QUALIFIERS'; END IF;
 state:=competition_child_tabulation_snapshot(f.event_id,f.child,f.actor,f.pre_id,false);
 IF state->'advancement'->>'nextSessionStatus'<>'active' THEN RAISE EXCEPTION 'NEXT_SESSION_STATUS_INCORRECT'; END IF;
 source:=jsonb_build_object('id',f.pre_id,'displayOrder',0);
 target:=competition_child_next_round(jsonb_build_object('rounds',jsonb_build_array(source,jsonb_build_object('id','special','displayOrder',1,'purpose','special'),jsonb_build_object('id',f.final_id,'displayOrder',2))),source);
 IF target->>'id'<>f.final_id::text THEN RAISE EXCEPTION 'SPECIAL_ROUND_INTERCEPTED_MAIN_ADVANCEMENT'; END IF;
 ctx:=competition_child_live_view(f.event_id,f.child,f.actor,f.pre_id,true)->'context';
 PERFORM competition_child_live_control(f.event_id,f.child,f.actor,f.pre_id,'reopen',ctx||jsonb_build_object('requestId',gen_random_uuid(),'reason','Synthetic source correction','acknowledged',true));
 state:=competition_child_tabulation_snapshot(f.event_id,f.child,f.actor,f.pre_id,false);
 IF state->'advancement'->'qualificationCurrent' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'SOURCE_CORRECTION_RETAINED_READY_STATUS'; END IF;
 state:=competition_child_live_view(f.event_id,f.child,f.actor,f.final_id,true);
 IF state->'laterRoundBlocked' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'FINAL_NOT_BLOCKED_AFTER_SOURCE_CORRECTION'; END IF;
 RAISE NOTICE 'PASS direct organizer finalization without verification, 30/70 setup, explicit qualifier confirmation, next-round roster/status, special-round resolver and correction guards';
END $$;
