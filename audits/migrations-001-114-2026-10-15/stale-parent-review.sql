-- Synthetic isolated database only. Every test record rolls back.
BEGIN;
DO $$
DECLARE actor uuid; org uuid; judge uuid; ev jsonb; c1 jsonb; c2 jsonb; c3 jsonb; master uuid; ep uuid;
 cfg jsonb; criterion uuid:=gen_random_uuid(); minor1 uuid:=gen_random_uuid(); minor2 uuid:=gen_random_uuid();
 event_id uuid; child1 uuid:=gen_random_uuid(); child2 uuid:=gen_random_uuid(); child3 uuid:=gen_random_uuid(); reviewed jsonb; result jsonb;
BEGIN
 SELECT o.organizer_id,o.id INTO actor,org FROM organizations o JOIN users u ON u.id=o.organizer_id WHERE u.role::text='organizer' AND u.account_status::text='active' LIMIT 1;
 SELECT id INTO judge FROM users WHERE role::text IN('voter','participant') AND account_status::text='active' LIMIT 1;
 IF actor IS NULL OR judge IS NULL THEN RAISE EXCEPTION 'SYNTHETIC_TEST_ACCOUNTS_REQUIRED'; END IF;
 ev:=competition_create_event(actor,org,gen_random_uuid(),jsonb_build_object('title','Creation transaction test','start_date','2030-01-10T09:00:00Z','end_date','2030-01-11T17:00:00Z','competition_type','dance'));
 event_id:=(ev->>'id')::uuid;
 c1:=competition_create_child(event_id,actor,child1,'Contemporary Dance','dance');
 c2:=competition_create_child(event_id,actor,child2,'Hip-Hop','dance');
 c3:=competition_create_child(event_id,actor,child3,'Removed draft','dance');
 INSERT INTO competition_contestants(event_id,name,contestant_number) VALUES(event_id,'Shared entrant',1) RETURNING id INTO master;
 PERFORM competition_add_entry(event_id,actor,child1,master,NULL);
 PERFORM competition_add_entry(event_id,actor,child2,master,NULL);
 PERFORM competition_add_entry(event_id,actor,child3,master,NULL);
 INSERT INTO event_participants(event_id,user_id,participant_type,judge_role,is_active) VALUES(event_id,judge,'COMPETITION_JUDGE','judge',true) RETURNING id INTO ep;
 BEGIN
  PERFORM competition_assign_native_judge(event_id,child1,actor,ep,NULL,false);
  RAISE EXCEPTION 'UNCONFIGURED_JUDGE_ASSIGNMENT_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'INVALID_NATIVE_CONFIGURATION' THEN RAISE; END IF; END;
 cfg:=jsonb_build_object('structure','single','rounds','[]'::jsonb,'criteria',jsonb_build_array(jsonb_build_object('id',criterion,'name','Performance','roundId',NULL,'percentage',100,'minScore',1,'maxScore',10,'minorCriteria',jsonb_build_array(jsonb_build_object('id',minor1,'name','Technique','minScore',1,'maxScore',10,'percentage',20),jsonb_build_object('id',minor2,'name','Impact','minScore',1,'maxScore',10,'percentage',80)))),'scoringConfig',jsonb_build_object('calculationMethod','weighted_average','tiePolicy','shared'));
 SELECT to_jsonb(c) INTO c1 FROM competitions c WHERE id=child1;
 PERFORM competition_save_native_configuration(event_id,child1,actor,(c1->>'setup_revision')::bigint,cfg);
 PERFORM competition_assign_native_judge(event_id,child1,actor,ep,NULL,false);
 SELECT to_jsonb(c) INTO c3 FROM competitions c WHERE id=child3;
 PERFORM competition_remove_draft_child(event_id,child3,actor,(c3->>'setup_revision')::bigint,(c3->>'input_revision')::bigint);
 IF EXISTS(SELECT 1 FROM competition_entries WHERE competition_id=child3) OR NOT EXISTS(SELECT 1 FROM competition_entries WHERE competition_id=child1 AND contestant_id=master) OR NOT EXISTS(SELECT 1 FROM competition_contestants WHERE id=master) THEN RAISE EXCEPTION 'DRAFT_REMOVAL_ISOLATION_FAILED'; END IF;
 -- Avoid variable/column ambiguity by explicit alias comparisons below.
 SELECT jsonb_agg(jsonb_build_object('id',c.id,'setupRevision',c.setup_revision,'inputRevision',c.input_revision)) INTO reviewed FROM competitions c WHERE c.id IN(child1,child2);
 BEGIN
  PERFORM competition_complete_creation(event_id,actor,reviewed);
  RAISE EXCEPTION 'INCOMPLETE_BRANCH_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='INCOMPLETE_BRANCH_ACCEPTED' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM competitions c WHERE c.id IN(child1,child2) AND c.official_child_rules_id IS NOT NULL) THEN RAISE EXCEPTION 'PARTIAL_FREEZE_NOT_ROLLED_BACK'; END IF;
 cfg:=jsonb_set(cfg,'{criteria,0,id}',to_jsonb(gen_random_uuid()));
 cfg:=jsonb_set(cfg,'{criteria,0,minorCriteria,0,id}',to_jsonb(gen_random_uuid()));
 cfg:=jsonb_set(cfg,'{criteria,0,minorCriteria,1,id}',to_jsonb(gen_random_uuid()));
 SELECT to_jsonb(c) INTO c2 FROM competitions c WHERE c.id=child2;
 PERFORM competition_save_native_configuration(event_id,child2,actor,(c2->>'setup_revision')::bigint,cfg);
 PERFORM competition_assign_native_judge(event_id,child2,actor,ep,NULL,false);
 SELECT jsonb_agg(jsonb_build_object('id',c.id,'setupRevision',c.setup_revision,'inputRevision',c.input_revision)) INTO reviewed FROM competitions c WHERE c.id IN(child1,child2);

 UPDATE events SET title='Changed after review was loaded' WHERE id=event_id;
 result:=competition_complete_creation(event_id,actor,reviewed);
 IF NOT EXISTS(SELECT 1 FROM events e WHERE e.id=event_id AND e.title='Changed after review was loaded' AND e.competition_created_at IS NOT NULL) THEN RAISE EXCEPTION 'PROBE_NOT_REPRODUCED'; END IF;
 IF result->>'created'<>'true' OR (SELECT count(*) FROM competitions c WHERE c.id IN(child1,child2) AND c.official_child_rules_id IS NOT NULL)<>2 THEN RAISE EXCEPTION 'COMPLETE_CREATION_FAILED'; END IF;
 IF competition_complete_creation(event_id,actor,reviewed)->>'created'<>'true' THEN RAISE EXCEPTION 'COMPLETE_RETRY_FAILED'; END IF;
 RAISE NOTICE 'PASS atomic review rollback, weighted minors, independent entry reuse, removal isolation, and idempotent completion';
END $$;
ROLLBACK;
