-- Synthetic fixture only. The runner wraps every schema and data change in ROLLBACK.
CREATE FUNCTION pg_temp.deduction_fixture(mode text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor uuid; organization uuid; judge uuid; reviewer uuid; ev uuid; child uuid:=gen_random_uuid(); participant uuid; reviewer_ep uuid; master uuid; entry uuid; first_id uuid:=gen_random_uuid(); second_id uuid:=gen_random_uuid(); cfg jsonb; saved competitions; view jsonb;
BEGIN
 SELECT o.organizer_id,o.id INTO actor,organization FROM organizations o JOIN users u ON u.id=o.organizer_id WHERE u.account_status::text='active' AND u.role::text='organizer' LIMIT 1;
 SELECT id INTO judge FROM users WHERE account_status::text='active' AND role::text IN('participant','voter') LIMIT 1;
 SELECT id INTO reviewer FROM users WHERE account_status::text='active' AND role::text IN('participant','voter') AND id<>judge LIMIT 1;
 ev:=(competition_create_event(actor,organization,gen_random_uuid(),jsonb_build_object('title','Deduction responsibility fixture','start_date','2030-01-10T09:00:00Z','end_date','2030-01-11T17:00:00Z','competition_type','dance'))->>'id')::uuid;
 PERFORM competition_create_child(ev,actor,child,'Test performance','dance');
 INSERT INTO competition_contestants(event_id,name,contestant_number) VALUES(ev,'Synthetic performer',1) RETURNING id INTO master;
 entry:=(competition_add_entry(ev,actor,child,master,NULL)->>'id')::uuid;
 INSERT INTO event_participants(event_id,user_id,participant_type,judge_role,is_active) VALUES(ev,judge,'COMPETITION_JUDGE','judge',true) RETURNING id INTO participant;
 INSERT INTO event_participants(event_id,user_id,participant_type,judge_role,is_active) VALUES(ev,reviewer,'COMPETITION_JUDGE','score_reviewer',true) RETURNING id INTO reviewer_ep;
 cfg:=jsonb_build_object('structure','single','rounds','[]'::jsonb,'criteria',jsonb_build_array(jsonb_build_object('id',first_id,'roundId',NULL,'name','Technique','percentage',50,'minScore',0,'maxScore',100,'minorCriteria','[]'::jsonb),jsonb_build_object('id',second_id,'roundId',NULL,'name','Artistry','percentage',50,'minScore',0,'maxScore',100,'minorCriteria','[]'::jsonb)),'scoringConfig',jsonb_build_object('deductionMode',mode,'calculationMethod','weighted_average','tiePolicy','shared','decimalPlaces',2,'deductionRules',CASE WHEN mode='none' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('id','time','description','Time limit','amount',2,'units','points','roundId',NULL,'criteriaId',NULL,'appliedBy',mode,'perViolation',true,'maxOccurrences',2),jsonb_build_object('id','technique','description','Technique violation','amount',1,'units','points','roundId',NULL,'criteriaId',first_id,'appliedBy',mode,'perViolation',false,'maxOccurrences',1)) END));
 SELECT * INTO saved FROM competitions WHERE id=child;
 PERFORM competition_save_native_configuration(ev,child,actor,saved.setup_revision,cfg);
 PERFORM competition_assign_native_judge(ev,child,actor,participant,NULL,false);
 SELECT * INTO saved FROM competitions WHERE id=child;
 PERFORM competition_complete_creation(ev,actor,jsonb_build_array(jsonb_build_object('id',child,'setupRevision',saved.setup_revision,'inputRevision',saved.input_revision)),competition_parent_review_token((SELECT e FROM events e WHERE e.id=ev)));
 view:=competition_child_live_view(ev,child,actor,NULL,true);
 PERFORM competition_child_live_control(ev,child,actor,NULL,'start',view->'context'||jsonb_build_object('requestId',gen_random_uuid()));
 view:=competition_child_live_view(ev,child,actor,NULL,true);
 PERFORM competition_child_live_control(ev,child,actor,NULL,'access',view->'context'||jsonb_build_object('requestId',gen_random_uuid(),'kind','entry','targetId',entry,'open',true));
 view:=competition_child_live_view(ev,child,actor,NULL,true);
 PERFORM competition_child_live_control(ev,child,actor,NULL,'access',view->'context'||jsonb_build_object('requestId',gen_random_uuid(),'kind','criterion','targetId',first_id,'open',true));
 view:=competition_child_live_view(ev,child,actor,NULL,true);
 PERFORM competition_child_live_control(ev,child,actor,NULL,'access',view->'context'||jsonb_build_object('requestId',gen_random_uuid(),'kind','criterion','targetId',second_id,'open',true));
 RETURN jsonb_build_object('event',ev,'child',child,'actor',actor,'judge',judge,'reviewer',reviewer,'reviewerEp',reviewer_ep,'entry',entry,'first',first_id,'second',second_id,'configuration',cfg);
END $$;

CREATE FUNCTION pg_temp.deduction_body(f jsonb,criterion uuid,records jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE view jsonb; revision bigint;
BEGIN
 view:=competition_child_live_view((f->>'event')::uuid,(f->>'child')::uuid,(f->>'judge')::uuid,NULL,false);
 SELECT d.revision INTO revision FROM competition_child_score_drafts d WHERE d.session_id=(view->'context'->>'sessionId')::uuid AND d.judge_id=(f->>'judge')::uuid AND d.entry_id=(f->>'entry')::uuid AND d.criterion_id=criterion;
 RETURN view->'context'||jsonb_build_object('requestId',gen_random_uuid(),'entryId',f->>'entry','criterionId',criterion,'rowRevision',coalesce(revision,0),'scores',jsonb_build_object(criterion::text,90),'deductions',records);
END $$;

CREATE FUNCTION pg_temp.expect_deduction_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; RAISE EXCEPTION 'UNEXPECTED_SUCCESS';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%'||expected||'%' THEN RAISE; END IF; END;
END $$;

DO $$
DECLARE mode text; f jsonb; ev uuid; child uuid; actor uuid; judge uuid; first_id uuid; second_id uuid; records jsonb; click_records jsonb; body jsonb; click_body jsonb; old_submission jsonb; view jsonb; result jsonb; decision jsonb; state jsonb; cfg jsonb; calc_id uuid; pre uuid:=gen_random_uuid(); final_id uuid:=gen_random_uuid(); legacy_fixture record;
BEGIN
 FOREACH mode IN ARRAY ARRAY['none','organizer','judge'] LOOP
  f:=pg_temp.deduction_fixture(mode);ev:=(f->>'event')::uuid;child:=(f->>'child')::uuid;actor:=(f->>'actor')::uuid;judge:=(f->>'judge')::uuid;first_id:=(f->>'first')::uuid;second_id:=(f->>'second')::uuid;
  cfg:=f->'configuration';
  records:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'ruleId','time','offenseKey','first-overrun','reason','Recorded time overrun'));
  body:=pg_temp.deduction_body(f,first_id,records);
  IF mode<>'judge' THEN
   PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_score_write(%L,%L,%L,NULL,''draft'',%L::jsonb)',ev,child,judge,body),'JUDGE_DEDUCTION_SCOPE_FORBIDDEN');
   records:='[]';
  ELSE
   PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_score_write(%L,%L,%L,NULL,''draft'',%L::jsonb)',ev,child,judge,jsonb_set(body,'{deductions,0,amount}','999')),'DEDUCTION_REASON_AND_REFERENCE_REQUIRED');
   PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_score_write(%L,%L,%L,NULL,''draft'',%L::jsonb)',ev,child,(f->>'reviewer')::uuid,body),'FORBIDDEN');
   PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_score_write(%L,%L,%L,NULL,''draft'',%L::jsonb)',ev,child,judge,jsonb_set(body,'{deductions}',records||jsonb_build_array(jsonb_set(records->0,'{id}',to_jsonb(gen_random_uuid()))))),'DUPLICATE_JUDGE_DEDUCTION');
   click_records:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'ruleId','time'));
   click_body:=pg_temp.deduction_body(f,first_id,click_records);
   PERFORM competition_child_score_write(ev,child,judge,NULL,'draft',click_body);
   -- Retrying the same click is idempotent and records its audit metadata once.
   PERFORM competition_child_score_write(ev,child,judge,NULL,'draft',click_body);
   view:=competition_child_live_view(ev,child,judge,NULL,false);
   SELECT d->'deductions' INTO records FROM jsonb_array_elements(view->'drafts') d WHERE d->>'entry_id'=f->>'entry' AND d->>'criterion_id'=first_id::text;
   IF records->0->>'offenseKey' IS DISTINCT FROM ('judge-click:'||(click_records->0->>'id'))
   OR records->0->>'reason' IS DISTINCT FROM 'Judge applied the configured deduction using the Deduct button.'
   OR NOT EXISTS(SELECT 1 FROM competition_child_scoring_audit a WHERE a.session_id=(view->'context'->>'sessionId')::uuid AND a.actor_id=judge AND a.request_id=(click_body->>'requestId')::uuid AND a.action='draft' AND a.payload->'deductions' @> jsonb_build_array(records->0))
   THEN RAISE EXCEPTION 'JUDGE_DEDUCT_CLICK_AUDIT_FAILED'; END IF;
   click_records:=click_records||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'ruleId','time'));
   click_body:=pg_temp.deduction_body(f,first_id,click_records);
   PERFORM competition_child_score_write(ev,child,judge,NULL,'draft',click_body);
   view:=competition_child_live_view(ev,child,judge,NULL,false);
   SELECT d->'deductions' INTO records FROM jsonb_array_elements(view->'drafts') d WHERE d->>'entry_id'=f->>'entry' AND d->>'criterion_id'=first_id::text;
   IF jsonb_array_length(records)<>2 THEN RAISE EXCEPTION 'JUDGE_DEDUCTION_OCCURRENCE_NOT_SAVED'; END IF;
   click_records:=click_records||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'ruleId','time'));
   PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_score_write(%L,%L,%L,NULL,''draft'',%L::jsonb)',ev,child,judge,pg_temp.deduction_body(f,first_id,click_records)),'JUDGE_DEDUCTION_LIMIT_EXCEEDED');
  END IF;
  body:=pg_temp.deduction_body(f,first_id,records);
  PERFORM competition_child_score_write(ev,child,judge,NULL,'draft',body);
  -- The same request is a receipt, not a second mutation.
  PERFORM competition_child_score_write(ev,child,judge,NULL,'draft',body);
  view:=competition_child_live_view(ev,child,judge,NULL,false);
  IF view->'deductionSettings'->>'mode' IS DISTINCT FROM mode OR EXISTS(SELECT 1 FROM jsonb_array_elements(view->'drafts') d WHERE d->'scores'->>first_id::text IS DISTINCT FROM '90') THEN RAISE EXCEPTION 'DEDUCTION_DRAFT_ORIGINAL_SCORE_CHANGED'; END IF;
  IF mode='judge' AND jsonb_array_length(view->'deductionSettings'->'rules')<>2 THEN RAISE EXCEPTION 'JUDGE_RULES_MISSING'; END IF;
  IF mode<>'judge' AND jsonb_array_length(view->'deductionSettings'->'rules')<>0 THEN RAISE EXCEPTION 'FOREIGN_JUDGE_CONTROLS_EXPOSED'; END IF;
  PERFORM competition_child_score_write(ev,child,judge,NULL,'lock',pg_temp.deduction_body(f,second_id,'[]'));
  IF mode='judge' THEN
   PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_score_write(%L,%L,%L,NULL,''draft'',%L::jsonb)',ev,child,judge,pg_temp.deduction_body(f,first_id,'[]')),'ENTRY_DEDUCTIONS_LOCKED');
  END IF;
  PERFORM competition_child_score_write(ev,child,judge,NULL,'lock',pg_temp.deduction_body(f,first_id,records));
  PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_score_write(%L,%L,%L,NULL,''draft'',%L::jsonb)',ev,child,judge,pg_temp.deduction_body(f,first_id,records)),'LOCKED_OR_ROW_REVISION_CONFLICT');
  view:=competition_child_live_view(ev,child,judge,NULL,false);
  result:=competition_child_score_write(ev,child,judge,NULL,'submit',view->'context'||jsonb_build_object('requestId',gen_random_uuid()));
  SELECT to_jsonb(s) INTO old_submission FROM competition_child_submissions s WHERE id=(result->>'submissionId')::uuid;
  IF mode='judge' AND old_submission->'sources' @> jsonb_build_array(jsonb_build_object('criterion_id',first_id,'deductions',records)) IS NOT TRUE THEN RAISE EXCEPTION 'JUDGE_DEDUCTIONS_NOT_SUBMITTED'; END IF;
  PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_score_write(%L,%L,%L,NULL,''draft'',%L::jsonb)',ev,child,judge,pg_temp.deduction_body(f,first_id,records)),'ROUND_ALREADY_SUBMITTED');
  view:=competition_child_live_view(ev,child,actor,NULL,true);
  PERFORM competition_child_live_control(ev,child,actor,NULL,'close',view->'context'||jsonb_build_object('requestId',gen_random_uuid()));
  state:=competition_child_tabulation_snapshot(ev,child,actor,NULL,false);
  IF state->'complete' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'DEDUCTION_SOURCES_NOT_COMPLETE'; END IF;
  IF mode='organizer' THEN
   decision:=competition_child_deduction_action(ev,child,actor,NULL,'propose',jsonb_build_object('entryId',f->>'entry','ruleKey','time','offenseKey','one','reason','Organizer recorded violation','amount',999));
   IF NOT coalesce((decision->>'appliedDirectly')::boolean,false) OR (SELECT count(*) FROM competition_child_deduction_reviews WHERE decision_id=(decision->>'decisionId')::uuid AND action='approve' AND actor_id=actor)<>1 OR (SELECT rule_snapshot->>'amount' FROM competition_child_deduction_decisions WHERE id=(decision->>'decisionId')::uuid) IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'ORGANIZER_DIRECT_APPLICATION_FAILED'; END IF;
   PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_deduction_action(%L,%L,%L,NULL,''propose'',%L::jsonb)',ev,child,actor,jsonb_build_object('entryId',f->>'entry','ruleKey','time','offenseKey',' ONE ','reason','Duplicate reference test')),'DUPLICATE_ORGANIZER_DEDUCTION');
   PERFORM competition_child_deduction_action(ev,child,actor,NULL,'propose',jsonb_build_object('entryId',f->>'entry','ruleKey','time','offenseKey','two','reason','Second permitted violation'));
   PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_deduction_action(%L,%L,%L,NULL,''propose'',%L::jsonb)',ev,child,actor,jsonb_build_object('entryId',f->>'entry','ruleKey','time','offenseKey','three','reason','Exceeds configured limit')),'ORGANIZER_DEDUCTION_LIMIT_EXCEEDED');
   PERFORM competition_child_deduction_action(ev,child,actor,NULL,'revoke',jsonb_build_object('decisionId',decision->>'decisionId','reason','Explicit organizer correction'));
   PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_deduction_action(%L,%L,%L,NULL,''propose'',%L::jsonb)',ev,child,judge,jsonb_build_object('entryId',f->>'entry','ruleKey','time','offenseKey','other','reason','Unauthorized judge action')),'FORBIDDEN');
  ELSE
   PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_deduction_action(%L,%L,%L,NULL,''propose'',%L::jsonb)',ev,child,actor,jsonb_build_object('entryId',f->>'entry','ruleKey','time','offenseKey','other','reason','Wrong deduction ownership')),'ORGANIZER_DEDUCTION_SCOPE_FORBIDDEN');
  END IF;
  state:=competition_child_tabulation_snapshot(ev,child,actor,NULL,false);
  IF state->'deductionsResolved' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'DIRECT_DEDUCTION_REQUIRES_REVIEWER'; END IF;
  result:=competition_child_official_calculate(ev,child,actor,NULL,state->>'sourceDigest',jsonb_build_object('rules',jsonb_build_object('id',state->'rules'->>'id')),jsonb_build_object('ready',true,'results',jsonb_build_array(jsonb_build_object('contestantId',f->>'entry','rank',1,'baseScore',90,'finalScore',88))));
  calc_id:=(result->>'calculationId')::uuid;
  PERFORM pg_temp.expect_deduction_error(format('SELECT competition_child_official_transition(%L,%L,%L,%L,''finalize'',''No verification yet'')',ev,child,actor,calc_id),'INDEPENDENT_VERIFICATION_REQUIRED');
  PERFORM competition_child_appoint_reviewer(ev,child,actor,(f->>'reviewerEp')::uuid);
  PERFORM competition_child_official_transition(ev,child,(f->>'reviewer')::uuid,calc_id,'verify','Independent calculation verification');
  PERFORM competition_child_official_transition(ev,child,actor,calc_id,'finalize','Organizer finalization after verification');
  state:=competition_child_public_projection(calc_id);
  IF (state->'deductionSettings'->>'organizer')::boolean IS DISTINCT FROM (mode='organizer') OR (state->'deductionSettings'->>'judge')::boolean IS DISTINCT FROM (mode='judge') THEN RAISE EXCEPTION 'RESULT_DEDUCTION_VISIBILITY_INCORRECT'; END IF;
  IF mode='judge' THEN
   view:=competition_child_live_view(ev,child,actor,NULL,true);
   PERFORM competition_child_live_control(ev,child,actor,NULL,'reopen',view->'context'||jsonb_build_object('requestId',gen_random_uuid(),'judgeId',judge,'acknowledged',true,'reason','Authorized deduction correction'));
   state:=competition_child_tabulation_snapshot(ev,child,actor,NULL,false);
   IF state->'complete' IS DISTINCT FROM 'false'::jsonb OR state->'calculation' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'REOPEN_RETAINED_OFFICIAL_RESULT'; END IF;
   view:=competition_child_live_view(ev,child,actor,NULL,true);
   PERFORM competition_child_live_control(ev,child,actor,NULL,'resume',view->'context'||jsonb_build_object('requestId',gen_random_uuid()));
   records:=jsonb_set(records,'{0,reason}','"Audited corrected reason"');
   PERFORM competition_child_score_write(ev,child,judge,NULL,'lock',pg_temp.deduction_body(f,first_id,records));
   IF (SELECT to_jsonb(s) FROM competition_child_submissions s WHERE id=(old_submission->>'id')::uuid) IS DISTINCT FROM old_submission THEN RAISE EXCEPTION 'HISTORICAL_SUBMISSION_MUTATED'; END IF;
  END IF;
  -- Round defaults and criterion ownership are validated before freezing.
  cfg:=jsonb_set(cfg,'{structure}','"multiple"');
  cfg:=jsonb_set(cfg,'{rounds}',jsonb_build_array(jsonb_build_object('id',pre,'name','Preliminary','displayOrder',0,'progression','back_to_zero'),jsonb_build_object('id',final_id,'name','Final','displayOrder',1,'progression','back_to_zero','deductionMode','judge')));
  cfg:=jsonb_set(cfg,'{criteria}',(SELECT jsonb_agg(jsonb_set(item,'{roundId}',to_jsonb(pre))) FROM jsonb_array_elements(cfg->'criteria') item));
  cfg:=jsonb_set(cfg,'{scoringConfig,deductionRules}','[]');
  PERFORM competition_validate_native_configuration(ev,child,cfg,false);
  IF competition_deduction_mode(cfg,final_id)<>'judge' OR competition_deduction_mode(cfg,pre)<>mode THEN RAISE EXCEPTION 'ROUND_INHERITANCE_FAILED'; END IF;
  cfg:=jsonb_set(cfg,'{scoringConfig,deductionRules}',jsonb_build_array(jsonb_build_object('id','conflict','description','Conflict test','amount',1,'units','points','roundId',final_id,'appliedBy','organizer')));
  PERFORM pg_temp.expect_deduction_error(format('SELECT competition_validate_native_configuration(%L,%L,%L::jsonb,false)',ev,child,cfg),'DEDUCTION_OWNERSHIP_CONFLICT');
  RAISE NOTICE 'PASS % mode: permissions, frozen amounts, locks, submissions, deduplication, finalization and round defaults',mode;
 END LOOP;
 IF has_function_privilege('authenticated','competition_child_score_write(uuid,uuid,uuid,uuid,text,jsonb)','EXECUTE') OR has_function_privilege('service_role','competition_child_score_write_v126(uuid,uuid,uuid,uuid,text,jsonb)','EXECUTE') OR has_table_privilege('service_role','competition_child_score_drafts','UPDATE') THEN RAISE EXCEPTION 'DEDUCTION_PRIVILEGE_BYPASS'; END IF;
 RAISE NOTICE 'PASS deduction RPC delegates private; direct table writes and authenticated RPC bypass prohibited';
END $$;
