CREATE TEMP TABLE pageant_division_fixture(event_id uuid,child uuid,actor uuid,old_calc jsonb,old_digest text);
DO $$
DECLARE actor uuid; org uuid; judge uuid; reviewer uuid; reviewer_ep uuid; event_id uuid; child uuid:=gen_random_uuid(); ev jsonb; master uuid; ep uuid; division uuid; entry uuid; criterion uuid:=gen_random_uuid(); cfg jsonb; c competitions; sheet jsonb; state jsonb; result jsonb; results jsonb:='[]'; n integer; sex integer; old_calc jsonb;
BEGIN
 SELECT o.organizer_id,o.id INTO actor,org FROM organizations o JOIN users u ON u.id=o.organizer_id WHERE u.role::text='organizer' AND u.account_status::text='active' LIMIT 1;
 SELECT id INTO judge FROM users WHERE role::text IN('voter','participant') AND account_status::text='active' LIMIT 1;
 IF actor IS NULL OR judge IS NULL THEN RAISE EXCEPTION 'SYNTHETIC_TEST_ACCOUNTS_REQUIRED'; END IF;
 ev:=competition_create_event(actor,org,gen_random_uuid(),jsonb_build_object('title','Isolated Pageant division test','start_date','2030-01-10T09:00:00Z','end_date','2030-01-11T17:00:00Z','competition_type','pageant'));
 event_id:=(ev->>'id')::uuid;
 UPDATE events SET divisions_enabled=true WHERE id=event_id;
 PERFORM competition_create_child(event_id,actor,child,'Pageant','pageant');
 FOR sex IN 0..1 LOOP
  INSERT INTO competition_divisions(event_id,name,display_order) VALUES(event_id,CASE WHEN sex=0 THEN 'MEN' ELSE 'WOMEN' END,sex) RETURNING id INTO division;
  FOR n IN 1..2 LOOP
   INSERT INTO competition_contestants(event_id,division_id,name,contestant_number) VALUES(event_id,division,'Test entrant '||sex||'-'||n,n) RETURNING id INTO master;
   PERFORM competition_add_entry(event_id,actor,child,master,NULL);
  END LOOP;
 END LOOP;
 INSERT INTO event_participants(event_id,user_id,participant_type,judge_role,is_active) VALUES(event_id,judge,'COMPETITION_JUDGE','judge',true) RETURNING id INTO ep;
 cfg:=jsonb_build_object('structure','single','rounds','[]'::jsonb,'criteria',jsonb_build_array(jsonb_build_object('id',criterion,'name','Performance','roundId',NULL,'percentage',100,'minScore',1,'maxScore',10,'minorCriteria','[]'::jsonb)),'scoringConfig',jsonb_build_object('calculationMethod','rank_based','tiePolicy','shared','deductionMode','none','deductionRules','[]'::jsonb));
 SELECT * INTO c FROM competitions WHERE id=child;
 PERFORM competition_save_native_configuration(event_id,child,actor,c.setup_revision,cfg);
 PERFORM competition_assign_native_judge(event_id,child,actor,ep,NULL,false);
 SELECT * INTO c FROM competitions WHERE id=child;
 PERFORM competition_freeze_native_rules(event_id,child,actor,c.setup_revision,c.input_revision);
 PERFORM competition_complete_creation(event_id,actor,jsonb_build_array(jsonb_build_object('id',child,'setupRevision',c.setup_revision,'inputRevision',c.input_revision)),competition_parent_review_token((SELECT e FROM events e WHERE e.id=event_id)));
 sheet:=competition_child_live_view(event_id,child,actor,NULL,true);
 PERFORM competition_child_live_control(event_id,child,actor,NULL,'start',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid()));
 sheet:=competition_child_live_view(event_id,child,actor,NULL,true);
 PERFORM competition_child_live_control(event_id,child,actor,NULL,'access',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid(),'kind','criterion','targetId',criterion,'open',true));
 n:=0;
 FOR entry IN SELECT id FROM competition_entries WHERE competition_id=child ORDER BY entry_number LOOP
  n:=n+1;
  sheet:=competition_child_live_view(event_id,child,actor,NULL,true);
  PERFORM competition_child_live_control(event_id,child,actor,NULL,'access',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid(),'kind','entry','targetId',entry,'open',true));
  sheet:=competition_child_live_view(event_id,child,judge,NULL,false);
  PERFORM competition_child_score_write(event_id,child,judge,NULL,'lock',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid(),'entryId',entry,'criterionId',criterion,'rowRevision',0,'scores',jsonb_build_object(criterion::text,10-n)));
  results:=results||jsonb_build_array(jsonb_build_object('contestantId',entry,'rank',n,'baseScore',n,'finalScore',n));
 END LOOP;
 sheet:=competition_child_live_view(event_id,child,judge,NULL,false);
 PERFORM competition_child_score_write(event_id,child,judge,NULL,'submit',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid()));
 sheet:=competition_child_live_view(event_id,child,actor,NULL,true);
 PERFORM competition_child_live_control(event_id,child,actor,NULL,'close',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid()));
 state:=competition_child_tabulation_snapshot(event_id,child,actor,NULL,false);
 result:=competition_child_official_calculate(event_id,child,actor,NULL,state->>'sourceDigest',jsonb_build_object('rules',jsonb_build_object('id',state->'rules'->>'id')),jsonb_build_object('ready',true,'results',results));
 SELECT id INTO reviewer FROM users WHERE role::text IN('voter','participant') AND account_status::text='active' AND id<>judge LIMIT 1;
 INSERT INTO event_participants(event_id,user_id,participant_type,judge_role,is_active) VALUES(event_id,reviewer,'COMPETITION_JUDGE','score_reviewer',true) RETURNING id INTO reviewer_ep;
 PERFORM competition_child_appoint_reviewer(event_id,child,actor,reviewer_ep);
 PERFORM competition_child_official_transition(event_id,child,reviewer,(result->>'calculationId')::uuid,'verify','Independent synthetic review');
 PERFORM competition_child_official_transition(event_id,child,actor,(result->>'calculationId')::uuid,'finalize','Explicit synthetic finalization');
 SELECT to_jsonb(calc) INTO old_calc FROM competition_child_calculations calc WHERE id=(result->>'calculationId')::uuid;
 INSERT INTO pageant_division_fixture VALUES(event_id,child,actor,old_calc,state->>'sourceDigest');
END $$;
