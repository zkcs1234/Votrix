DO $$
DECLARE e uuid:='30000000-0000-0000-0000-000000000001'; owner_id uuid:='10000000-0000-0000-0000-000000000001'; judge uuid:='10000000-0000-0000-0000-000000000002';
 pre uuid:='50000000-0000-0000-0000-000000000001'; final_id uuid:='50000000-0000-0000-0000-000000000002'; criterion uuid:='60000000-0000-0000-0000-000000000001';
 version uuid:=gen_random_uuid(); session_id uuid; calculation uuid:=gen_random_uuid(); snapshot jsonb; result jsonb; context jsonb; qualifiers uuid[]; entry uuid:='40000000-0000-0000-0000-000000000001'; eliminated uuid:='40000000-0000-0000-0000-000000000007'; previous jsonb;
BEGIN
 IF (SELECT count(*) FROM competition_round_contestants WHERE round_id=final_id)<>7 THEN RAISE EXCEPTION 'History altered by migration'; END IF;
 BEGIN PERFORM competition_set_round_membership(e,owner_id,final_id,entry,true);RAISE EXCEPTION 'Expected protection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'PROTECTED_ROUND_ASSIGNMENT%' THEN RAISE; END IF; END;
 BEGIN DELETE FROM competition_round_contestants WHERE round_id=final_id;RAISE EXCEPTION 'Expected direct protection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'PROTECTED_ROUND_ASSIGNMENT%' THEN RAISE; END IF; END;
 BEGIN PERFORM competition_set_round_membership(e,judge,pre,entry,true);RAISE EXCEPTION 'Expected owner authorization'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ORGANIZER_FORBIDDEN' THEN RAISE; END IF; END;
 PERFORM competition_set_round_membership(e,owner_id,pre,entry,false);PERFORM competition_set_round_membership(e,owner_id,pre,entry,true);
 SELECT jsonb_build_object('event',jsonb_build_object('id',e),'registrationSource',competition_registration_source(e),'criteriaSource',competition_criteria_source(e),
 'scoringConfig','{"confirmed":true,"calculationMethod":"weighted_average","independentApproval":false}'::jsonb,
 'contestants',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'divisionId',division_id)) FROM competition_contestants WHERE event_id=e),
 'criteria',jsonb_build_array(jsonb_build_object('id',criterion,'name','Quality','isActive',true,'percentage',100,'minScore',0,'maxScore',100,'minorCriteria','[]'::jsonb)),
 'judges',jsonb_build_array(jsonb_build_object('judgeId',judge,'role','judge')),
 'rounds',(SELECT jsonb_agg(r||jsonb_build_object('criteriaIds',jsonb_build_array(criterion))) FROM jsonb_array_elements(competition_registration_source(e)->'rounds') r)) INTO snapshot;
 BEGIN PERFORM competition_publish_rules(e,owner_id,version,snapshot||jsonb_build_object('registrationSource','{}'::jsonb)); RAISE EXCEPTION 'Expected stale source'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'REGISTRATION_SETUP_CHANGED_REFRESH' THEN RAISE; END IF; END;
 PERFORM competition_publish_rules(e,owner_id,version,snapshot);
 SELECT (competition_operational_action(e,owner_id,NULL,'start','{}')->>'id')::uuid INTO session_id;
 context:=jsonb_build_object('sessionId',session_id,'judgeId',judge,'rulesVersion',version,'roundId',pre);
 BEGIN PERFORM competition_operational_action(e,owner_id,session_id,'round',jsonb_build_object('roundId',final_id));RAISE EXCEPTION 'Expected qualification'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'QUALIFICATION_NOT_CONFIRMED%' THEN RAISE; END IF; END;
 BEGIN INSERT INTO competition_scores(judge_id,contestant_id,criteria_id,round_id,score) VALUES(judge,entry,criterion,final_id,90);RAISE EXCEPTION 'Expected score protection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'QUALIFICATION_NOT_CONFIRMED%' THEN RAISE; END IF; END;
 PERFORM competition_scoring_write(e,judge,context,'lock',jsonb_build_object('criteriaId',criterion,'contestantId',entry,'scores',jsonb_build_object(criterion::text,90)));
 SELECT to_jsonb(s) INTO previous FROM competition_session_judge_scores s WHERE s.contestant_id=entry;
 SELECT jsonb_agg(jsonb_build_object('contestantId',id,'rank',CASE WHEN contestant_number=6 THEN 5 ELSE contestant_number END,'finalScore',100-contestant_number)) INTO result FROM competition_contestants WHERE event_id=e;
 INSERT INTO competition_result_calculations(id,event_id,session_id,round_id,rules_version,status,verified_at,verified_by,result_snapshot) VALUES(calculation,e,session_id,pre,version,'under_verification',now(),judge,result);
 SELECT array_agg(id ORDER BY id) INTO qualifiers FROM competition_contestants WHERE event_id=e AND contestant_number<=6;
 BEGIN PERFORM competition_confirm_advancement(e,owner_id,pre,final_id,calculation,qualifiers[1:5],'Top 5');RAISE EXCEPTION 'Expected cutoff tie protection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MANUAL_SEEDING_NOT_PERMITTED_BY_RULES' THEN RAISE; END IF; END;
 PERFORM competition_confirm_advancement(e,owner_id,pre,final_id,calculation,qualifiers,'Top 5 includes the cutoff tie');
 IF (SELECT count(*) FROM competition_round_contestants WHERE round_id=final_id)<>6 THEN RAISE EXCEPTION 'Cutoff tie not retained'; END IF;
 IF NOT EXISTS(SELECT 1 FROM competition_advancement_decisions WHERE round_id=pre AND selection_basis='automatic' AND jsonb_array_length(automatic_qualifiers)=6) THEN RAISE EXCEPTION 'Decision provenance missing'; END IF;
 IF previous IS DISTINCT FROM (SELECT to_jsonb(s) FROM competition_session_judge_scores s WHERE s.contestant_id=entry) THEN RAISE EXCEPTION 'Historical score rewritten'; END IF;
 PERFORM competition_operational_action(e,owner_id,session_id,'round',jsonb_build_object('roundId',final_id));
 context:=context||jsonb_build_object('roundId',final_id);
 BEGIN PERFORM competition_scoring_write(e,judge,context,'lock',jsonb_build_object('criteriaId',criterion,'contestantId',eliminated,'scores',jsonb_build_object(criterion::text,90)));RAISE EXCEPTION 'Expected eliminated entry protection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ENTRY_NOT_QUALIFIED_FOR_ROUND' THEN RAISE; END IF; END;
 PERFORM competition_scoring_write(e,judge,context,'lock',jsonb_build_object('criteriaId',criterion,'contestantId',entry,'scores',jsonb_build_object(criterion::text,88)));
 BEGIN DELETE FROM competition_contestants WHERE id=entry;RAISE EXCEPTION 'Expected historical preservation'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'HISTORICAL_ENTRY_MUST_BE_PRESERVED' THEN RAISE; END IF; END;
 BEGIN PERFORM competition_operational_action(e,owner_id,session_id,'round',jsonb_build_object('roundId',pre));PERFORM competition_operational_action(e,owner_id,session_id,'correction',jsonb_build_object('contestantId',entry,'reason','Correction','confirmed',true));RAISE EXCEPTION 'Expected advancement correction guard'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'AUTHORIZED_ADVANCEMENT_AMENDMENT_REQUIRED' THEN RAISE; END IF; END;
 IF has_function_privilege('service_role','competition_scoring_write_v095(uuid,uuid,jsonb,text,jsonb)','execute') THEN RAISE EXCEPTION 'Old scoring function remains callable'; END IF;
 RAISE NOTICE 'PASS: protected assignments, owner checks, stale publication, no unqualified scoring, Top 5 cutoff tie, provenance and history preservation';
END; $$;
