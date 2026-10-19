\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION test_reject_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('votrix.test.fail_projection',true)='true' THEN RAISE EXCEPTION 'TEST_PROJECTION_FAILURE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER test_projection_failure BEFORE INSERT ON competition_scores FOR EACH ROW EXECUTE FUNCTION test_reject_projection();
DO $$
DECLARE owner_id uuid:='10000000-0000-0000-0000-000000000001'; judge_id uuid:='10000000-0000-0000-0000-000000000002';
 event_id uuid:='20000000-0000-0000-0000-000000000001'; round_id uuid:='30000000-0000-0000-0000-000000000001';
 entry_id uuid:='40000000-0000-0000-0000-000000000001'; crit_id uuid:='50000000-0000-0000-0000-000000000001';
 minor_id uuid:='60000000-0000-0000-0000-000000000001'; rule_id uuid:='70000000-0000-0000-0000-000000000001';
 snapshot jsonb; session jsonb; context jsonb; result jsonb; payload jsonb; failed boolean;
BEGIN
 INSERT INTO users(id,role) VALUES(owner_id,'organizer'),(judge_id,'participant');
 INSERT INTO organizations(id,organizer_id) VALUES(event_id,owner_id);
 INSERT INTO events(id,organization_id) VALUES(event_id,event_id);
 INSERT INTO competition_rounds(id,event_id) VALUES(round_id,event_id);
 INSERT INTO competition_contestants(id,event_id) VALUES(entry_id,event_id);
 INSERT INTO competition_criteria(id,event_id) VALUES(crit_id,event_id);
 INSERT INTO competition_minor_criteria(id,criteria_id) VALUES(minor_id,crit_id);
 INSERT INTO event_participants(event_id,user_id) VALUES(event_id,judge_id);
 snapshot:=jsonb_build_object('event',jsonb_build_object('id',event_id),'scoringConfig',jsonb_build_object('confirmed',true,'calculationMethod','weighted_average'),
 'rounds',jsonb_build_array(jsonb_build_object('id',round_id,'displayOrder',0,'contestantIds',jsonb_build_array(entry_id),'criteriaIds',jsonb_build_array(crit_id))),
 'contestants',jsonb_build_array(jsonb_build_object('id',entry_id,'contestantNumber',1)),
 'judges',jsonb_build_array(jsonb_build_object('judgeId',judge_id)),
 'criteria',jsonb_build_array(jsonb_build_object('id',crit_id,'minorCriteria',jsonb_build_array(jsonb_build_object('id',minor_id,'minScore',0,'maxScore',10)))));
 PERFORM competition_publish_rules(event_id,owner_id,rule_id,snapshot);
 session:=competition_operational_action(event_id,owner_id,NULL,'start','{}');
 context:=jsonb_build_object('judgeId',judge_id,'sessionId',session->>'id','roundId',round_id,'rulesVersion',rule_id);
 payload:=jsonb_build_object('contestantId',entry_id,'criteriaId',crit_id,'scores',jsonb_build_object(minor_id::text,0));
 failed:=false;
 BEGIN PERFORM competition_operational_action(event_id,judge_id,NULL,'start','{}'); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='ORGANIZER_FORBIDDEN'; END;
 IF NOT failed THEN RAISE EXCEPTION 'Unauthorized organizer accepted'; END IF;
 UPDATE users SET account_status='inactive' WHERE id=judge_id;
 failed:=false;BEGIN PERFORM competition_scoring_write(event_id,judge_id,context,'lock',payload); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='JUDGE_FORBIDDEN'; END;
 IF NOT failed THEN RAISE EXCEPTION 'Inactive judge accepted'; END IF;
 UPDATE users SET account_status='active' WHERE id=judge_id;
 UPDATE event_participants SET judge_role='score_reviewer' WHERE user_id=judge_id;
 failed:=false;BEGIN PERFORM competition_scoring_write(event_id,judge_id,context,'lock',payload); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='JUDGE_FORBIDDEN'; END;
 IF NOT failed THEN RAISE EXCEPTION 'Reviewer-only scoring accepted'; END IF;
 UPDATE event_participants SET judge_role='judge' WHERE user_id=judge_id;
 PERFORM competition_operational_action(event_id,owner_id,(session->>'id')::uuid,'access','{"kind":"criteria","gate":{"mode":"none","ids":[]}}');
 failed:=false;BEGIN PERFORM competition_scoring_write(event_id,judge_id,context,'lock',payload); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='SCORING_ACCESS_CLOSED'; END;
 IF NOT failed THEN RAISE EXCEPTION 'NONE gate interpreted as all'; END IF;
 PERFORM competition_operational_action(event_id,owner_id,(session->>'id')::uuid,'access','{"kind":"criteria","gate":{"mode":"all","ids":[]}}');
 result:=competition_scoring_write(event_id,judge_id,context,'draft',payload);
 IF result->'draft'->>'revision'<>'1' THEN RAISE EXCEPTION 'Draft not saved'; END IF;
 failed:=false;
 BEGIN PERFORM competition_scoring_write(event_id,judge_id,context||jsonb_build_object('roundId',gen_random_uuid()),'lock',payload); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='STALE_CONTEXT'; END;
 IF NOT failed THEN RAISE EXCEPTION 'Stale round was accepted'; END IF;
 failed:=false;BEGIN PERFORM competition_scoring_write(event_id,judge_id,context||jsonb_build_object('judgeId',owner_id),'lock',payload); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='STALE_JUDGE_CONTEXT'; END;
 IF NOT failed THEN RAISE EXCEPTION 'A score retry crossed authenticated Judge identity'; END IF;
 PERFORM set_config('votrix.test.fail_projection','true',true);
 failed:=false;
 BEGIN PERFORM competition_scoring_write(event_id,judge_id,context,'lock',payload); EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='TEST_PROJECTION_FAILURE'; END;
 IF NOT failed OR EXISTS(SELECT 1 FROM competition_session_judge_scores) THEN RAISE EXCEPTION 'Projection failure left a saved lock'; END IF;
 PERFORM set_config('votrix.test.fail_projection','false',true);
 result:=competition_scoring_write(event_id,judge_id,context,'lock',payload);
 DELETE FROM competition_scores WHERE contestant_id=entry_id;
 result:=competition_reconcile_projection(event_id,owner_id,(session->>'id')::uuid,'Test explicit repair from immutable locked source');
 IF result->>'submissionsCreated'<>'0' OR EXISTS(SELECT 1 FROM competition_round_submissions) THEN RAISE EXCEPTION 'Repair invented a submission'; END IF;
 IF (SELECT count(*) FROM competition_scores WHERE contestant_id=entry_id)<>1 OR (SELECT score FROM competition_scores WHERE contestant_id=entry_id)<>0 THEN RAISE EXCEPTION 'Projection or zero score lost'; END IF;
 result:=competition_scoring_write(event_id,judge_id,context,'lock',payload);
 IF NOT (result->>'duplicate')::boolean OR (SELECT count(*) FROM competition_scores WHERE contestant_id=entry_id)<>1 THEN RAISE EXCEPTION 'Lock retry not idempotent'; END IF;
 PERFORM competition_operational_action(event_id,owner_id,(session->>'id')::uuid,'access','{"kind":"entries","gate":{"mode":"none","ids":[]}}');
 PERFORM competition_operational_action(event_id,owner_id,(session->>'id')::uuid,'end-performance','{}');
 result:=competition_scoring_write(event_id,judge_id,context,'submit','{}');
 IF result->'submission'->>'status'<>'submitted' THEN RAISE EXCEPTION 'Submit Round blocked by closed stage'; END IF;
 result:=competition_scoring_write(event_id,judge_id,context,'submit','{}');
 IF NOT (result->>'duplicate')::boolean THEN RAISE EXCEPTION 'Duplicate Submit Round not idempotent'; END IF;
 IF (SELECT status FROM events WHERE id=event_id)='completed' THEN RAISE EXCEPTION 'Performance prematurely completed event'; END IF;
 RAISE NOTICE 'PASS: context rejection, saved draft, true zero, atomic source/projection, duplicate Lock/Submit, closed-stage submission and lifecycle';
END $$;
ROLLBACK;
