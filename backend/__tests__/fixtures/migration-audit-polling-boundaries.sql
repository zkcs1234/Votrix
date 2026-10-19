-- Diagnostic reproduction only, not desired behavior. All rows roll back.
BEGIN;
DO $$
DECLARE org uuid; actor uuid:='00000000-0000-4000-8000-000000000002';
 a uuid; b uuid; q uuid; ep_a uuid; ep_b uuid; submission uuid;
BEGIN
 SELECT id INTO org FROM organizations WHERE organizer_id='00000000-0000-4000-8000-000000000001';
 INSERT INTO events(organization_id,title,event_type,status,poll_allow_multiple_submissions) VALUES(org,'Poll audit A','polling','draft',false) RETURNING id INTO a;
 INSERT INTO events(organization_id,title,event_type,status) VALUES(org,'Poll audit B','polling','draft') RETURNING id INTO b;
 INSERT INTO event_participants(event_id,user_id,participant_type) VALUES(a,actor,'POLLING_RESPONDENT') RETURNING id INTO ep_a;
 INSERT INTO event_participants(event_id,user_id,participant_type) VALUES(b,actor,'POLLING_RESPONDENT') RETURNING id INTO ep_b;
 INSERT INTO poll_questions(event_id,question,type) VALUES(b,'Question belongs to another event','single_choice') RETURNING id INTO q;
 submission:=cast_poll_response(a,actor,NULL,true,jsonb_build_array(jsonb_build_object('question_id',q,'answer','diagnostic')));
 IF submission IS NULL OR NOT EXISTS(SELECT 1 FROM poll_answers pa JOIN poll_submissions ps ON ps.id=pa.submission_id JOIN poll_questions pq ON pq.id=pa.question_id WHERE ps.id=submission AND ps.event_id<>pq.event_id) THEN RAISE EXCEPTION 'POLL_SCOPE_PROBE_NOT_REPRODUCED'; END IF;
 IF cast_poll_response(a,actor,NULL,true,'[]') IS NULL THEN RAISE EXCEPTION 'MULTIPLE_POLICY_PROBE_NOT_REPRODUCED'; END IF;
 -- Explicit participant IDs bypass autofill; the FK checks existence only.
 INSERT INTO poll_submissions(event_id,voter_id,participant_id) VALUES(a,actor,ep_b);
 IF NOT EXISTS(SELECT 1 FROM poll_submissions ps JOIN event_participants ep ON ep.id=ps.participant_id WHERE ps.event_id=a AND ps.event_id<>ep.event_id) THEN RAISE EXCEPTION 'PARTICIPANT_SCOPE_PROBE_NOT_REPRODUCED'; END IF;
END $$;
ROLLBACK;
