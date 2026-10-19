-- Phase 5: immutable native official sources, review and confirmed qualification.
-- No historical backfill, legacy calculation replacement or public publication.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN IF to_regprocedure('competition_child_score_write(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'MIGRATION_105_REQUIRED'; END IF; END $$;
CREATE TABLE IF NOT EXISTS competition_child_review_policies (
 competition_id uuid PRIMARY KEY,event_id uuid NOT NULL,participant_id uuid NOT NULL REFERENCES event_participants(id),
 reviewer_id uuid NOT NULL REFERENCES users(id),appointed_by uuid NOT NULL REFERENCES users(id),appointed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(competition_id,event_id) REFERENCES competitions(id,event_id)
);
CREATE TABLE IF NOT EXISTS competition_child_deduction_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES competition_child_sessions(id),
 entry_id uuid NOT NULL REFERENCES competition_entries(id),rule_key text NOT NULL,offense_key text NOT NULL,
 rule_snapshot jsonb NOT NULL,reason text NOT NULL,proposed_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,entry_id,rule_key,offense_key)
);
CREATE TABLE IF NOT EXISTS competition_child_deduction_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),decision_id uuid NOT NULL REFERENCES competition_child_deduction_decisions(id),
 action text NOT NULL CHECK(action IN('approve','reject','revoke')),reason text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,UNIQUE(decision_id,version)
);
CREATE TABLE IF NOT EXISTS competition_child_calculations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL,competition_id uuid NOT NULL,round_id uuid,
 session_id uuid NOT NULL REFERENCES competition_child_sessions(id),rules_version uuid NOT NULL,
 source_digest text NOT NULL,source_snapshot jsonb NOT NULL,input_snapshot jsonb NOT NULL,output_snapshot jsonb NOT NULL,
 version integer NOT NULL,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(competition_id,event_id) REFERENCES competitions(id,event_id),
 FOREIGN KEY(round_id,competition_id,event_id) REFERENCES competition_child_rounds(id,competition_id,event_id),
 FOREIGN KEY(rules_version,competition_id,event_id) REFERENCES competition_child_rule_versions(id,competition_id,event_id),
 UNIQUE(competition_id,version)
);
CREATE TABLE IF NOT EXISTS competition_child_calculation_transitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),calculation_id uuid NOT NULL REFERENCES competition_child_calculations(id),
 action text NOT NULL CHECK(action IN('verify','finalize')),actor_id uuid NOT NULL REFERENCES users(id),reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(calculation_id,action)
);
CREATE TABLE IF NOT EXISTS competition_child_qualifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL,competition_id uuid NOT NULL,from_round uuid NOT NULL,to_round uuid NOT NULL,
 calculation_id uuid NOT NULL REFERENCES competition_child_calculations(id),source_digest text NOT NULL,qualifier_ids jsonb NOT NULL,
 policy_snapshot jsonb NOT NULL,confirmed_by uuid NOT NULL REFERENCES users(id),reason text NOT NULL,confirmed_at timestamptz NOT NULL DEFAULT now(),version integer NOT NULL DEFAULT 1,UNIQUE(competition_id,to_round,version),
 FOREIGN KEY(competition_id,event_id) REFERENCES competitions(id,event_id),
 FOREIGN KEY(from_round,competition_id,event_id) REFERENCES competition_child_rounds(id,competition_id,event_id),
 FOREIGN KEY(to_round,competition_id,event_id) REFERENCES competition_child_rounds(id,competition_id,event_id)
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['competition_child_review_policies','competition_child_deduction_decisions','competition_child_deduction_reviews','competition_child_calculations','competition_child_calculation_transitions','competition_child_qualifications'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass AND tgname='competition_child_official_immutable') THEN EXECUTE format('CREATE TRIGGER competition_child_official_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION competition_immutable_rules()',t); END IF;
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION competition_child_official_relation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r jsonb:=to_jsonb(NEW); v_event uuid; v_child uuid; s competition_child_sessions; calc competition_child_calculations;
BEGIN
 IF TG_TABLE_NAME IN('competition_child_review_policies','competition_child_calculations','competition_child_qualifications') THEN v_event:=(r->>'event_id')::uuid;v_child:=(r->>'competition_id')::uuid;
 ELSIF TG_TABLE_NAME='competition_child_deduction_decisions' THEN SELECT * INTO s FROM competition_child_sessions WHERE id=(r->>'session_id')::uuid;v_event:=s.event_id;v_child:=s.competition_id;
 ELSIF TG_TABLE_NAME='competition_child_deduction_reviews' THEN SELECT sess.* INTO s FROM competition_child_deduction_decisions d JOIN competition_child_sessions sess ON sess.id=d.session_id WHERE d.id=(r->>'decision_id')::uuid;v_event:=s.event_id;v_child:=s.competition_id;
 ELSE SELECT * INTO calc FROM competition_child_calculations WHERE id=(r->>'calculation_id')::uuid;v_event:=calc.event_id;v_child:=calc.competition_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM competitions c WHERE c.id=v_child AND c.event_id=v_event AND c.origin='native') THEN RAISE EXCEPTION 'OFFICIAL_CONTEXT_FORBIDDEN'; END IF;
 IF EXISTS(SELECT 1 FROM events e WHERE e.id=v_event AND e.status::text IN('archived','cancelled')) THEN RAISE EXCEPTION 'OFFICIAL_EVENT_CLOSED'; END IF;
 IF TG_TABLE_NAME='competition_child_calculations' THEN
  SELECT * INTO s FROM competition_child_sessions WHERE id=(r->>'session_id')::uuid;
  IF s.competition_id IS DISTINCT FROM v_child OR s.event_id IS DISTINCT FROM v_event OR s.round_id IS DISTINCT FROM (r->>'round_id')::uuid OR s.rules_version IS DISTINCT FROM (r->>'rules_version')::uuid THEN RAISE EXCEPTION 'CALCULATION_RELATION_FORBIDDEN'; END IF;
 ELSIF TG_TABLE_NAME='competition_child_qualifications' THEN
  SELECT * INTO calc FROM competition_child_calculations WHERE id=(r->>'calculation_id')::uuid;
  IF calc.competition_id IS DISTINCT FROM v_child OR calc.event_id IS DISTINCT FROM v_event OR calc.round_id IS DISTINCT FROM (r->>'from_round')::uuid OR calc.source_digest IS DISTINCT FROM r->>'source_digest' THEN RAISE EXCEPTION 'QUALIFICATION_RELATION_FORBIDDEN'; END IF;
 ELSIF TG_TABLE_NAME='competition_child_review_policies' THEN
  IF NOT EXISTS(SELECT 1 FROM event_participants ep WHERE ep.id=(r->>'participant_id')::uuid AND ep.event_id=v_event AND ep.user_id=(r->>'reviewer_id')::uuid) THEN RAISE EXCEPTION 'REVIEW_POLICY_RELATION_FORBIDDEN'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['competition_child_review_policies','competition_child_deduction_decisions','competition_child_deduction_reviews','competition_child_calculations','competition_child_calculation_transitions','competition_child_qualifications'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass AND tgname='competition_child_official_relation_guard') THEN EXECUTE format('CREATE TRIGGER competition_child_official_relation_guard BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION competition_child_official_relation_guard()',t); END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION competition_child_reviewer_authority(p_event uuid,p_competition uuid,p_actor uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM competition_child_review_policies p JOIN competitions c ON c.id=p.competition_id JOIN event_participants ep ON ep.id=p.participant_id JOIN users u ON u.id=p.reviewer_id WHERE p.event_id=p_event AND c.event_id=p_event AND c.origin='native' AND p.competition_id=p_competition AND p.reviewer_id=p_actor AND ep.user_id=p_actor AND ep.event_id=p_event AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.is_active AND ep.judge_role::text='score_reviewer' AND u.account_status::text='active' AND u.role::text IN('participant','voter')) THEN RAISE EXCEPTION 'INDEPENDENT_REVIEWER_FORBIDDEN'; END IF;
END $$;

-- Completeness comes exclusively from CURRENT heads. Historical snapshots,
-- drafts and locks can never compensate for a missing current submission.
CREATE OR REPLACE FUNCTION competition_child_current_sources(p_event uuid,p_competition uuid,p_round uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s competition_child_sessions; v competition_child_rule_versions; panel jsonb; progress jsonb:='[]'; submitted jsonb:='[]'; j uuid; sub competition_child_submissions; ok boolean; ready boolean:=true; major jsonb; target jsonb; e text; cells integer; item jsonb;
BEGIN
 SELECT * INTO s FROM competition_child_sessions WHERE competition_id=p_competition AND event_id=p_event AND round_id IS NOT DISTINCT FROM p_round;
 SELECT rv.* INTO v FROM competition_child_rule_versions rv JOIN competitions c ON c.official_child_rules_id=rv.id WHERE c.id=p_competition AND c.event_id=p_event AND c.origin='native' AND rv.setup_revision=c.setup_revision AND rv.input_revision=c.input_revision;
 IF v.id IS NULL THEN RAISE EXCEPTION 'CURRENT_FROZEN_RULES_REQUIRED'; END IF;
 SELECT coalesce(jsonb_agg(DISTINCT a->>'judgeId'),'[]') INTO panel FROM jsonb_array_elements(v.assignment_snapshot) a WHERE a->>'round_id' IS NULL OR a->>'round_id'=p_round::text;
 IF s.id IS NULL OR jsonb_array_length(panel)=0 THEN ready:=false; END IF;
 FOR j IN SELECT value::uuid FROM jsonb_array_elements_text(panel) LOOP
  SELECT payload.* INTO sub FROM competition_child_submission_heads h JOIN competition_child_submissions payload ON payload.id=h.submission_id AND payload.session_id=h.session_id AND payload.judge_id=h.judge_id WHERE h.session_id=s.id AND h.judge_id=j;
  ok:=sub.id IS NOT NULL AND sub.rules_version=v.id AND EXISTS(SELECT 1 FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id JOIN users u ON u.id=ep.user_id WHERE a.competition_id=p_competition AND (a.round_id IS NULL OR a.round_id=p_round) AND ep.user_id=j AND ep.event_id=p_event AND ep.is_active AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.judge_role::text IN('judge','head_judge') AND u.account_status::text='active' AND u.role::text IN('participant','voter'));
  cells:=0;
  IF ok THEN
   FOR e IN SELECT value FROM jsonb_array_elements_text(s.entry_ids) LOOP
    FOR major IN SELECT value FROM jsonb_array_elements(v.configuration_snapshot->'criteria') WHERE (value->>'roundId')::uuid IS NOT DISTINCT FROM p_round LOOP
     cells:=cells+1;
     SELECT value INTO item FROM jsonb_array_elements(sub.sources) WHERE value->>'entry_id'=e AND value->>'criterion_id'=major->>'id';
     IF item IS NULL OR item->>'session_id' IS DISTINCT FROM s.id::text OR item->>'judge_id' IS DISTINCT FROM j::text OR item->'locked' IS DISTINCT FROM 'true'::jsonb OR NOT EXISTS(SELECT 1 FROM competition_child_score_drafts d WHERE d.session_id=s.id AND d.judge_id=j AND d.entry_id=e::uuid AND d.criterion_id=(major->>'id')::uuid AND d.locked AND d.revision=(item->>'revision')::bigint AND d.scores=item->'scores') THEN ok:=false; END IF;
     FOR target IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_array_length(coalesce(major->'minorCriteria','[]'))>0 THEN major->'minorCriteria' ELSE jsonb_build_array(major) END) LOOP
      IF jsonb_typeof(item->'scores'->(target->>'id')) IS DISTINCT FROM 'number' OR (item->'scores'->>(target->>'id'))::numeric NOT BETWEEN (target->>'minScore')::numeric AND (target->>'maxScore')::numeric THEN ok:=false; END IF;
     END LOOP;
    END LOOP;
   END LOOP;
   IF cells=0 OR jsonb_array_length(sub.sources)<>cells THEN ok:=false; END IF;
  END IF;
  progress:=progress||jsonb_build_array(jsonb_build_object('judgeId',j,'submitted',coalesce(ok,false),'submissionId',CASE WHEN ok THEN sub.id ELSE NULL END,'submittedAt',CASE WHEN ok THEN sub.submitted_at ELSE NULL END));
  ready:=ready AND coalesce(ok,false);
  IF ok THEN submitted:=submitted||jsonb_build_array(to_jsonb(sub)||jsonb_build_object('round_id',p_round,'entry_ids',s.entry_ids)); END IF;
 END LOOP;
 RETURN jsonb_build_object('complete',ready,'progress',progress,'session',CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END,'rules',to_jsonb(v),'submissions',CASE WHEN ready THEN submitted ELSE '[]'::jsonb END);
END $$;

CREATE OR REPLACE FUNCTION competition_child_tabulation_snapshot(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_reviewer boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; c competitions; deductions jsonb; policy competition_child_review_policies; calculation competition_child_calculations; digest text; evidence jsonb; pending boolean; scopes jsonb; all_deductions jsonb; previous jsonb; previous_state jsonb; target jsonb; qualification jsonb; policy_state jsonb; entries jsonb; complete boolean;
BEGIN
 IF p_reviewer THEN PERFORM competition_child_reviewer_authority(p_event,p_competition,p_actor); ELSE PERFORM competition_native_foundation(p_event,p_competition,p_actor); END IF;
 SELECT * INTO c FROM competitions WHERE id=p_competition AND event_id=p_event;
 state:=competition_child_current_sources(p_event,p_competition,p_round);
 IF state->'rules'->'configuration_snapshot'->>'structure'='single' AND p_round IS NOT NULL OR state->'rules'->'configuration_snapshot'->>'structure'='multiple' AND NOT EXISTS(SELECT 1 FROM competition_child_rounds WHERE id=p_round AND competition_id=p_competition) THEN RAISE EXCEPTION 'SCOPING_FORBIDDEN'; END IF;
 SELECT * INTO policy FROM competition_child_review_policies WHERE competition_id=p_competition;
 policy_state:=CASE WHEN policy.competition_id IS NULL THEN NULL ELSE to_jsonb(policy)||jsonb_build_object('active',EXISTS(SELECT 1 FROM event_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.id=policy.participant_id AND ep.event_id=p_event AND ep.user_id=policy.reviewer_id AND ep.is_active AND ep.judge_role::text='score_reviewer' AND ep.participant_type::text='COMPETITION_JUDGE' AND u.account_status::text='active' AND u.role::text IN('participant','voter'))) END;
 SELECT coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('status',coalesce(review.action,'pending'),'scope_round_id',sess.round_id,'review',to_jsonb(review)) ORDER BY d.id),'[]') INTO deductions FROM competition_child_deduction_decisions d JOIN competition_child_sessions sess ON sess.id=d.session_id LEFT JOIN LATERAL(SELECT * FROM competition_child_deduction_reviews WHERE decision_id=d.id ORDER BY version DESC LIMIT 1) review ON true WHERE sess.competition_id=p_competition AND sess.round_id IS NOT DISTINCT FROM p_round;
 pending:=EXISTS(SELECT 1 FROM jsonb_array_elements(deductions) d WHERE d->>'status'='pending');
 complete:=(state->>'complete')::boolean;scopes:=jsonb_build_array(jsonb_build_object('session',state->'session','submissions',state->'submissions'));all_deductions:=deductions;
 SELECT value INTO target FROM jsonb_array_elements(state->'rules'->'configuration_snapshot'->'rounds') WHERE value->>'id'=p_round::text;
 IF (target->>'displayOrder')::integer>0 THEN
  qualification:=competition_child_qualification_state(p_event,p_competition,p_round);
  complete:=complete AND coalesce((qualification->>'current')::boolean,false);
 END IF;
 IF coalesce(target->>'progression','back_to_zero') IN('carry_forward','weighted') AND ((target->>'progression')='carry_forward' OR (target->>'displayOrder')::integer=jsonb_array_length(state->'rules'->'configuration_snapshot'->'rounds')-1) THEN
  FOR previous IN SELECT value FROM jsonb_array_elements(state->'rules'->'configuration_snapshot'->'rounds') WHERE (value->>'displayOrder')::integer<(target->>'displayOrder')::integer ORDER BY (value->>'displayOrder')::integer LOOP
   previous_state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,(previous->>'id')::uuid,p_reviewer);
   complete:=complete AND previous_state->'complete'='true'::jsonb AND previous_state->'calculation'->'finalized'='true'::jsonb;
   pending:=pending OR previous_state->'deductionsResolved' IS DISTINCT FROM 'true'::jsonb;
   scopes:=scopes||jsonb_build_array(jsonb_build_object('session',previous_state->'session','submissions',previous_state->'submissions','calculationId',previous_state->'calculation'->>'id','sourceDigest',previous_state->>'sourceDigest'));
   all_deductions:=all_deductions||previous_state->'deductions';
  END LOOP;
 END IF;
 evidence:=jsonb_build_object('rulesVersion',c.official_child_rules_id,'setupRevision',c.setup_revision,'inputRevision',c.input_revision,'session',state->'session','submissionIds',(SELECT coalesce(jsonb_agg(s->>'id' ORDER BY s->>'id'),'[]') FROM jsonb_array_elements(state->'submissions') s),'deductions',all_deductions,'policy',policy_state,'qualification',qualification,'scopeSources',scopes);
 digest:=encode(sha256(convert_to(evidence::text,'UTF8')),'hex');
 SELECT * INTO calculation FROM competition_child_calculations WHERE competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round ORDER BY version DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',m.name,'contestantNumber',e.entry_number,'photo',to_jsonb(m)->>'photo') ORDER BY e.entry_number),'[]') INTO entries FROM competition_entries e JOIN competition_contestants m ON m.id=e.contestant_id WHERE e.competition_id=p_competition;
 RETURN jsonb_build_object('eventId',p_event,'competitionId',p_competition,'roundId',p_round,'viewerId',p_actor,'setupRevision',c.setup_revision,'inputRevision',c.input_revision,'complete',coalesce(complete,false),'progress',state->'progress','session',state->'session','reviewPolicy',policy_state,'deductions',CASE WHEN complete THEN deductions ELSE '[]'::jsonb END,'deductionsResolved',NOT pending,'sourceDigest',digest,
 'reviewerOptions',CASE WHEN p_reviewer THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('participantId',ep.id,'judgeId',ep.user_id,'name',coalesce(nullif(btrim(concat_ws(' ',to_jsonb(u)->>'first_name',to_jsonb(u)->>'last_name')),''),to_jsonb(u)->>'email',u.id::text)) ORDER BY ep.id) FROM event_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.event_id=p_event AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.is_active AND ep.judge_role::text='score_reviewer' AND ep.user_id<>p_actor AND u.account_status::text='active' AND u.role::text IN('participant','voter')),'[]') END,
 'entries',CASE WHEN complete THEN entries ELSE '[]'::jsonb END,'scopes',CASE WHEN complete THEN scopes ELSE '[]'::jsonb END,'allDeductions',CASE WHEN complete THEN all_deductions ELSE '[]'::jsonb END,'qualificationCurrent',qualification->'current',
 'evidence',CASE WHEN complete THEN evidence ELSE NULL END,'rules',CASE WHEN complete THEN state->'rules' ELSE NULL END,'submissions',CASE WHEN complete THEN state->'submissions' ELSE '[]'::jsonb END,
 'calculation',CASE WHEN complete AND NOT pending AND state->'session'->>'status'='closed' AND policy_state->'active'='true'::jsonb AND calculation.source_digest=digest THEN to_jsonb(calculation)||jsonb_build_object('verified',EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calculation.id AND action='verify'),'finalized',EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calculation.id AND action='finalize')) ELSE NULL END);
END $$;

CREATE OR REPLACE FUNCTION competition_child_official_notice(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE recipients jsonb:='[]'; rounds jsonb:='[]'; scope uuid; policy competition_child_review_policies;
BEGIN
 IF competition_owns_event(p_event,p_actor) THEN PERFORM competition_native_foundation(p_event,p_competition,p_actor);
 ELSIF EXISTS(SELECT 1 FROM competition_child_review_policies WHERE competition_id=p_competition AND reviewer_id=p_actor) THEN PERFORM competition_child_reviewer_authority(p_event,p_competition,p_actor);
 ELSE PERFORM competition_native_judge_context(p_event,p_competition,p_actor,p_round); END IF;
 FOR scope IN SELECT id FROM competition_child_rounds WHERE competition_id=p_competition UNION ALL SELECT NULL::uuid WHERE EXISTS(SELECT 1 FROM competition_child_configurations WHERE competition_id=p_competition AND configuration->>'structure'='single') LOOP
  rounds:=rounds||jsonb_build_array(scope);recipients:=recipients||competition_child_scoring_recipients(p_event,p_competition,scope);
 END LOOP;
 SELECT * INTO policy FROM competition_child_review_policies WHERE competition_id=p_competition;
 IF policy.reviewer_id IS NOT NULL AND EXISTS(SELECT 1 FROM event_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.id=policy.participant_id AND ep.user_id=policy.reviewer_id AND ep.is_active AND ep.judge_role::text='score_reviewer' AND u.account_status::text='active' AND u.role::text IN('participant','voter')) THEN recipients:=recipients||jsonb_build_array(policy.reviewer_id); END IF;
 RETURN jsonb_build_object('roundIds',rounds,'userIds',(SELECT jsonb_agg(DISTINCT value ORDER BY value) FROM jsonb_array_elements_text(recipients)));
END $$;
CREATE OR REPLACE FUNCTION competition_child_reviewer_choices(p_event uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; scope uuid; result jsonb:='[]';
BEGIN
 FOR c IN SELECT child.* FROM competitions child JOIN competition_child_review_policies p ON p.competition_id=child.id WHERE child.event_id=p_event AND p.reviewer_id=p_actor ORDER BY child.name,child.id LOOP
  PERFORM competition_child_reviewer_authority(p_event,c.id,p_actor);
  FOR scope IN SELECT id FROM competition_child_rounds WHERE competition_id=c.id UNION ALL SELECT NULL::uuid WHERE EXISTS(SELECT 1 FROM competition_child_configurations WHERE competition_id=c.id AND configuration->>'structure'='single') LOOP
   result:=result||jsonb_build_array(jsonb_build_object('competitionId',c.id,'competitionName',c.name,'roundId',scope,'roundName',coalesce((SELECT definition->>'name' FROM competition_child_rounds WHERE id=scope),'Single phase')));
  END LOOP;
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION competition_child_appoint_reviewer(p_event uuid,p_competition uuid,p_actor uuid,p_participant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ep event_participants; policy competition_child_review_policies; c competitions;
BEGIN
 c:=competition_native_authority(p_event,p_competition,p_actor,false);
 IF c.official_child_rules_id IS NULL THEN RAISE EXCEPTION 'FROZEN_RULES_REQUIRED'; END IF;
 SELECT * INTO ep FROM event_participants WHERE id=p_participant;
 IF ep.event_id IS DISTINCT FROM p_event OR ep.participant_type::text<>'COMPETITION_JUDGE' OR NOT ep.is_active OR ep.judge_role::text<>'score_reviewer' OR ep.user_id=p_actor OR NOT EXISTS(SELECT 1 FROM users WHERE id=ep.user_id AND account_status::text='active' AND role::text IN('participant','voter')) OR EXISTS(SELECT 1 FROM competition_child_rule_versions v CROSS JOIN jsonb_array_elements(v.assignment_snapshot) a WHERE v.id=c.official_child_rules_id AND a->>'judgeId'=ep.user_id::text) THEN RAISE EXCEPTION 'INDEPENDENT_REVIEWER_FORBIDDEN'; END IF;
 SELECT * INTO policy FROM competition_child_review_policies WHERE competition_id=c.id;
 IF policy.competition_id IS NOT NULL THEN IF policy.participant_id IS DISTINCT FROM p_participant THEN RAISE EXCEPTION 'REVIEW_POLICY_IMMUTABLE'; END IF;RETURN to_jsonb(policy); END IF;
 INSERT INTO competition_child_review_policies VALUES(c.id,p_event,p_participant,ep.user_id,p_actor,now()) RETURNING * INTO policy;
 RETURN to_jsonb(policy);
END $$;

CREATE OR REPLACE FUNCTION competition_child_qualification_state(p_event uuid,p_competition uuid,p_round uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE q competition_child_qualifications; state jsonb; owner_id uuid;
BEGIN
 SELECT * INTO q FROM competition_child_qualifications WHERE event_id=p_event AND competition_id=p_competition AND to_round=p_round ORDER BY version DESC LIMIT 1;
 IF q.id IS NULL THEN RETURN jsonb_build_object('current',false); END IF;
 SELECT o.organizer_id INTO owner_id FROM events e JOIN organizations o ON o.id=e.organization_id WHERE e.id=p_event;
 state:=competition_child_tabulation_snapshot(p_event,p_competition,owner_id,q.from_round,false);
 RETURN to_jsonb(q)||jsonb_build_object('current',coalesce(state->'complete'='true'::jsonb AND state->'calculation'->'finalized'='true'::jsonb AND state->'calculation'->>'id'=q.calculation_id::text AND state->>'sourceDigest'=q.source_digest,false));
END $$;

CREATE OR REPLACE FUNCTION competition_child_confirm_qualification(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_calculation uuid,p_digest text,p_qualifiers jsonb,p_reason text,p_acknowledged boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; definition jsonb; target jsonb; expected jsonb; q competition_child_qualifications; cutoff numeric; n integer; kind text; results jsonb; existing_roster jsonb;
BEGIN
 PERFORM competition_native_authority(p_event,p_competition,p_actor,false);
 state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,p_round,false);
 IF state->'complete' IS DISTINCT FROM 'true'::jsonb OR state->'calculation'->'finalized' IS DISTINCT FROM 'true'::jsonb OR state->'calculation'->>'id' IS DISTINCT FROM p_calculation::text OR state->>'sourceDigest' IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'CURRENT_FINALIZED_QUALIFICATION_REQUIRED'; END IF;
 SELECT value INTO definition FROM jsonb_array_elements(state->'rules'->'configuration_snapshot'->'rounds') WHERE value->>'id'=p_round::text;
 SELECT value INTO target FROM jsonb_array_elements(state->'rules'->'configuration_snapshot'->'rounds') WHERE value->>'id'=definition->>'nextRoundId' OR definition->>'nextRoundId' IS NULL AND (value->>'displayOrder')::integer=(definition->>'displayOrder')::integer+1;
 IF target IS NULL THEN RAISE EXCEPTION 'NO_OUTGOING_QUALIFICATION'; END IF;
 IF p_acknowledged IS DISTINCT FROM true OR length(btrim(coalesce(p_reason,'')))<5 OR jsonb_typeof(p_qualifiers) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'EXPLICIT_QUALIFICATION_REVIEW_REQUIRED'; END IF;
 SELECT entry_ids INTO existing_roster FROM competition_child_sessions WHERE competition_id=p_competition AND round_id=(target->>'id')::uuid;
 results:=state->'calculation'->'output_snapshot'->'results';kind:=coalesce(definition->>'advancementType','none');
 IF (SELECT count(*) FROM jsonb_array_elements_text(p_qualifiers))<>(SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_qualifiers)) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_qualifiers) selected WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(results) r WHERE r->>'contestantId'=selected)) THEN RAISE EXCEPTION 'QUALIFIER_SCOPE_FORBIDDEN'; END IF;
 IF kind IN('top_n','top_percent') THEN
  n:=CASE WHEN kind='top_n' THEN (definition->>'advancementValue')::integer ELSE ceil(jsonb_array_length(results)*(definition->>'advancementValue')::numeric/100)::integer END;
  SELECT (r->>'rank')::numeric INTO cutoff FROM jsonb_array_elements(results) r ORDER BY (r->>'rank')::numeric OFFSET greatest(0,least(n,jsonb_array_length(results))-1) LIMIT 1;
  SELECT coalesce(jsonb_agg(r->>'contestantId' ORDER BY r->>'contestantId'),'[]') INTO expected FROM jsonb_array_elements(results) r WHERE (r->>'rank')::numeric<=cutoff;
 ELSIF kind='threshold' THEN
  SELECT coalesce(jsonb_agg(r->>'contestantId' ORDER BY r->>'contestantId'),'[]') INTO expected FROM jsonb_array_elements(results) r WHERE coalesce((SELECT (rr->>'finalScore')::numeric FROM jsonb_array_elements(state->'calculation'->'output_snapshot'->'roundResults') rr WHERE rr->>'contestantId'=r->>'contestantId' AND rr->>'roundId'=p_round::text),(r->>'finalScore')::numeric)>=(definition->>'advancementValue')::numeric;
 ELSIF kind='none' THEN SELECT coalesce(jsonb_agg(r->>'contestantId' ORDER BY r->>'contestantId'),'[]') INTO expected FROM jsonb_array_elements(results) r;
 ELSIF kind='manual' THEN expected:=p_qualifiers;
 ELSE RAISE EXCEPTION 'UNSUPPORTED_QUALIFICATION_POLICY'; END IF;
 IF kind<>'manual' AND (SELECT coalesce(jsonb_agg(value ORDER BY value),'[]') FROM jsonb_array_elements_text(p_qualifiers)) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FROZEN_QUALIFICATION_POLICY_MISMATCH'; END IF;
 IF target ? 'entryIds' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_qualifiers) selected WHERE NOT target->'entryIds' ? selected) THEN RAISE EXCEPTION 'TARGET_ROSTER_SCOPE_FORBIDDEN'; END IF;
 IF existing_roster IS NOT NULL THEN
  IF (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements_text(existing_roster)) IS DISTINCT FROM (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements_text(p_qualifiers)) THEN RAISE EXCEPTION 'QUALIFIED_ROSTER_CHANGE_REQUIRES_SESSION_REVISION'; END IF;
  p_qualifiers:=existing_roster;
 END IF;
 INSERT INTO competition_child_qualifications(event_id,competition_id,from_round,to_round,calculation_id,source_digest,qualifier_ids,policy_snapshot,confirmed_by,reason,version)
 VALUES(p_event,p_competition,p_round,(target->>'id')::uuid,p_calculation,p_digest,p_qualifiers,definition,p_actor,p_reason,coalesce((SELECT max(version)+1 FROM competition_child_qualifications WHERE competition_id=p_competition AND to_round=(target->>'id')::uuid),1)) RETURNING * INTO q;
 RETURN jsonb_build_object('qualificationId',q.id,'toRound',q.to_round,'qualifierIds',q.qualifier_ids);
END $$;

-- Preserve 105 definitions as private implementation helpers. The reviewed
-- wrappers remove only its deliberately temporary later-round prohibition.
DO $$ BEGIN
 IF to_regprocedure('competition_child_live_control_v105(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL THEN ALTER FUNCTION competition_child_live_control(uuid,uuid,uuid,uuid,text,jsonb) RENAME TO competition_child_live_control_v105; END IF;
 IF to_regprocedure('competition_child_live_view_v105(uuid,uuid,uuid,uuid,boolean)') IS NULL THEN ALTER FUNCTION competition_child_live_view(uuid,uuid,uuid,uuid,boolean) RENAME TO competition_child_live_view_v105; END IF;
END $$;
REVOKE ALL ON FUNCTION competition_child_live_control_v105(uuid,uuid,uuid,uuid,text,jsonb),competition_child_live_view_v105(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION competition_child_live_view(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_owner boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; q jsonb; blocked boolean;
BEGIN
 result:=competition_child_live_view_v105(p_event,p_competition,p_actor,p_round,p_owner);
 IF result->'laterRoundBlocked'='true'::jsonb THEN
  q:=competition_child_qualification_state(p_event,p_competition,p_round);blocked:=q->'current' IS DISTINCT FROM 'true'::jsonb;
  result:=result||jsonb_build_object('laterRoundBlocked',blocked);
  IF blocked THEN result:=result||jsonb_build_object('scoringAvailable',false,'criteria',(SELECT jsonb_agg(k||jsonb_build_object('open',false)) FROM jsonb_array_elements(result->'criteria') k),'contestants',(SELECT jsonb_agg(e||jsonb_build_object('open',false)) FROM jsonb_array_elements(result->'contestants') e)); END IF;
 END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION competition_child_live_control(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_action text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx jsonb; q jsonb; s competition_child_sessions; result jsonb; request uuid;
BEGIN
 PERFORM competition_native_authority(p_event,p_competition,p_actor,false);
 IF p_action<>'start' OR NOT EXISTS(SELECT 1 FROM competition_child_rounds WHERE id=p_round AND competition_id=p_competition AND display_order>0) THEN RETURN competition_child_live_control_v105(p_event,p_competition,p_actor,p_round,p_action,p_body); END IF;
 ctx:=competition_child_scoring_context(p_event,p_competition,p_actor,p_round,true);
 IF NOT EXISTS(SELECT 1 FROM events WHERE id=p_event AND status::text IN('draft','active')) THEN RAISE EXCEPTION 'EVENT_SCORING_CLOSED'; END IF;
 IF p_body->>'rulesVersion' IS DISTINCT FROM ctx->>'rulesVersion' OR p_body->>'setupRevision' IS DISTINCT FROM ctx->>'setupRevision' OR p_body->>'inputRevision' IS DISTINCT FROM ctx->>'inputRevision' THEN RAISE EXCEPTION 'CHILD_REVISION_CONFLICT'; END IF;
 request:=(p_body->>'requestId')::uuid;IF request IS NULL THEN RAISE EXCEPTION 'REQUEST_ID_REQUIRED'; END IF;
 SELECT * INTO s FROM competition_child_sessions WHERE competition_id=p_competition AND round_id=p_round FOR UPDATE;
 IF s.id IS NOT NULL THEN RETURN competition_child_live_control_v105(p_event,p_competition,p_actor,p_round,p_action,p_body); END IF;
 q:=competition_child_qualification_state(p_event,p_competition,p_round);
 IF q->'current' IS DISTINCT FROM 'true'::jsonb OR jsonb_array_length(q->'qualifier_ids')=0 THEN RAISE EXCEPTION 'CURRENT_CONFIRMED_QUALIFICATION_REQUIRED'; END IF;
 INSERT INTO competition_child_sessions(event_id,competition_id,round_id,rules_version,status,entry_ids) VALUES(p_event,p_competition,p_round,(ctx->>'rulesVersion')::uuid,'active',q->'qualifier_ids') RETURNING * INTO s;
 result:=jsonb_build_object('sessionId',s.id,'sessionRevision',s.revision,'status',s.status,'notificationUserIds',competition_child_scoring_recipients(p_event,p_competition,p_round));
 INSERT INTO competition_child_scoring_audit(session_id,actor_id,request_id,action,payload,result) VALUES(s.id,p_actor,request,p_action,p_body,result);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION competition_child_qualified_scoring_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s competition_child_sessions; q jsonb;
BEGIN
 IF TG_TABLE_NAME='competition_child_sessions' THEN s:=NEW;IF NEW.status<>'active' THEN RETURN NEW; END IF;
 ELSE
  IF TG_TABLE_NAME='competition_child_score_drafts' AND TG_OP='UPDATE' THEN IF OLD.locked AND NOT NEW.locked AND OLD.scores=NEW.scores THEN RETURN NEW; END IF; END IF;
  SELECT * INTO s FROM competition_child_sessions WHERE id=NEW.session_id;
 END IF;
 IF s.round_id IS NOT NULL AND EXISTS(SELECT 1 FROM competition_child_rounds WHERE id=s.round_id AND competition_id=s.competition_id AND display_order>0) THEN
  q:=competition_child_qualification_state(s.event_id,s.competition_id,s.round_id);
  IF q->'current' IS DISTINCT FROM 'true'::jsonb OR s.entry_ids IS DISTINCT FROM q->'qualifier_ids' THEN RAISE EXCEPTION 'STALE_OR_MISSING_QUALIFICATION'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['competition_child_sessions','competition_child_score_drafts','competition_child_submissions','competition_child_submission_heads'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass AND tgname='competition_child_qualified_scoring_guard') THEN EXECUTE format('CREATE TRIGGER competition_child_qualified_scoring_guard BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION competition_child_qualified_scoring_guard()',t); END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION competition_child_official_calculate(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_digest text,p_input jsonb,p_output jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; c competitions; calc competition_child_calculations; expected integer;
BEGIN
 c:=competition_native_authority(p_event,p_competition,p_actor,false);
 PERFORM 1 FROM competition_child_sessions WHERE competition_id=c.id FOR UPDATE;
 state:=competition_child_tabulation_snapshot(p_event,c.id,p_actor,p_round,false);
 IF state->'complete' IS DISTINCT FROM 'true'::jsonb OR state->'session'->>'status' IS DISTINCT FROM 'closed' OR state->'deductionsResolved' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CLOSED_COMPLETE_RESOLVED_SOURCES_REQUIRED'; END IF;
 IF state->>'sourceDigest' IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'STALE_CALCULATION_INPUTS'; END IF;
 PERFORM competition_child_reviewer_authority(p_event,c.id,(state->'reviewPolicy'->>'reviewer_id')::uuid);
 IF state->'calculation'->'finalized'='true'::jsonb THEN RAISE EXCEPTION 'CURRENT_CALCULATION_ALREADY_FINALIZED'; END IF;
 expected:=jsonb_array_length(state->'session'->'entry_ids');
 IF p_input->'rules'->>'id' IS DISTINCT FROM c.official_child_rules_id::text OR p_output->'ready' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_output->'results') IS DISTINCT FROM 'array' OR jsonb_array_length(p_output->'results')<>expected OR (SELECT count(DISTINCT r->>'contestantId') FROM jsonb_array_elements(p_output->'results') r)<>expected OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_output->'results') r WHERE NOT state->'session'->'entry_ids' ? (r->>'contestantId')) THEN RAISE EXCEPTION 'INVALID_OFFICIAL_ENGINE_OUTPUT'; END IF;
 IF state->'rules'->'configuration_snapshot'->'scoringConfig'->>'calculationMethod'='manual' AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_output->'results') r WHERE r->'manual' IS DISTINCT FROM 'true'::jsonb OR r->>'finalScore' IS NOT NULL OR (r->>'rank')::numeric<1 OR (r->>'rank')::numeric<>trunc((r->>'rank')::numeric)) THEN RAISE EXCEPTION 'EXPLICIT_MANUAL_PLACEMENTS_REQUIRED'; END IF;
 INSERT INTO competition_child_calculations(event_id,competition_id,round_id,session_id,rules_version,source_digest,source_snapshot,input_snapshot,output_snapshot,version,created_by)
 VALUES(p_event,c.id,p_round,(state->'session'->>'id')::uuid,c.official_child_rules_id,p_digest,state-'calculation',p_input,p_output,coalesce((SELECT max(version)+1 FROM competition_child_calculations WHERE competition_id=c.id),1),p_actor) RETURNING * INTO calc;
 RETURN jsonb_build_object('calculationId',calc.id,'version',calc.version);
END $$;

CREATE OR REPLACE FUNCTION competition_child_official_transition(p_event uuid,p_competition uuid,p_actor uuid,p_calculation uuid,p_action text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE calc competition_child_calculations; state jsonb; reviewer uuid;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;PERFORM 1 FROM competitions WHERE id=p_competition AND event_id=p_event FOR UPDATE;
 SELECT * INTO calc FROM competition_child_calculations WHERE id=p_calculation AND event_id=p_event AND competition_id=p_competition;
 IF calc.id IS NULL THEN RAISE EXCEPTION 'CALCULATION_FORBIDDEN'; END IF;
 IF p_action='verify' THEN PERFORM competition_child_reviewer_authority(p_event,p_competition,p_actor);IF p_actor=calc.created_by THEN RAISE EXCEPTION 'INDEPENDENT_APPROVAL_REQUIRED'; END IF;
 ELSIF p_action='finalize' THEN PERFORM competition_native_foundation(p_event,p_competition,p_actor);
 ELSE RAISE EXCEPTION 'INVALID_OFFICIAL_TRANSITION'; END IF;
 state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,calc.round_id,p_action='verify');
 IF state->'calculation'->>'id' IS DISTINCT FROM calc.id::text OR state->>'sourceDigest' IS DISTINCT FROM calc.source_digest OR state->'complete' IS DISTINCT FROM 'true'::jsonb OR state->'session'->>'status' IS DISTINCT FROM 'closed' THEN RAISE EXCEPTION 'STALE_OR_INCOMPLETE_CALCULATION'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'EXPLICIT_REVIEW_REASON_REQUIRED'; END IF;
 IF p_action='finalize' THEN
  SELECT actor_id INTO reviewer FROM competition_child_calculation_transitions WHERE calculation_id=calc.id AND action='verify';
  IF reviewer IS NULL OR reviewer=calc.created_by THEN RAISE EXCEPTION 'INDEPENDENT_VERIFICATION_REQUIRED'; END IF;
  PERFORM competition_child_reviewer_authority(p_event,p_competition,reviewer);
 END IF;
 INSERT INTO competition_child_calculation_transitions(calculation_id,action,actor_id,reason) VALUES(calc.id,p_action,p_actor,p_reason);
 RETURN jsonb_build_object('calculationId',calc.id,'action',p_action);
END $$;

CREATE OR REPLACE FUNCTION competition_child_deduction_action(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_action text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s competition_child_sessions; state jsonb; rule jsonb; decision competition_child_deduction_decisions; last_action text;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;PERFORM 1 FROM competitions WHERE id=p_competition AND event_id=p_event FOR UPDATE;
 IF p_action='propose' THEN PERFORM competition_native_foundation(p_event,p_competition,p_actor); ELSE PERFORM competition_child_reviewer_authority(p_event,p_competition,p_actor); END IF;
 state:=competition_child_current_sources(p_event,p_competition,p_round);
 SELECT * INTO s FROM competition_child_sessions WHERE competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'SCORING_SESSION_REQUIRED'; END IF;
 IF p_action='propose' THEN
  SELECT value INTO rule FROM jsonb_array_elements(state->'rules'->'configuration_snapshot'->'scoringConfig'->'deductionRules') WHERE value->>'id'=p_body->>'ruleKey';
  IF rule IS NULL OR NOT s.entry_ids ? (p_body->>'entryId') OR rule->>'roundId' IS NOT NULL AND rule->>'roundId' IS DISTINCT FROM p_round::text OR rule->>'criteriaId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state->'rules'->'configuration_snapshot'->'criteria') k WHERE k->>'id'=rule->>'criteriaId' AND (k->>'roundId')::uuid IS NOT DISTINCT FROM p_round) THEN RAISE EXCEPTION 'DEDUCTION_SCOPE_FORBIDDEN'; END IF;
  IF p_round IS NOT NULL AND rule->>'roundId' IS NULL AND rule->>'criteriaId' IS NULL AND EXISTS(SELECT 1 FROM competition_child_rounds WHERE competition_id=p_competition AND display_order>(SELECT display_order FROM competition_child_rounds WHERE id=p_round)) THEN RAISE EXCEPTION 'GLOBAL_DEDUCTION_REQUIRES_FINAL_SCOPE'; END IF;
  IF length(btrim(coalesce(p_body->>'offenseKey','')))=0 OR length(btrim(coalesce(p_body->>'reason','')))<5 THEN RAISE EXCEPTION 'DEDUCTION_OFFENSE_REASON_REQUIRED'; END IF;
  INSERT INTO competition_child_deduction_decisions(session_id,entry_id,rule_key,offense_key,rule_snapshot,reason,proposed_by) VALUES(s.id,(p_body->>'entryId')::uuid,p_body->>'ruleKey',p_body->>'offenseKey',rule,p_body->>'reason',p_actor) RETURNING * INTO decision;
 ELSE
  SELECT * INTO decision FROM competition_child_deduction_decisions WHERE id=(p_body->>'decisionId')::uuid AND session_id=s.id;
  IF decision.id IS NULL OR decision.proposed_by=p_actor THEN RAISE EXCEPTION 'DEDUCTION_REVIEW_FORBIDDEN'; END IF;
  SELECT action INTO last_action FROM competition_child_deduction_reviews WHERE decision_id=decision.id ORDER BY version DESC LIMIT 1;
  IF p_action NOT IN('approve','reject','revoke') OR p_action IN('approve','reject') AND last_action IS NOT NULL OR p_action='revoke' AND last_action IS DISTINCT FROM 'approve' THEN RAISE EXCEPTION 'INVALID_DEDUCTION_TRANSITION'; END IF;
  IF length(btrim(coalesce(p_body->>'reason','')))<5 THEN RAISE EXCEPTION 'DEDUCTION_REVIEW_REASON_REQUIRED'; END IF;
  INSERT INTO competition_child_deduction_reviews(decision_id,action,reason,actor_id,version) VALUES(decision.id,p_action,p_body->>'reason',p_actor,coalesce((SELECT max(version)+1 FROM competition_child_deduction_reviews WHERE decision_id=decision.id),1));
 END IF;
 RETURN jsonb_build_object('decisionId',decision.id,'action',p_action);
END $$;

-- All implementation helpers remain private; authorized API operations only.
-- A changed preceding source pauses an already-active dependent session.
-- Reconfirming an unchanged roster never resumes that session automatically.
CREATE OR REPLACE FUNCTION competition_child_pause_dependent_sessions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.round_id IS NOT NULL THEN
  UPDATE competition_child_sessions next_session SET status='paused',revision=next_session.revision+1
  FROM competition_child_rounds target,competition_child_rounds source
  WHERE source.id=NEW.round_id AND target.competition_id=NEW.competition_id AND target.display_order>source.display_order
   AND next_session.competition_id=NEW.competition_id AND next_session.round_id=target.id AND next_session.status='active';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION competition_child_deduction_source_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE session_uuid uuid;
BEGIN
 IF TG_TABLE_NAME='competition_child_deduction_decisions' THEN session_uuid:=NEW.session_id;
 ELSE SELECT session_id INTO session_uuid FROM competition_child_deduction_decisions WHERE id=NEW.decision_id; END IF;
 UPDATE competition_child_sessions SET source_revision=source_revision+1 WHERE id=session_uuid;
 RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='competition_child_sessions'::regclass AND tgname='competition_child_pause_dependents') THEN CREATE TRIGGER competition_child_pause_dependents AFTER UPDATE OF revision,source_revision,status ON competition_child_sessions FOR EACH ROW WHEN(OLD.revision IS DISTINCT FROM NEW.revision OR OLD.source_revision IS DISTINCT FROM NEW.source_revision OR OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION competition_child_pause_dependent_sessions(); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='competition_child_deduction_decisions'::regclass AND tgname='competition_child_deduction_source_revision') THEN CREATE TRIGGER competition_child_deduction_source_revision AFTER INSERT ON competition_child_deduction_decisions FOR EACH ROW EXECUTE FUNCTION competition_child_deduction_source_revision(); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='competition_child_deduction_reviews'::regclass AND tgname='competition_child_deduction_source_revision') THEN CREATE TRIGGER competition_child_deduction_source_revision AFTER INSERT ON competition_child_deduction_reviews FOR EACH ROW EXECUTE FUNCTION competition_child_deduction_source_revision(); END IF;
END $$;
REVOKE ALL ON FUNCTION competition_child_reviewer_authority(uuid,uuid,uuid),competition_child_current_sources(uuid,uuid,uuid),competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION competition_child_appoint_reviewer(uuid,uuid,uuid,uuid),competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb),competition_child_official_transition(uuid,uuid,uuid,uuid,text,text),competition_child_deduction_action(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION competition_child_appoint_reviewer(uuid,uuid,uuid,uuid),competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb),competition_child_official_transition(uuid,uuid,uuid,uuid,text,text),competition_child_deduction_action(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION competition_child_qualification_state(uuid,uuid,uuid),competition_child_qualified_scoring_guard(),competition_child_confirm_qualification(uuid,uuid,uuid,uuid,uuid,text,jsonb,text,boolean),competition_child_live_view(uuid,uuid,uuid,uuid,boolean),competition_child_live_control(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION competition_child_confirm_qualification(uuid,uuid,uuid,uuid,uuid,text,jsonb,text,boolean),competition_child_live_view(uuid,uuid,uuid,uuid,boolean),competition_child_live_control(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION competition_child_official_notice(uuid,uuid,uuid,uuid),competition_child_reviewer_choices(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION competition_child_official_notice(uuid,uuid,uuid,uuid),competition_child_reviewer_choices(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION competition_child_official_relation_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION competition_child_pause_dependent_sessions(),competition_child_deduction_source_revision() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
