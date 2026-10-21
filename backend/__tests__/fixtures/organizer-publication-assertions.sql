DO $$
DECLARE f round_advancement_fixture; state jsonb; member jsonb; results jsonb:='[]'; input jsonb;
 saved jsonb; body jsonb; publication jsonb; replay jsonb; qualified jsonb; sheet jsonb;
 judge uuid; criterion uuid; entry uuid; role_name text;
BEGIN
 SELECT * INTO f FROM round_advancement_fixture;
 UPDATE events SET status='active' WHERE id=f.event_id;
 SELECT user_id INTO judge FROM event_participants WHERE event_id=f.event_id AND judge_role='judge';
 -- Division evidence changes the digest from the old verified calculation.
 state:=competition_child_tabulation_snapshot(f.event_id,f.child,f.actor,f.pre_id,false);
 FOR member IN SELECT value FROM jsonb_array_elements(state->'divisionRanking'->'entries') LOOP
  results:=results||jsonb_build_array(jsonb_build_object('contestantId',member->>'entryId','divisionId',member->>'divisionId','divisionName',member->>'divisionName','contestantNumber',member->'contestantNumber','rank',member->'contestantNumber','baseScore',90,'finalScore',90));
 END LOOP;
 input:=jsonb_build_object('rules',jsonb_build_object('id',state->'rules'->>'id','scoringConfig',jsonb_build_object('perDivision',true,'calculationMethod','weighted_average')));
 saved:=competition_child_official_calculate(f.event_id,f.child,f.actor,f.pre_id,state->>'sourceDigest',input,jsonb_build_object('ready',true,'results',results,'divisionRanking',state->'divisionRanking'));
 body:=jsonb_build_object('requestId',gen_random_uuid(),'calculationId',saved->>'calculationId','sourceDigest',state->>'sourceDigest','expectedPublicationVersion',0,'reason','Explicit organizer publication','acknowledged',true);
 BEGIN
  PERFORM competition_child_publication_action(f.event_id,f.child,f.actor,f.pre_id,'publish',body);
  RAISE EXCEPTION 'UNFINALIZED_PUBLICATION_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CURRENT_COMPLETE_FINALIZED_PUBLICATION_REQUIRED' THEN RAISE; END IF; END;
 PERFORM competition_child_official_transition(f.event_id,f.child,f.actor,(saved->>'calculationId')::uuid,'finalize','Organizer approved preliminary');
 state:=competition_child_tabulation_snapshot(f.event_id,f.child,f.actor,f.pre_id,false);
 IF state->'calculation'->'verified' IS DISTINCT FROM 'false'::jsonb
  OR NOT competition_native_round_completion_ready(f.event_id,f.child,f.actor,f.pre_id,false)
  OR competition_native_round_completion_ready(f.event_id,f.child,f.actor,f.pre_id,true)
 THEN RAISE EXCEPTION 'OPTIONAL_VERIFICATION_OR_PUBLICATION_READINESS_INCORRECT'; END IF;
 BEGIN
  PERFORM competition_child_publication_action(f.event_id,f.child,judge,f.pre_id,'publish',body);
  RAISE EXCEPTION 'JUDGE_PUBLISHED_ORGANIZER_RESULTS';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ORGANIZER_FORBIDDEN' THEN RAISE; END IF; END;
 publication:=competition_child_publication_action(f.event_id,f.child,f.actor,f.pre_id,'publish',body);
 replay:=competition_child_publication_action(f.event_id,f.child,f.actor,f.pre_id,'publish',body);
 IF publication IS DISTINCT FROM replay OR NOT competition_native_round_completion_ready(f.event_id,f.child,f.actor,f.pre_id,true)
  OR competition_native_event_completion_ready(f.event_id,f.actor)
 THEN RAISE EXCEPTION 'PUBLICATION_RETRY_OR_TERMINAL_ROUND_GATE_INCORRECT'; END IF;
 BEGIN
  PERFORM competition_child_publication_action(f.event_id,f.child,f.actor,f.pre_id,'replace',body||jsonb_build_object('requestId',gen_random_uuid(),'expectedPublicationVersion',1,'sourceDigest',repeat('0',64)));
  RAISE EXCEPTION 'STALE_DIGEST_PUBLICATION_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CURRENT_COMPLETE_FINALIZED_PUBLICATION_REQUIRED' THEN RAISE; END IF; END;
 BEGIN
  PERFORM competition_child_publication_action(f.event_id,f.child,f.actor,f.pre_id,'replace',body||jsonb_build_object('requestId',gen_random_uuid()));
  RAISE EXCEPTION 'STALE_PUBLICATION_VERSION_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PUBLICATION_VERSION_CONFLICT' THEN RAISE; END IF; END;
 qualified:=competition_child_division_qualifiers(results,jsonb_build_object('advancementType','top_n','advancementValue',1));
 PERFORM competition_child_confirm_qualification(f.event_id,f.child,f.actor,f.pre_id,(saved->>'calculationId')::uuid,state->>'sourceDigest',qualified,'Confirmed top entrant per division',true);
 sheet:=competition_child_live_view(f.event_id,f.child,f.actor,f.final_id,true);
 PERFORM competition_child_live_control(f.event_id,f.child,f.actor,f.final_id,'start',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid()));
 sheet:=competition_child_live_view(f.event_id,f.child,f.actor,f.final_id,true);
 criterion:=(sheet->'criteria'->0->>'id')::uuid;
 PERFORM competition_child_live_control(f.event_id,f.child,f.actor,f.final_id,'access',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid(),'kind','criterion','targetId',criterion,'open',true));
 FOR entry IN SELECT value::uuid FROM jsonb_array_elements_text(qualified) LOOP
  sheet:=competition_child_live_view(f.event_id,f.child,f.actor,f.final_id,true);
  PERFORM competition_child_live_control(f.event_id,f.child,f.actor,f.final_id,'access',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid(),'kind','entry','targetId',entry,'open',true));
  sheet:=competition_child_live_view(f.event_id,f.child,judge,f.final_id,false);
  PERFORM competition_child_score_write(f.event_id,f.child,judge,f.final_id,'lock',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid(),'entryId',entry,'criterionId',criterion,'rowRevision',0,'scores',jsonb_build_object(criterion::text,9)));
 END LOOP;
 sheet:=competition_child_live_view(f.event_id,f.child,judge,f.final_id,false);
 PERFORM competition_child_score_write(f.event_id,f.child,judge,f.final_id,'submit',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid()));
 sheet:=competition_child_live_view(f.event_id,f.child,f.actor,f.final_id,true);
 PERFORM competition_child_live_control(f.event_id,f.child,f.actor,f.final_id,'close',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid()));
 state:=competition_child_tabulation_snapshot(f.event_id,f.child,f.actor,f.final_id,false);
 SELECT jsonb_agg(r) INTO results FROM jsonb_array_elements(results) r WHERE qualified ? (r->>'contestantId');
 saved:=competition_child_official_calculate(f.event_id,f.child,f.actor,f.final_id,state->>'sourceDigest',input,jsonb_build_object('ready',true,'results',results,'divisionRanking',state->'divisionRanking'));
 PERFORM competition_child_official_transition(f.event_id,f.child,f.actor,(saved->>'calculationId')::uuid,'finalize','Organizer approved final results');
 body:=jsonb_build_object('requestId',gen_random_uuid(),'calculationId',saved->>'calculationId','sourceDigest',state->>'sourceDigest','expectedPublicationVersion',0,'reason','Explicit final result publication','acknowledged',true);
 PERFORM competition_child_publication_action(f.event_id,f.child,f.actor,f.final_id,'publish',body);
 IF NOT competition_native_event_completion_ready(f.event_id,f.actor)
  OR NOT EXISTS(SELECT 1 FROM events WHERE id=f.event_id AND status::text='completed')
  OR EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=(saved->>'calculationId')::uuid AND action='verify')
 THEN RAISE EXCEPTION 'UNVERIFIED_FINAL_PUBLICATION_DID_NOT_COMPLETE_EVENT'; END IF;
 IF jsonb_array_length(competition_child_public_results(f.event_id,f.child,f.final_id)->'results'->'standings')<>2 THEN RAISE EXCEPTION 'FINAL_PUBLIC_STANDINGS_MISSING'; END IF;
 body:=body||jsonb_build_object('requestId',gen_random_uuid(),'expectedPublicationVersion',1);
 PERFORM competition_child_publication_action(f.event_id,f.child,f.actor,f.final_id,'withdraw',body);
 IF competition_native_event_completion_ready(f.event_id,f.actor)
  OR NOT EXISTS(SELECT 1 FROM events WHERE id=f.event_id AND status::text='active')
 THEN RAISE EXCEPTION 'WITHDRAWAL_DID_NOT_REOPEN_EVENT'; END IF;
 body:=body||jsonb_build_object('requestId',gen_random_uuid(),'expectedPublicationVersion',2);
 sheet:=competition_child_live_view(f.event_id,f.child,f.actor,f.final_id,true);
 PERFORM competition_child_live_control(f.event_id,f.child,f.actor,f.final_id,'reopen',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid(),'reason','Correcting final source scores','acknowledged',true));
 IF competition_native_round_completion_ready(f.event_id,f.child,f.actor,f.final_id,true) THEN RAISE EXCEPTION 'REOPENED_SCORING_REMAINS_READY'; END IF;
 BEGIN
  PERFORM competition_child_publication_action(f.event_id,f.child,f.actor,f.final_id,'publish',body);
  RAISE EXCEPTION 'REOPENED_RESULTS_PUBLISHED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CURRENT_COMPLETE_FINALIZED_PUBLICATION_REQUIRED' THEN RAISE; END IF; END;
 -- Internal helpers stay inaccessible through API roles; the public entrypoint remains service-only.
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(role_name,'competition_child_publication_action_v129(uuid,uuid,uuid,uuid,text,jsonb)','EXECUTE')
   OR has_function_privilege(role_name,'competition_native_round_completion_ready(uuid,uuid,uuid,uuid,boolean)','EXECUTE')
  THEN RAISE EXCEPTION 'PRIVATE_PUBLICATION_HELPER_EXPOSED'; END IF;
 END LOOP;
 IF NOT has_function_privilege('service_role','competition_child_publication_action(uuid,uuid,uuid,uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'PUBLICATION_ENTRYPOINT_NOT_GRANTED'; END IF;
 RAISE NOTICE 'PASS organizer-only preliminary/final publication, optional verification, qualification, event completion, withdrawal, idempotency, stale guards and helper ACLs';
END $$;
