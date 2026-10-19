DO $$
DECLARE e uuid:=gen_random_uuid(); owner_id uuid:='10000000-0000-0000-0000-000000000001'; judge uuid:='10000000-0000-0000-0000-000000000002';
 junior uuid:=gen_random_uuid(); senior uuid:=gen_random_uuid(); foreign_div uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 pre uuid:=gen_random_uuid(); final_id uuid:=gen_random_uuid(); version uuid:=gen_random_uuid(); calculation uuid:=gen_random_uuid(); snapshot jsonb; source jsonb; reviewer uuid:='10000000-0000-0000-0000-000000000003';
BEGIN
 INSERT INTO events(id,organization_id,divisions_enabled) VALUES(e,'20000000-0000-0000-0000-000000000001',true);
 INSERT INTO competition_divisions(id,event_id) VALUES(junior,e),(senior,e),(foreign_div,'30000000-0000-0000-0000-000000000001');
 BEGIN INSERT INTO competition_contestants(id,event_id,name) VALUES(a,e,'Missing division');RAISE EXCEPTION 'Expected division requirement';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ENTRY_DIVISION_REQUIRED' THEN RAISE;END IF;END;
 BEGIN INSERT INTO competition_contestants(id,event_id,division_id,name) VALUES(a,e,foreign_div,'Wrong division');RAISE EXCEPTION 'Expected foreign division rejection';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'DIVISION_FORBIDDEN' THEN RAISE;END IF;END;
 INSERT INTO competition_contestants(id,event_id,division_id,name,entry_type) VALUES(a,e,junior,'Junior Ensemble','group'),(b,e,senior,'Open Masters','duo');
 INSERT INTO competition_rounds(id,event_id,name,display_order,division_id,workflow,advancement_type) VALUES(pre,e,'Initial',0,junior,'{"purpose":"qualification"}','manual'),(final_id,e,'Final',1,junior,'{"purpose":"final"}','none');
 BEGIN PERFORM competition_set_round_membership(e,owner_id,pre,b,true);RAISE EXCEPTION 'Expected scoped division eligibility';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ENTRY_DIVISION_NOT_ELIGIBLE' THEN RAISE;END IF;END;
 PERFORM competition_set_round_membership(e,owner_id,pre,a,true);
 IF EXISTS(SELECT 1 FROM competition_round_contestants WHERE round_id=final_id) THEN RAISE EXCEPTION 'Registration assigned Final';END IF;
 BEGIN UPDATE competition_contestants SET division_id=senior WHERE id=a;RAISE EXCEPTION 'Expected incompatible assignment protection';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'REMOVE_INCOMPATIBLE_ROUND_ASSIGNMENTS_FIRST' THEN RAISE;END IF;END;
 source:=competition_registration_source(e);
 snapshot:=jsonb_build_object('event',jsonb_build_object('id',e),'registrationSource',source,'criteriaSource',competition_criteria_source(e),
 'scoringConfig',jsonb_build_object('confirmed',true,'calculationMethod','manual','independentApproval',true,'verifierId',reviewer),'rounds',source->'rounds',
 'contestants',jsonb_build_array(jsonb_build_object('id',a,'divisionId',junior),jsonb_build_object('id',b,'divisionId',senior)));
 PERFORM competition_publish_rules(e,owner_id,version,snapshot);
 INSERT INTO event_participants(event_id,user_id,judge_role) VALUES(e,reviewer,'score_reviewer');
 INSERT INTO competition_result_calculations(id,event_id,round_id,rules_version,status,result_snapshot,created_by,source_digest) VALUES(calculation,e,pre,version,'ready_for_verification',jsonb_build_array(jsonb_build_object('contestantId',a,'rank',1,'manual',true)),owner_id,'fixture-digest');
 BEGIN PERFORM competition_confirm_advancement(e,owner_id,pre,final_id,calculation,ARRAY[a],'Manual selection');RAISE EXCEPTION 'Expected verifier approval';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VERIFIED_ROUND_REQUIRED' THEN RAISE;END IF;END;
 BEGIN PERFORM competition_result_transition(e,owner_id,calculation,'verify','fixture-digest','Self approval');RAISE EXCEPTION 'Expected independent reviewer';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INDEPENDENT_APPROVAL_REQUIRED' THEN RAISE;END IF;END;
 PERFORM competition_result_transition(e,reviewer,calculation,'verify','fixture-digest','Approved manual placements');
 BEGIN PERFORM competition_confirm_advancement(e,owner_id,pre,final_id,calculation,ARRAY[a],'');RAISE EXCEPTION 'Expected manual reason';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MANUAL_QUALIFICATION_REASON_REQUIRED' THEN RAISE;END IF;END;
 PERFORM competition_confirm_advancement(e,owner_id,pre,final_id,calculation,ARRAY[a],'Official manual seeding from verified placement source');
 IF NOT EXISTS(SELECT 1 FROM competition_advancement_decisions WHERE event_id=e AND selection_basis='manual' AND automatic_qualifiers='[]' AND qualifiers=jsonb_build_array(a)) THEN RAISE EXCEPTION 'Manual provenance missing';END IF;
 IF (SELECT count(*) FROM competition_round_contestants WHERE round_id=final_id)<>1 THEN RAISE EXCEPTION 'Approved manual qualifier missing';END IF;
 RAISE NOTICE 'PASS: custom divisions, required selection, scoped initial eligibility, no automatic Final assignment, verified/reasoned manual qualification and distinct provenance';
END;$$;
