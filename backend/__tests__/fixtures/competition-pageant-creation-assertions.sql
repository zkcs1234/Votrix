-- Run only in the verified synthetic local database, without persisting records.
BEGIN;
DO $$
DECLARE actor uuid; org uuid; event_id uuid; child_id uuid; ev jsonb; child jsonb;
 pre uuid:=gen_random_uuid(); final uuid:=gen_random_uuid(); first_criterion uuid:=gen_random_uuid(); last_criterion uuid:=gen_random_uuid(); cfg jsonb;
BEGIN
 SELECT o.organizer_id,o.id INTO actor,org FROM organizations o JOIN users u ON u.id=o.organizer_id WHERE u.role::text='organizer' AND u.account_status::text='active' LIMIT 1;
 ev:=competition_create_event(actor,org,gen_random_uuid(),jsonb_build_object('title','Pageant configuration validation','start_date','2030-01-10T09:00:00Z','end_date','2030-01-11T17:00:00Z','competition_type','pageant'));
 event_id:=(ev->>'id')::uuid;child_id:=gen_random_uuid();child:=competition_create_child(event_id,actor,child_id,'Women','pageant');
 cfg:=jsonb_build_object('structure','multiple','rounds',jsonb_build_array(jsonb_build_object('id',pre,'name','Preliminary','displayOrder',0,'progression','weighted','weight',20,'advancementType','top_n','advancementValue',3,'nextRoundId',final),jsonb_build_object('id',final,'name','Final','displayOrder',1,'progression','weighted','weight',80)),
 'criteria',jsonb_build_array(jsonb_build_object('id',first_criterion,'roundId',pre,'name','Presentation','percentage',100,'minScore',1,'maxScore',10,'minorCriteria',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Technique','minScore',1,'maxScore',10,'percentage',20),jsonb_build_object('id',gen_random_uuid(),'name','Impact','minScore',1,'maxScore',10,'percentage',80))),jsonb_build_object('id',last_criterion,'roundId',final,'name','Final performance','percentage',100,'minScore',1,'maxScore',10,'minorCriteria','[]'::jsonb)),
 'scoringConfig',jsonb_build_object('calculationMethod','rank_based','tiePolicy','shared','numericCarryBasis','weighted_judge_average','deductionRules',jsonb_build_array(jsonb_build_object('id','time-limit','description','Exceeded performance time','amount',5,'units','points','roundId',pre),jsonb_build_object('id','final-placement','description','Final placement penalty','amount',2,'units','placements','roundId',final))));
 PERFORM competition_validate_native_configuration(event_id,child_id,cfg,true);
 PERFORM competition_save_native_configuration(event_id,child_id,actor,(child->>'setup_revision')::bigint,cfg);
 IF (SELECT count(*) FROM competition_child_rounds r WHERE r.competition_id=child_id)<>2 THEN RAISE EXCEPTION 'PAGEANT_ROUND_IDENTITY_FAILED'; END IF;
 BEGIN
  PERFORM competition_validate_native_configuration(event_id,child_id,jsonb_set(cfg,'{scoringConfig,deductionRules,1,roundId}',to_jsonb(pre)),true);
  RAISE EXCEPTION 'ORDINAL_PRELIMINARY_PENALTY_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ORDINAL_DEDUCTION_CANNOT_CARRY' THEN RAISE; END IF; END;
 cfg:=jsonb_set(cfg,'{scoringConfig}',jsonb_build_object('calculationMethod','weighted_average','tiePolicy','shared'));
 cfg:=jsonb_set(cfg,'{rounds,0}',jsonb_build_object('id',pre,'name','Preliminary','displayOrder',0,'calculationMethod','rank_based','advancementType','threshold','advancementValue',50,'nextRoundId',final));
 cfg:=jsonb_set(cfg,'{rounds,1}',jsonb_build_object('id',final,'name','Final','displayOrder',1));
 BEGIN
  PERFORM competition_validate_native_configuration(event_id,child_id,cfg,true);
  RAISE EXCEPTION 'ORDINAL_SCORE_THRESHOLD_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'INCOMPATIBLE_THRESHOLD' THEN RAISE; END IF; END;
 -- One explicitly named phase is allowed; no generated second round is needed.
 cfg:=jsonb_set(cfg,'{rounds}',jsonb_build_array(jsonb_build_object('id',pre,'name','Final only','displayOrder',0)));
 cfg:=jsonb_set(cfg,'{criteria}',jsonb_build_array(cfg->'criteria'->0));
 PERFORM competition_validate_native_configuration(event_id,child_id,cfg,true);
 -- Single scoring removes every round and uses a NULL scope.
 cfg:=jsonb_set(cfg,'{structure}','"single"');cfg:=jsonb_set(cfg,'{rounds}','[]');cfg:=jsonb_set(cfg,'{criteria,0,roundId}','null');
 PERFORM competition_validate_native_configuration(event_id,child_id,cfg,true);
 RAISE NOTICE 'PASS pageant rounds, weighted minors, numeric carry penalties, ordinal threshold rejection, explicit one-round and zero-round configurations';
END $$;
ROLLBACK;
