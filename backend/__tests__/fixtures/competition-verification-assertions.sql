\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE owner_id uuid:='11000000-0000-0000-0000-000000000001'; judge_id uuid:='11000000-0000-0000-0000-000000000002'; reviewer uuid:='11000000-0000-0000-0000-000000000003';
 event_id uuid:='21000000-0000-0000-0000-000000000001'; pre uuid:='31000000-0000-0000-0000-000000000001'; fin uuid:='31000000-0000-0000-0000-000000000002';
 entry_id uuid:='41000000-0000-0000-0000-000000000001'; other_entry uuid:='41000000-0000-0000-0000-000000000002'; crit uuid:='51000000-0000-0000-0000-000000000001';
 rule_id uuid:='71000000-0000-0000-0000-000000000001'; calc uuid; global_calc uuid; live_session jsonb; deduction uuid; result jsonb; failed boolean; amendment uuid;
BEGIN
 INSERT INTO users(id,role) VALUES(owner_id,'organizer'),(judge_id,'participant'),(reviewer,'participant');
 INSERT INTO organizations(id,organizer_id) VALUES(event_id,owner_id);INSERT INTO events(id,organization_id) VALUES(event_id,event_id);
 INSERT INTO competition_rounds(id,event_id,name,display_order) VALUES(pre,event_id,'Qualification',0),(fin,event_id,'Final',1);
 INSERT INTO competition_contestants(id,event_id) VALUES(entry_id,event_id),(other_entry,event_id);
 INSERT INTO competition_criteria(id,event_id) VALUES(crit,event_id);
 INSERT INTO competition_round_contestants(round_id,contestant_id) VALUES(fin,entry_id),(fin,other_entry);
 INSERT INTO event_participants(event_id,user_id,judge_role) VALUES(event_id,judge_id,'judge'),(event_id,reviewer,'score_reviewer');
 PERFORM competition_publish_rules(event_id,owner_id,rule_id,jsonb_build_object('scoringConfig',jsonb_build_object('confirmed',true,'calculationMethod','weighted_average','independentApproval',true,'verifierId',reviewer),'judges',jsonb_build_array(jsonb_build_object('judgeId',judge_id)),'rounds','[]'::jsonb,'contestants','[]'::jsonb,'criteria','[]'::jsonb));
 INSERT INTO competition_result_calculations(event_id,round_id,status,rules_version,source_digest,source_versions,result_snapshot,configuration_snapshot,created_by)
 VALUES(event_id,pre,'ready_for_verification',rule_id,'digest','[]',jsonb_build_array(jsonb_build_object('contestantId',entry_id,'rank',1,'finalScore',90)),'{}',owner_id) RETURNING id INTO calc;
 failed:=false;BEGIN PERFORM competition_result_transition(event_id,owner_id,calc,'verify','digest','Own review');EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='INDEPENDENT_APPROVAL_REQUIRED';END;
 IF NOT failed THEN RAISE EXCEPTION 'Creator approved own independent result'; END IF;
 PERFORM competition_result_transition(event_id,reviewer,calc,'verify','digest','Reviewed sources');
 PERFORM competition_result_transition(event_id,owner_id,calc,'finalize','digest','');
 result:=competition_confirm_advancement(event_id,owner_id,pre,fin,calc,ARRAY[entry_id],'Top qualifier reviewed');
 IF (SELECT count(*) FROM competition_round_contestants WHERE round_id=fin)<>1 OR NOT EXISTS(SELECT 1 FROM competition_round_contestants WHERE round_id=fin AND contestant_id=entry_id) THEN RAISE EXCEPTION 'Nonqualifying memberships retained';END IF;
 failed:=false;BEGIN PERFORM competition_confirm_advancement(event_id,owner_id,pre,fin,calc,ARRAY[other_entry],'Silently replace');EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='AUTHORIZED_ADVANCEMENT_AMENDMENT_REQUIRED';END;
 IF NOT failed THEN RAISE EXCEPTION 'Official advancement silently replaced'; END IF;
 INSERT INTO competition_deductions(event_id,contestant_id,rules_version,rule_id,amount,reason,applied_by_user_id,decision_status,offense_key) VALUES(event_id,entry_id,rule_id,'rule',2,'Offense',owner_id,'pending','case-1') RETURNING id INTO deduction;
 PERFORM competition_approve_decision(event_id,reviewer,'deduction',deduction,'Evidence checked');
 failed:=false;BEGIN INSERT INTO competition_deductions(event_id,contestant_id,rules_version,rule_id,amount,reason,applied_by_user_id,decision_status,offense_key) VALUES(event_id,entry_id,rule_id,'rule',2,'Duplicate',owner_id,'pending','case-1');EXCEPTION WHEN unique_violation THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Same offense double-counted'; END IF;
 live_session:=competition_operational_action(event_id,owner_id,NULL,'start','{}');
 INSERT INTO competition_result_calculations(event_id,status,rules_version,source_digest,source_versions,result_snapshot,configuration_snapshot,created_by) VALUES(event_id,'ready_for_verification',rule_id,'global','[]',jsonb_build_array(jsonb_build_object('contestantId',entry_id,'rank',1,'finalScore',90)),'{}',owner_id) RETURNING id INTO global_calc;
 PERFORM competition_result_transition(event_id,reviewer,global_calc,'verify','global','Final review');
 PERFORM competition_result_transition(event_id,owner_id,global_calc,'finalize','global','');
 PERFORM competition_result_transition(event_id,owner_id,global_calc,'publish','global','Release official results');
 IF (SELECT status FROM competition_sessions WHERE id=(live_session->>'id')::uuid)<>'completed' OR (SELECT submission_window FROM competition_sessions WHERE id=(live_session->>'id')::uuid) THEN RAISE EXCEPTION 'Publication left live scoring/submission access open'; END IF;
 IF (SELECT status FROM events WHERE id=event_id)<>'completed' THEN RAISE EXCEPTION 'Publication did not complete the event'; END IF;
 INSERT INTO competition_rule_amendments(event_id,previous_rules,proposed_config,reason,requested_by) VALUES(event_id,rule_id,jsonb_build_object('confirmed',true,'calculationMethod','sum','verifierId',reviewer),'Authorized corrected method; rejudging required',owner_id) RETURNING id INTO amendment;
 result:=competition_approve_amendment(amendment,reviewer,'Independent approval');
 failed:=false;BEGIN PERFORM competition_result_transition(event_id,owner_id,calc,'publish','digest','Old version replay');EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='STALE_CALCULATION';END;
 IF NOT failed THEN RAISE EXCEPTION 'Old rule version was published after an amendment'; END IF;
 IF (SELECT count(*) FROM competition_rule_versions WHERE id=(result->>'rulesVersion')::uuid)<>1 THEN RAISE EXCEPTION 'Amendment version absent'; END IF;
 IF (SELECT result_snapshot FROM competition_result_calculations WHERE id=calc)->0->>'finalScore'<>'90' THEN RAISE EXCEPTION 'Historical result modified'; END IF;
 RAISE NOTICE 'PASS: independent verification, finalize, transactional qualifier roster replacement, decision preservation, approved penalties, duplicate offense rejection, immutable amendment history';
END $$;
ROLLBACK;
