-- Apply once after 096. Correct No Elimination semantics without rewriting
-- rule versions, judge sources, decisions, historical results or memberships.
BEGIN;
CREATE FUNCTION competition_progression_sources(p_rounds jsonb,p_round uuid) RETURNS SETOF jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT s FROM jsonb_array_elements(coalesce(p_rounds,'[]')) s
 JOIN LATERAL (SELECT t FROM jsonb_array_elements(p_rounds) t WHERE t->>'id'=p_round::text) target ON true
 WHERE coalesce(s->>'purpose','regular')<>'special' AND coalesce(target.t->>'purpose','regular')<>'special'
 AND (s->>'displayOrder')::integer<(target.t->>'displayOrder')::integer
 AND coalesce(nullif(s->>'nextRoundId',''),(SELECT n->>'id' FROM jsonb_array_elements(p_rounds) n
   WHERE coalesce(n->>'purpose','regular')<>'special' AND (n->>'displayOrder')::integer>(s->>'displayOrder')::integer
   ORDER BY (n->>'displayOrder')::integer,n->>'id' LIMIT 1))=p_round::text;
$$;
CREATE OR REPLACE FUNCTION competition_qualification_sources(p_rounds jsonb,p_round uuid) RETURNS SETOF jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT s FROM competition_progression_sources(p_rounds,p_round) s WHERE coalesce(s->>'advancementType','none')<>'none';
$$;

CREATE FUNCTION competition_round_roster(p_event uuid,p_rules uuid,p_round uuid,p_visited uuid[] DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE snap jsonb; r jsonb; source jsonb; ids jsonb; entries jsonb; total integer;
BEGIN
 IF p_round=ANY(p_visited) THEN RAISE EXCEPTION 'INVALID_ROUND_PROGRESSION'; END IF;
 IF p_rules IS NULL THEN snap:=competition_registration_source(p_event);entries:=snap->'entries';
 ELSE SELECT snapshot INTO snap FROM competition_rule_versions WHERE id=p_rules AND event_id=p_event;entries:=snap->'contestants'; END IF;
 IF snap IS NULL THEN RAISE EXCEPTION 'RULES_VERSION_FORBIDDEN'; END IF;
 IF p_round IS NULL THEN ids:=coalesce((SELECT jsonb_agg(entry->'id') FROM jsonb_array_elements(entries) entry),'[]');
 ELSE
   SELECT value INTO r FROM jsonb_array_elements(snap->'rounds') WHERE value->>'id'=p_round::text;
   IF r IS NULL THEN RAISE EXCEPTION 'ROUND_FORBIDDEN'; END IF;
   SELECT count(*) INTO total FROM competition_progression_sources(snap->'rounds',p_round);
   IF total>1 THEN RAISE EXCEPTION 'AMBIGUOUS_ROUND_PROGRESSION'; END IF;
   SELECT s INTO source FROM competition_progression_sources(snap->'rounds',p_round) s;
   IF source IS NULL THEN ids:=coalesce(r->'contestantIds','[]');
   ELSIF coalesce(source->>'advancementType','none')='none' THEN ids:=competition_round_roster(p_event,p_rules,(source->>'id')::uuid,p_visited||p_round);
   ELSE SELECT qualifiers INTO ids FROM competition_advancement_decisions WHERE event_id=p_event AND rules_version=p_rules AND round_id=(source->>'id')::uuid AND next_round_id=p_round ORDER BY confirmed_at DESC LIMIT 1;
   END IF;
 END IF;
 RETURN coalesce((SELECT jsonb_agg(entry->'id' ORDER BY members.position) FROM jsonb_array_elements(coalesce(ids,'[]')) WITH ORDINALITY members(id,position)
   JOIN jsonb_array_elements(entries) entry ON entry->'id'=members.id
   WHERE (r->>'divisionId' IS NULL OR r->>'divisionId'=entry->>'divisionId')
   AND NOT EXISTS(SELECT 1 FROM competition_eligibility_decisions d WHERE d.event_id=p_event AND d.rules_version=p_rules AND d.contestant_id=(entry->>'id')::uuid AND d.status='approved' AND (d.round_id IS NULL OR d.round_id=p_round))),'[]');
END; $$;

CREATE OR REPLACE FUNCTION competition_require_qualified(p_event uuid,p_rules uuid,p_round uuid,p_entry uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE snap jsonb; source jsonb;
BEGIN
 IF p_round IS NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM competition_rounds WHERE id=p_round AND event_id=p_event) THEN RAISE EXCEPTION 'ROUND_FORBIDDEN'; END IF;
 IF p_rules IS NULL THEN snap:=competition_registration_source(p_event);ELSE SELECT snapshot INTO snap FROM competition_rule_versions WHERE id=p_rules AND event_id=p_event;END IF;
 IF (SELECT count(*) FROM competition_progression_sources(snap->'rounds',p_round))>1 THEN RAISE EXCEPTION 'AMBIGUOUS_ROUND_PROGRESSION';END IF;
 SELECT s INTO source FROM competition_progression_sources(snap->'rounds',p_round) s;
 IF source IS NOT NULL THEN
   IF coalesce(source->>'advancementType','none')<>'none' THEN
     IF NOT EXISTS(SELECT 1 FROM competition_advancement_decisions WHERE event_id=p_event AND rules_version=p_rules AND round_id=(source->>'id')::uuid AND next_round_id=p_round) THEN RAISE EXCEPTION 'QUALIFICATION_NOT_CONFIRMED: Awaiting verified and approved advancement';END IF;
   ELSE PERFORM competition_require_qualified(p_event,p_rules,(source->>'id')::uuid);END IF;
 END IF;
 IF p_entry IS NOT NULL AND NOT competition_round_roster(p_event,p_rules,p_round) ? p_entry::text THEN
   IF source IS NOT NULL AND coalesce(source->>'advancementType','none')<>'none' THEN RAISE EXCEPTION 'ENTRY_NOT_QUALIFIED_FOR_ROUND';END IF;
   RAISE EXCEPTION 'ENTRY_NOT_ELIGIBLE_FOR_ROUND';
 END IF;
END; $$;

CREATE OR REPLACE FUNCTION competition_guard_frozen_setup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_event uuid; official uuid; operation text;
BEGIN
 IF TG_TABLE_NAME IN('competition_round_criteria','competition_round_contestants') THEN SELECT r.event_id INTO v_event FROM competition_rounds r WHERE id=coalesce(NEW.round_id,OLD.round_id);
 ELSIF TG_TABLE_NAME='competition_judge_assignments' THEN SELECT ep.event_id INTO v_event FROM event_participants ep WHERE ep.id=coalesce(NEW.participant_id,OLD.participant_id);
 ELSE v_event:=coalesce(NEW.event_id,OLD.event_id);END IF;
 SELECT official_rules_id INTO official FROM events WHERE id=v_event FOR UPDATE;
 operation:=coalesce(current_setting('votrix.authorized_operation',true),'');
 IF official IS NOT NULL AND operation IS DISTINCT FROM 'advancement' AND NOT(TG_TABLE_NAME='competition_round_contestants' AND operation='progression') THEN RAISE EXCEPTION 'OFFICIAL_SETUP_FROZEN';END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;

CREATE OR REPLACE FUNCTION competition_guard_round_participation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target uuid; entry_id uuid; v_event uuid; v_rules uuid; r competition_rounds; c competition_contestants; snap jsonb; source jsonb; operation text;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.round_id ELSE NEW.round_id END;entry_id:=CASE WHEN TG_OP='DELETE' THEN OLD.contestant_id ELSE NEW.contestant_id END;
 SELECT * INTO r FROM competition_rounds WHERE id=target;v_event:=r.event_id;
 SELECT official_rules_id INTO v_rules FROM events WHERE id=v_event FOR UPDATE;
 IF TG_OP='UPDATE' AND (OLD.round_id IS DISTINCT FROM NEW.round_id OR OLD.contestant_id IS DISTINCT FROM NEW.contestant_id) THEN RAISE EXCEPTION 'REPLACE_MEMBERSHIP_THROUGH_AUTHORIZED_OPERATION';END IF;
 IF v_rules IS NULL THEN snap:=competition_registration_source(v_event);ELSE SELECT snapshot INTO snap FROM competition_rule_versions WHERE id=v_rules;END IF;
 SELECT s INTO source FROM competition_progression_sources(snap->'rounds',target) s;
 operation:=current_setting('votrix.authorized_operation',true);
 IF source IS NOT NULL THEN
   IF coalesce(source->>'advancementType','none')<>'none' THEN
     IF operation IS DISTINCT FROM 'advancement' THEN RAISE EXCEPTION 'PROTECTED_ROUND_ASSIGNMENT: Use approved advancement';END IF;
   ELSIF operation IS DISTINCT FROM 'progression' THEN RAISE EXCEPTION 'SEQUENCED_ROUND_ASSIGNMENT: Manage the source-round field and activate progression in Live Control';END IF;
   IF TG_OP<>'DELETE' THEN PERFORM competition_require_qualified(v_event,v_rules,target,entry_id);END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
   SELECT * INTO c FROM competition_contestants WHERE id=entry_id AND event_id=v_event;
   IF c.id IS NULL THEN RAISE EXCEPTION 'ENTRY_FORBIDDEN';END IF;
   IF r.division_id IS NOT NULL AND c.division_id IS DISTINCT FROM r.division_id THEN RAISE EXCEPTION 'ENTRY_DIVISION_NOT_ELIGIBLE';END IF;
   IF EXISTS(SELECT 1 FROM competition_eligibility_decisions d WHERE d.event_id=v_event AND d.rules_version=v_rules AND d.contestant_id=entry_id AND d.status='approved' AND (d.round_id IS NULL OR d.round_id=target)) THEN RAISE EXCEPTION 'ENTRY_NON_COMPETING';END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;

CREATE OR REPLACE FUNCTION competition_set_round_membership(p_event uuid,p_actor uuid,p_round uuid,p_entry uuid,p_add boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e events; source jsonb;
BEGIN
 SELECT * INTO e FROM events WHERE id=p_event FOR UPDATE;
 IF NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN';END IF;
 IF e.status<>'draft' OR e.official_rules_id IS NOT NULL THEN RAISE EXCEPTION 'OFFICIAL_SETUP_FROZEN';END IF;
 IF NOT EXISTS(SELECT 1 FROM competition_rounds WHERE id=p_round AND event_id=p_event) OR NOT EXISTS(SELECT 1 FROM competition_contestants WHERE id=p_entry AND event_id=p_event) THEN RAISE EXCEPTION 'ROUND_OR_ENTRY_FORBIDDEN';END IF;
 SELECT s INTO source FROM competition_progression_sources(competition_registration_source(p_event)->'rounds',p_round) s;
 IF source IS NOT NULL THEN
   IF coalesce(source->>'advancementType','none')<>'none' THEN RAISE EXCEPTION 'PROTECTED_ROUND_ASSIGNMENT: Use approved advancement';
   ELSE RAISE EXCEPTION 'SEQUENCED_ROUND_ASSIGNMENT: Manage the source-round field';END IF;
 END IF;
 IF p_add THEN INSERT INTO competition_round_contestants(round_id,contestant_id) VALUES(p_round,p_entry) ON CONFLICT DO NOTHING;
 ELSE DELETE FROM competition_round_contestants WHERE round_id=p_round AND contestant_id=p_entry;END IF;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,CASE WHEN p_add THEN 'competition.entry.assign' ELSE 'competition.entry.remove' END,'competition_rounds',p_round,jsonb_build_object('contestantId',p_entry));
 RETURN jsonb_build_object('success',true);
END; $$;

CREATE FUNCTION competition_sync_continuing_roster(p_event uuid,p_actor uuid,p_rules uuid,p_round uuid,p_ids jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snap jsonb; source jsonb; previous jsonb; previous_operation text;
BEGIN
 SELECT snapshot INTO snap FROM competition_rule_versions WHERE id=p_rules AND event_id=p_event;
 SELECT s INTO source FROM competition_progression_sources(snap->'rounds',p_round) s;
 IF source IS NULL OR coalesce(source->>'advancementType','none')<>'none' THEN RETURN;END IF;
 IF NOT competition_owns_event(p_event,p_actor) OR p_ids IS DISTINCT FROM competition_round_roster(p_event,p_rules,p_round) THEN RAISE EXCEPTION 'PROGRESSION_FORBIDDEN';END IF;
 SELECT coalesce(jsonb_agg(contestant_id ORDER BY contestant_id),'[]') INTO previous FROM competition_round_contestants WHERE round_id=p_round;
 previous_operation:=current_setting('votrix.authorized_operation',true);
 PERFORM set_config('votrix.authorized_operation','progression',true);
 DELETE FROM competition_round_contestants WHERE round_id=p_round;
 INSERT INTO competition_round_contestants(round_id,contestant_id) SELECT p_round,value::uuid FROM jsonb_array_elements_text(p_ids) value;
 PERFORM set_config('votrix.authorized_operation',coalesce(previous_operation,''),true);
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.round.all_continue','competition_rounds',p_round,jsonb_build_object('rulesVersion',p_rules,'sourceRoundId',source->>'id','previousMembership',previous,'eligibleEntries',p_ids,'reason','Live Control activation; no elimination'));
END; $$;

CREATE FUNCTION competition_validate_participation(p_event uuid,p_actor uuid,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; amount numeric;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 IF NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN';END IF;
 IF p_source IS DISTINCT FROM competition_registration_source(p_event) THEN RAISE EXCEPTION 'REGISTRATION_SETUP_CHANGED_REFRESH';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_source->'rounds') LOOP
   amount:=(r->>'advancementValue')::numeric;
   IF r->>'advancementType'='top_n' AND (amount IS NULL OR amount<1 OR amount<>trunc(amount)) THEN RAISE EXCEPTION 'INVALID_TOP_N_RULE';END IF;
   IF r->>'advancementType'='top_percent' AND (amount IS NULL OR amount<=0 OR amount>100) THEN RAISE EXCEPTION 'INVALID_TOP_PERCENT_RULE';END IF;
   IF r->>'advancementType'='threshold' AND (amount IS NULL OR amount<0) THEN RAISE EXCEPTION 'INVALID_THRESHOLD_RULE';END IF;
   IF r->>'nextRoundId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_source->'rounds') n WHERE n->>'id'=r->>'nextRoundId' AND coalesce(n->>'purpose','regular')<>'special' AND (n->>'displayOrder')::integer>(r->>'displayOrder')::integer) THEN RAISE EXCEPTION 'INVALID_MAIN_ROUND_DESTINATION';END IF;
   IF (SELECT count(*) FROM competition_progression_sources(p_source->'rounds',(r->>'id')::uuid))>1 THEN RAISE EXCEPTION 'AMBIGUOUS_ROUND_PROGRESSION';END IF;
 END LOOP;
 RETURN true;
END; $$;
CREATE OR REPLACE FUNCTION competition_publish_rules(p_event uuid,p_actor uuid,p_id uuid,p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_snapshot->>'participationModel' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'PARTICIPATION_MODEL_CHANGED_REFRESH';END IF;
 IF p_snapshot->'scoringConfig'->>'calculationMethod' IN('manual','rank_based') AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_snapshot->'rounds') r WHERE r->>'advancementType'='threshold') THEN RAISE EXCEPTION 'THRESHOLD_REQUIRES_NUMERIC_RESULTS';END IF;
 PERFORM competition_validate_participation(p_event,p_actor,p_snapshot->'registrationSource');
 RETURN competition_publish_rules_v095(p_event,p_actor,p_id,p_snapshot);
END; $$;

CREATE FUNCTION competition_participation_context(p_event uuid,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rules uuid; rules jsonb; session competition_sessions;
BEGIN
 IF NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN';END IF;
 SELECT official_rules_id INTO v_rules FROM events WHERE id=p_event;
 SELECT to_jsonb(rv) INTO rules FROM competition_rule_versions rv WHERE id=v_rules AND event_id=p_event;
 SELECT * INTO session FROM competition_sessions WHERE event_id=p_event AND rules_version=v_rules ORDER BY started_at DESC NULLS LAST,id DESC LIMIT 1;
 RETURN jsonb_build_object('known',true,'rules',rules,'session',CASE WHEN session.id IS NULL THEN NULL ELSE to_jsonb(session) END,
 'submissions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'version',s.version,'judge_id',s.judge_id,'session_id',s.session_id,'rules_version',s.rules_version,'round_id',s.round_id,'status',s.status)) FROM competition_round_submissions s WHERE s.event_id=p_event AND s.rules_version=v_rules AND s.session_id=session.id),'[]'),
 'calculations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'rules_version',c.rules_version,'round_id',c.round_id,'session_id',c.session_id,'status',c.status,'verified_at',c.verified_at,'source_versions',c.source_versions,'created_at',c.created_at)) FROM competition_result_calculations c WHERE c.event_id=p_event AND c.rules_version=v_rules),'[]'));
END; $$;

CREATE OR REPLACE FUNCTION competition_scoring_write_v095(p_event uuid,p_judge uuid,p_context jsonb,p_action text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s competition_sessions; ep event_participants; rv competition_rule_versions;
 entry jsonb; crit jsonb; minor jsonb; sc competition_session_judge_scores;
 targets jsonb; v numeric; merged jsonb; locks jsonb; group_id uuid;
 existing_id uuid; draft competition_judge_drafts; v_revision bigint; full_lock boolean;
 scopes jsonb; allowed boolean; scope_round jsonb; source_list jsonb; submission competition_round_submissions;
BEGIN
 IF p_context->>'judgeId' IS DISTINCT FROM p_judge::text THEN RAISE EXCEPTION 'STALE_JUDGE_CONTEXT'; END IF;
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 SELECT * INTO s FROM competition_sessions WHERE id=(p_context->>'sessionId')::uuid AND event_id=p_event FOR UPDATE;
 IF s.rules_version IS DISTINCT FROM (SELECT official_rules_id FROM events WHERE id=p_event) THEN RAISE EXCEPTION 'STALE_RULES_VERSION'; END IF;
 IF s.id IS NULL OR s.rules_version IS DISTINCT FROM (p_context->>'rulesVersion')::uuid OR s.current_round_id IS DISTINCT FROM nullif(p_context->>'roundId','')::uuid THEN RAISE EXCEPTION 'STALE_CONTEXT'; END IF;
 SELECT * INTO rv FROM competition_rule_versions WHERE id=s.rules_version AND event_id=p_event;
 IF rv.id IS NULL THEN RAISE EXCEPTION 'RULES_NOT_CONFIRMED'; END IF;
 SELECT * INTO ep FROM event_participants WHERE event_id=p_event AND user_id=p_judge AND participant_type='COMPETITION_JUDGE' AND is_active=true;
 IF ep.id IS NULL OR coalesce(ep.judge_role::text,'judge') NOT IN ('judge','head_judge') OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_judge AND account_status='active') THEN RAISE EXCEPTION 'JUDGE_FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rv.snapshot->'judges') j WHERE j->>'judgeId'=p_judge::text) THEN RAISE EXCEPTION 'JUDGE_NOT_IN_RULES'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') INTO scopes FROM competition_judge_assignments a WHERE participant_id=ep.id;
 SELECT r INTO scope_round FROM jsonb_array_elements(rv.snapshot->'rounds') r WHERE r->>'id'=s.current_round_id::text;
 IF EXISTS(SELECT 1 FROM competition_eligibility_decisions WHERE event_id=p_event AND rules_version=rv.id AND contestant_id=(p_payload->>'contestantId')::uuid AND (round_id IS NULL OR round_id=s.current_round_id) AND status='approved') THEN RAISE EXCEPTION 'ENTRY_NON_COMPETING'; END IF;
 IF s.current_round_id IS NOT NULL THEN scope_round:=jsonb_set(scope_round,'{contestantIds}',competition_round_roster(p_event,rv.id,s.current_round_id)); END IF;
 SELECT * INTO submission FROM competition_round_submissions WHERE session_id=s.id AND judge_id=p_judge AND round_id IS NOT DISTINCT FROM s.current_round_id AND status='submitted';
 IF submission.id IS NOT NULL THEN
   IF p_action='submit' THEN RETURN jsonb_build_object('submission',to_jsonb(submission),'duplicate',true); END IF;
   RAISE EXCEPTION 'ROUND_ALREADY_SUBMITTED';
 END IF;
 IF p_action='submit' THEN
   IF NOT s.submission_window THEN RAISE EXCEPTION 'SUBMISSION_WINDOW_CLOSED'; END IF;
   source_list:='[]';
   FOR entry IN SELECT e FROM jsonb_array_elements(rv.snapshot->'contestants') e LOOP
     IF s.current_round_id IS NOT NULL AND NOT coalesce(scope_round->'contestantIds','[]') ? (entry->>'id') THEN CONTINUE; END IF;
     allowed:=jsonb_array_length(scopes)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(scopes) a WHERE
       (a->>'scope'='event' AND a->>'scope_id'=p_event::text) OR (a->>'scope'='round' AND a->>'scope_id'=s.current_round_id::text) OR
       (a->>'scope'='division' AND a->>'scope_id'=entry->>'divisionId') OR (a->>'scope'='category' AND a->>'scope_id'=scope_round->>'categoryId'));
     IF NOT allowed OR EXISTS(SELECT 1 FROM competition_eligibility_decisions WHERE event_id=p_event AND rules_version=rv.id AND contestant_id=(entry->>'id')::uuid AND (round_id IS NULL OR round_id=s.current_round_id) AND status='approved') THEN CONTINUE; END IF;
     SELECT * INTO sc FROM competition_session_judge_scores WHERE session_id=s.id AND judge_id=p_judge AND round_id IS NOT DISTINCT FROM s.current_round_id AND contestant_id=(entry->>'id')::uuid AND rules_version=rv.id ORDER BY updated_at DESC LIMIT 1;
     FOR crit IN SELECT c FROM jsonb_array_elements(rv.snapshot->'criteria') c WHERE coalesce((c->>'isActive')::boolean,true) LOOP
       IF s.current_round_id IS NOT NULL AND NOT coalesce(scope_round->'criteriaIds','[]') ? (crit->>'id') THEN CONTINUE; END IF;
       IF NOT coalesce(sc.locked_criteria,'[]') ? (crit->>'id') THEN RAISE EXCEPTION 'INCOMPLETE_LOCKS'; END IF;
     END LOOP;
     source_list:=source_list || jsonb_build_array(jsonb_build_object('id',sc.id,'contestantId',sc.contestant_id,'revision',sc.revision,'locks',sc.lock_versions,'scores',sc.scores));
   END LOOP;
   IF jsonb_array_length(source_list)=0 THEN RAISE EXCEPTION 'NO_ASSIGNED_ENTRIES'; END IF;
   IF EXISTS(SELECT 1 FROM competition_judge_drafts d WHERE session_id=s.id AND judge_id=p_judge AND round_id IS NOT DISTINCT FROM s.current_round_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(source_list) value WHERE value->>'contestantId'=d.contestant_id::text)) THEN RAISE EXCEPTION 'UNRESOLVED_DRAFTS'; END IF;
   SELECT coalesce(max(version),0)+1 INTO v_revision FROM competition_round_submissions WHERE session_id=s.id AND judge_id=p_judge AND round_id IS NOT DISTINCT FROM s.current_round_id;
   INSERT INTO competition_round_submissions(event_id,session_id,round_id,judge_id,rules_version,version,status,sources) VALUES(p_event,s.id,s.current_round_id,p_judge,rv.id,v_revision,'submitted',source_list) RETURNING * INTO submission;
   INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_judge,'competition.round.submit','competition_round_submissions',submission.id,jsonb_build_object('rulesVersion',rv.id,'version',v_revision));
   RETURN jsonb_build_object('submission',to_jsonb(submission));
 END IF;
 IF p_action NOT IN ('draft','lock') OR s.status<>'active' THEN RAISE EXCEPTION 'SCORING_CLOSED'; END IF;
 group_id:=(p_payload->>'criteriaId')::uuid;
 SELECT e INTO entry FROM jsonb_array_elements(rv.snapshot->'contestants') e WHERE e->>'id'=p_payload->>'contestantId';
 SELECT c INTO crit FROM jsonb_array_elements(rv.snapshot->'criteria') c WHERE c->>'id'=group_id::text AND coalesce((c->>'isActive')::boolean,true);
 IF entry IS NULL OR crit IS NULL OR NOT s.contestant_order @> ARRAY[(entry->>'id')::uuid] THEN RAISE EXCEPTION 'INVALID_SCORING_TARGET'; END IF;
 IF s.current_round_id IS NOT NULL AND (NOT coalesce(scope_round->'contestantIds','[]') ? (entry->>'id') OR NOT coalesce(scope_round->'criteriaIds','[]') ? group_id::text) THEN RAISE EXCEPTION 'ROUND_SCOPE_FORBIDDEN'; END IF;
 allowed:=jsonb_array_length(scopes)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(scopes) a WHERE
   (a->>'scope'='event' AND a->>'scope_id'=p_event::text) OR (a->>'scope'='round' AND a->>'scope_id'=s.current_round_id::text) OR
   (a->>'scope'='division' AND a->>'scope_id'=entry->>'divisionId') OR (a->>'scope'='category' AND a->>'scope_id'=scope_round->>'categoryId'));
 IF NOT allowed THEN RAISE EXCEPTION 'JUDGE_FORBIDDEN'; END IF;
 IF EXISTS(SELECT 1 FROM competition_advancement_decisions WHERE round_id=s.current_round_id AND rules_version=rv.id) THEN RAISE EXCEPTION 'ROUND_FINALIZED'; END IF;
 IF NOT competition_gate_open(s.access_config->'entries',(entry->>'id')::uuid) OR NOT competition_gate_open(s.access_config->'criteria',group_id) OR coalesce(s.access_config->'intersections'->>((entry->>'id')||':'||group_id::text),'allow')='deny' THEN RAISE EXCEPTION 'SCORING_ACCESS_CLOSED'; END IF;
 SELECT * INTO sc FROM competition_session_judge_scores WHERE session_id=s.id AND judge_id=p_judge AND round_id IS NOT DISTINCT FROM s.current_round_id AND contestant_id=(entry->>'id')::uuid ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
 IF coalesce(sc.locked_criteria,'[]') ? group_id::text THEN
   IF p_action='lock' AND sc.scores @> (p_payload->'scores') THEN RETURN jsonb_build_object('lockedCriteria',sc.locked_criteria,'locked',sc.is_locked,'duplicate',true); END IF;
   RAISE EXCEPTION 'CRITERION_LOCKED';
 END IF;
 targets:=coalesce(crit->'minorCriteria','[]');
 IF jsonb_array_length(targets)=0 THEN targets:=jsonb_build_array(jsonb_build_object('id',group_id,'minScore',crit->'minScore','maxScore',crit->'maxScore')); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload->'scores') k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(targets) m WHERE m->>'id'=k)) THEN RAISE EXCEPTION 'INVALID_MINOR'; END IF;
 FOR minor IN SELECT m FROM jsonb_array_elements(targets) m LOOP
   IF NOT coalesce(p_payload->'scores','{}') ? (minor->>'id') THEN IF p_action='lock' THEN RAISE EXCEPTION 'MISSING_SCORE'; ELSE CONTINUE; END IF; END IF;
   v:=(p_payload->'scores'->>(minor->>'id'))::numeric;
   IF v IS NULL OR v::text IN ('NaN','Infinity','-Infinity') OR v<(minor->>'minScore')::numeric OR v>(minor->>'maxScore')::numeric THEN RAISE EXCEPTION 'SCORE_OUT_OF_RANGE'; END IF;
 END LOOP;
 IF p_action='draft' THEN
   SELECT * INTO draft FROM competition_judge_drafts WHERE session_id=s.id AND judge_id=p_judge AND round_id IS NOT DISTINCT FROM s.current_round_id AND contestant_id=(entry->>'id')::uuid AND criteria_id=group_id AND rules_version=rv.id FOR UPDATE;
   IF draft.id IS NOT NULL AND draft.revision<>coalesce((p_payload->>'draftRevision')::bigint,0) THEN RAISE EXCEPTION 'DRAFT_VERSION_CONFLICT'; END IF;
   IF draft.id IS NULL THEN
     INSERT INTO competition_judge_drafts(session_id,event_id,round_id,judge_id,contestant_id,criteria_id,rules_version,scores) VALUES(s.id,p_event,s.current_round_id,p_judge,(entry->>'id')::uuid,group_id,rv.id,p_payload->'scores') RETURNING * INTO draft;
   ELSE UPDATE competition_judge_drafts SET scores=p_payload->'scores',revision=revision+1,updated_at=now() WHERE id=draft.id RETURNING * INTO draft; END IF;
   RETURN jsonb_build_object('draft',to_jsonb(draft));
 END IF;
 merged:=coalesce(sc.scores,'{}') || (p_payload->'scores');
 locks:=coalesce(sc.locked_criteria,'[]') || jsonb_build_array(group_id::text);
 full_lock:=NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rv.snapshot->'criteria') c WHERE coalesce((c->>'isActive')::boolean,true) AND (s.current_round_id IS NULL OR coalesce(scope_round->'criteriaIds','[]') ? (c->>'id')) AND NOT locks ? (c->>'id'));
 v_revision:=coalesce(sc.revision,0)+1;
 IF sc.id IS NULL THEN
   INSERT INTO competition_session_judge_scores(session_id,event_id,round_id,contestant_id,judge_id,participant_id,scores,locked_criteria,is_locked,locked_at,rules_version,revision,lock_versions)
   VALUES(s.id,p_event,s.current_round_id,(entry->>'id')::uuid,p_judge,ep.id,merged,locks,full_lock,CASE WHEN full_lock THEN now() END,rv.id,v_revision,jsonb_build_object(group_id::text,jsonb_build_object('version',v_revision,'at',now(),'judgeId',p_judge))) RETURNING * INTO sc;
 ELSE
   UPDATE competition_session_judge_scores SET scores=merged,locked_criteria=locks,is_locked=full_lock,locked_at=CASE WHEN full_lock THEN now() END,rules_version=rv.id,revision=v_revision,lock_versions=coalesce(sc.lock_versions,'{}')||jsonb_build_object(group_id::text,jsonb_build_object('version',v_revision,'at',now(),'judgeId',p_judge)),updated_at=now() WHERE id=sc.id RETURNING * INTO sc;
 END IF;
 DELETE FROM competition_scores WHERE judge_id=p_judge AND contestant_id=sc.contestant_id AND criteria_id=group_id AND round_id IS NOT DISTINCT FROM s.current_round_id;
 FOR minor IN SELECT m FROM jsonb_array_elements(targets) m LOOP
   INSERT INTO competition_scores(judge_id,participant_id,contestant_id,criteria_id,minor_criteria_id,round_id,category_id,division_id,score)
   VALUES(p_judge,ep.id,sc.contestant_id,group_id,CASE WHEN minor->>'id'<>group_id::text THEN (minor->>'id')::uuid END,s.current_round_id,nullif(scope_round->>'categoryId','')::uuid,nullif(entry->>'divisionId','')::uuid,(p_payload->'scores'->>(minor->>'id'))::numeric);
 END LOOP;
 DELETE FROM competition_judge_drafts WHERE session_id=s.id AND judge_id=p_judge AND round_id IS NOT DISTINCT FROM s.current_round_id AND contestant_id=sc.contestant_id AND criteria_id=group_id;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_judge,'competition.criterion.lock','competition_session_judge_scores',sc.id,jsonb_build_object('criteriaId',group_id,'revision',v_revision,'rulesVersion',rv.id));
 RETURN jsonb_build_object('locked',full_lock,'lockedCriteria',locks,'revision',v_revision);
END; $$;

CREATE OR REPLACE FUNCTION competition_operational_action(p_event uuid,p_actor uuid,p_session uuid,p_action text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s competition_sessions; e events; rv competition_rule_versions; r jsonb; ids uuid[];
 gate jsonb; lineup competition_lineups; row competition_session_judge_scores; crit_id text;
BEGIN
 SELECT * INTO e FROM events WHERE id=p_event FOR UPDATE;
 IF NOT competition_owns_event(p_event,p_actor) OR e.status IN ('archived','cancelled') THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
 IF EXISTS(SELECT 1 FROM competition_result_calculations WHERE event_id=p_event AND rules_version=e.official_rules_id AND round_id IS NULL AND status='published') THEN RAISE EXCEPTION 'OFFICIAL_RESULT_AMENDMENT_REQUIRED'; END IF;
 IF p_action='start' THEN
   SELECT * INTO rv FROM competition_rule_versions WHERE id=e.official_rules_id;
   IF rv.id IS NULL THEN RAISE EXCEPTION 'RULES_NOT_CONFIRMED'; END IF;
   IF EXISTS(SELECT 1 FROM competition_sessions WHERE event_id=p_event AND status IN ('active','paused')) THEN RAISE EXCEPTION 'SESSION_ALREADY_ACTIVE'; END IF;
   SELECT value INTO r FROM jsonb_array_elements(rv.snapshot->'rounds') ORDER BY (value->>'displayOrder')::integer LIMIT 1;
   PERFORM competition_require_qualified(p_event,rv.id,nullif(r->>'id','')::uuid);
   gate:=competition_round_roster(p_event,rv.id,nullif(r->>'id','')::uuid);
   SELECT array_agg((value->>'id')::uuid ORDER BY (value->>'contestantNumber')::integer) INTO ids FROM jsonb_array_elements(rv.snapshot->'contestants') WHERE gate ? (value->>'id');
   IF coalesce(cardinality(ids),0)=0 THEN RAISE EXCEPTION 'NO_ELIGIBLE_ROUND_ENTRIES';END IF;
   INSERT INTO competition_sessions(event_id,status,current_round_id,contestant_order,active_contestant_id,started_at,rules_version) VALUES(p_event,'active',nullif(r->>'id','')::uuid,ids,ids[1],now(),rv.id) RETURNING * INTO s;
   UPDATE events SET status='active',scoring_enabled=true,competition_lifecycle='judging' WHERE id=p_event;
 ELSE
   SELECT * INTO s FROM competition_sessions WHERE id=p_session AND event_id=p_event FOR UPDATE;
   IF s.id IS NULL OR s.rules_version IS NULL THEN RAISE EXCEPTION 'SESSION_VERSION_REQUIRED'; END IF;
   IF p_action='end-performance' THEN
     UPDATE competition_sessions SET status='completed',completed_at=now(),access_config=jsonb_set(jsonb_set(access_config,'{entries}', '{"mode":"none","ids":[]}'),'{criteria}','{"mode":"none","ids":[]}'),revision=revision+1 WHERE id=s.id RETURNING * INTO s;
     UPDATE events SET scoring_enabled=false,competition_lifecycle='tabulation_pending' WHERE id=p_event;
   ELSIF p_action='reopen-performance' THEN
     IF s.status<>'completed' OR NOT coalesce((p_payload->>'confirmed')::boolean,false) OR length(trim(coalesce(p_payload->>'reason','')))=0 THEN RAISE EXCEPTION 'REOPEN_CONFIRMATION_REQUIRED'; END IF;
     IF EXISTS(SELECT 1 FROM competition_result_calculations WHERE event_id=p_event AND rules_version=s.rules_version AND round_id IS NULL AND status='finalized') THEN RAISE EXCEPTION 'OFFICIAL_RESULT_AMENDMENT_REQUIRED'; END IF;
     UPDATE competition_sessions SET status='active',completed_at=NULL,revision=revision+1 WHERE id=s.id RETURNING * INTO s;
     UPDATE events SET status='active',scoring_enabled=true,competition_lifecycle='judging' WHERE id=p_event;
   ELSIF p_action='pause' THEN UPDATE competition_sessions SET status='paused',paused_at=now(),revision=revision+1 WHERE id=s.id RETURNING * INTO s;
   ELSIF p_action='resume' THEN
     IF s.status<>'paused' THEN RAISE EXCEPTION 'SESSION_NOT_PAUSED'; END IF;
     UPDATE competition_sessions SET status='active',paused_at=NULL,revision=revision+1 WHERE id=s.id RETURNING * INTO s;
   ELSIF p_action='submission-window' THEN UPDATE competition_sessions SET submission_window=(p_payload->>'open')::boolean,revision=revision+1 WHERE id=s.id RETURNING * INTO s;
   ELSIF p_action='access' THEN
     gate:=p_payload->'gate';
     IF p_payload->>'kind' NOT IN ('entries','criteria','intersections') THEN RAISE EXCEPTION 'INVALID_GATE'; END IF;
     IF p_payload->>'kind'<>'intersections' AND (gate->>'mode' NOT IN ('all','none','selected') OR jsonb_typeof(gate->'ids')<>'array') THEN RAISE EXCEPTION 'INVALID_GATE'; END IF;
     UPDATE competition_sessions SET access_config=jsonb_set(access_config,ARRAY[p_payload->>'kind'],gate),revision=revision+1 WHERE id=s.id RETURNING * INTO s;
   ELSIF p_action='division' THEN
     IF p_payload->>'divisionId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM competition_divisions WHERE id=(p_payload->>'divisionId')::uuid AND event_id=p_event) THEN RAISE EXCEPTION 'DIVISION_FORBIDDEN'; END IF;
     UPDATE competition_sessions SET current_division_id=(p_payload->>'divisionId')::uuid,revision=revision+1 WHERE id=s.id RETURNING * INTO s;
   ELSIF p_action='round' THEN
     SELECT * INTO rv FROM competition_rule_versions WHERE id=s.rules_version;
     SELECT value INTO r FROM jsonb_array_elements(rv.snapshot->'rounds') WHERE value->>'id'=p_payload->>'roundId';
     IF r IS NULL THEN RAISE EXCEPTION 'ROUND_FORBIDDEN'; END IF;
     PERFORM competition_require_qualified(p_event,s.rules_version,(r->>'id')::uuid);
     gate:=competition_round_roster(p_event,s.rules_version,(r->>'id')::uuid);
     IF jsonb_array_length(gate)=0 THEN RAISE EXCEPTION 'NO_ELIGIBLE_ROUND_ENTRIES';END IF;
     PERFORM competition_sync_continuing_roster(p_event,p_actor,s.rules_version,(r->>'id')::uuid,gate);
     SELECT array_agg(value::text::uuid) INTO ids FROM jsonb_array_elements_text(gate) value;
     UPDATE competition_sessions SET current_round_id=(r->>'id')::uuid,contestant_order=ids,active_contestant_id=ids[1],current_contestant_order=0,current_division_id=NULL,active_contestant_ids=NULL,lineup_id=NULL,active_slot=0,access_config='{"entries":{"mode":"all","ids":[]},"criteria":{"mode":"all","ids":[]},"intersections":{}}',revision=revision+1 WHERE id=s.id RETURNING * INTO s;
   ELSIF p_action='lineup-activate' THEN
     IF NOT coalesce((p_payload->>'confirmed')::boolean,false) THEN RAISE EXCEPTION 'LINEUP_CONFIRMATION_REQUIRED'; END IF;
     SELECT * INTO lineup FROM competition_lineups WHERE id=(p_payload->>'lineupId')::uuid AND event_id=p_event AND round_id IS NOT DISTINCT FROM s.current_round_id AND rules_version=s.rules_version;
     IF lineup.id IS NULL THEN RAISE EXCEPTION 'LINEUP_FORBIDDEN'; END IF;
     SELECT array_agg(v::uuid ORDER BY slot.n,member.n) INTO ids FROM jsonb_array_elements(lineup.slots) WITH ORDINALITY slot(g,n) CROSS JOIN LATERAL jsonb_array_elements_text(slot.g) WITH ORDINALITY member(v,n);
     UPDATE competition_sessions SET lineup_id=lineup.id,active_slot=0,access_config=CASE WHEN lineup.criteria_id IS NULL THEN access_config ELSE jsonb_set(access_config,'{criteria}',jsonb_build_object('mode','selected','ids',jsonb_build_array(lineup.criteria_id))) END,contestant_order=ids,active_contestant_id=ids[1],revision=revision+1 WHERE id=s.id RETURNING * INTO s;
   ELSIF p_action='slot' THEN
     SELECT * INTO lineup FROM competition_lineups WHERE id=s.lineup_id;
     IF lineup.id IS NULL OR (p_payload->>'index')::integer<0 OR (p_payload->>'index')::integer>=jsonb_array_length(lineup.slots) THEN RAISE EXCEPTION 'INVALID_STAGE_SLOT'; END IF;
     UPDATE competition_sessions SET active_slot=(p_payload->>'index')::integer,active_contestant_id=(lineup.slots->((p_payload->>'index')::integer)->>0)::uuid,revision=revision+1 WHERE id=s.id RETURNING * INTO s;
   ELSIF p_action='correction' THEN
     IF length(trim(coalesce(p_payload->>'reason','')))=0 OR NOT coalesce((p_payload->>'confirmed')::boolean,false) THEN RAISE EXCEPTION 'CORRECTION_REASON_REQUIRED'; END IF;
     IF EXISTS(SELECT 1 FROM competition_result_calculations WHERE event_id=p_event AND rules_version=s.rules_version AND status IN ('finalized','published')) THEN RAISE EXCEPTION 'OFFICIAL_RESULT_AMENDMENT_REQUIRED'; END IF;
     IF EXISTS(SELECT 1 FROM competition_advancement_decisions WHERE round_id=s.current_round_id AND rules_version=s.rules_version) THEN RAISE EXCEPTION 'AUTHORIZED_ADVANCEMENT_AMENDMENT_REQUIRED'; END IF;
     crit_id:=p_payload->>'criteriaId';
     FOR row IN SELECT * FROM competition_session_judge_scores WHERE session_id=s.id AND round_id IS NOT DISTINCT FROM s.current_round_id AND contestant_id=(p_payload->>'contestantId')::uuid AND (p_payload->>'judgeId' IS NULL OR judge_id=(p_payload->>'judgeId')::uuid) LOOP
       UPDATE competition_round_submissions SET status='invalidated',invalidated_at=now(),reason=p_payload->>'reason' WHERE session_id=s.id AND round_id IS NOT DISTINCT FROM s.current_round_id AND judge_id=row.judge_id AND status='submitted';
       UPDATE competition_session_judge_scores SET locked_criteria=CASE WHEN crit_id IS NULL THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(v),'[]') FROM jsonb_array_elements(locked_criteria) v WHERE v#>>'{}'<>crit_id) END,is_locked=false,locked_at=NULL,revision=revision+1 WHERE id=row.id;
     END LOOP;
   ELSE RAISE EXCEPTION 'UNKNOWN_OPERATION'; END IF;
 END IF;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.operation.'||p_action,'competition_sessions',s.id,p_payload||jsonb_build_object('revision',s.revision));
 RETURN to_jsonb(s);
END; $$;


CREATE OR REPLACE FUNCTION competition_confirm_advancement(p_event uuid,p_actor uuid,p_round uuid,p_next uuid,p_calculation uuid,p_qualifiers uuid[],p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c competition_result_calculations; decision competition_advancement_decisions; rv competition_rule_versions; r jsonb;
 expected_next uuid; auto_ids uuid[]; cutoff_rank integer:=0; group_id text; amount integer; basis text;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 IF NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
 SELECT * INTO c FROM competition_result_calculations WHERE id=p_calculation AND event_id=p_event AND round_id=p_round AND verified_at IS NOT NULL AND status IN ('under_verification','finalized','published') FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'VERIFIED_ROUND_REQUIRED'; END IF;
 IF c.rules_version IS DISTINCT FROM (SELECT official_rules_id FROM events WHERE id=p_event) THEN RAISE EXCEPTION 'STALE_ADVANCEMENT_RULES'; END IF;
 SELECT * INTO rv FROM competition_rule_versions WHERE id=c.rules_version;
 SELECT value INTO r FROM jsonb_array_elements(rv.snapshot->'rounds') WHERE value->>'id'=p_round::text;
 IF r IS NULL OR jsonb_array_length(c.result_snapshot)=0 THEN RAISE EXCEPTION 'INCOMPLETE_ADVANCEMENT_RESULTS'; END IF;
 IF coalesce(r->>'advancementType','none')='none' THEN RAISE EXCEPTION 'NO_ELIMINATION_REQUIRES_LIVE_PROGRESSION';END IF;
 IF r->>'advancementType'='threshold' AND rv.snapshot->'scoringConfig'->>'calculationMethod' IN('manual','rank_based') THEN RAISE EXCEPTION 'THRESHOLD_REQUIRES_NUMERIC_RESULTS';END IF;
 expected_next:=coalesce((r->>'nextRoundId')::uuid,(SELECT (n->>'id')::uuid FROM jsonb_array_elements(rv.snapshot->'rounds') n WHERE coalesce(n->>'purpose','regular')<>'special' AND (n->>'displayOrder')::integer>(r->>'displayOrder')::integer ORDER BY (n->>'displayOrder')::integer,n->>'id' LIMIT 1));
 IF p_next IS DISTINCT FROM expected_next THEN RAISE EXCEPTION 'INVALID_NEXT_ROUND'; END IF;
 IF p_next IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(rv.snapshot->'rounds') n WHERE n->>'id'=p_next::text AND n->>'purpose'='special') THEN RAISE EXCEPTION 'INVALID_MAIN_ROUND_DESTINATION';END IF;
 IF EXISTS(SELECT 1 FROM competition_advancement_decisions WHERE round_id=p_round AND rules_version=c.rules_version) THEN RAISE EXCEPTION 'AUTHORIZED_ADVANCEMENT_AMENDMENT_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(c.source_versions) src WHERE NOT EXISTS(SELECT 1 FROM competition_round_submissions s WHERE s.id=(src->>'id')::uuid AND s.version=(src->>'version')::bigint AND s.status='submitted')) THEN RAISE EXCEPTION 'SOURCE_VERSION_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM competition_deductions WHERE event_id=p_event AND rules_version=c.rules_version AND decision_status='pending') OR EXISTS(SELECT 1 FROM competition_eligibility_decisions WHERE event_id=p_event AND rules_version=c.rules_version AND status='pending') THEN RAISE EXCEPTION 'PENDING_DECISIONS'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(c.result_snapshot) result WHERE result->>'rank' IS NULL) THEN RAISE EXCEPTION 'INCOMPLETE_ADVANCEMENT_RESULTS'; END IF;
 IF p_qualifiers IS NULL OR cardinality(p_qualifiers)<>(SELECT count(DISTINCT id) FROM unnest(p_qualifiers) id) OR EXISTS(SELECT 1 FROM unnest(p_qualifiers) id WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.result_snapshot) result WHERE result->>'contestantId'=id::text AND (result->>'rank')::integer>0)) THEN RAISE EXCEPTION 'INVALID_QUALIFIER'; END IF;
 basis:=CASE WHEN r->>'advancementType'='manual' THEN 'manual' ELSE 'automatic' END;
 auto_ids:='{}';
 FOR group_id IN SELECT DISTINCT CASE WHEN coalesce((rv.snapshot->'scoringConfig'->>'perDivision')::boolean,false) THEN coalesce(result->>'divisionId','') ELSE '' END FROM jsonb_array_elements(c.result_snapshot) result LOOP
   IF r->>'advancementType' IN ('top_n','top_percent') THEN
     SELECT CASE WHEN r->>'advancementType'='top_n' THEN (r->>'advancementValue')::integer ELSE ceil(count(*)*(r->>'advancementValue')::numeric/100)::integer END INTO amount FROM jsonb_array_elements(c.result_snapshot) result WHERE NOT coalesce((rv.snapshot->'scoringConfig'->>'perDivision')::boolean,false) OR coalesce(result->>'divisionId','')=group_id;
     SELECT (result->>'rank')::integer INTO cutoff_rank FROM jsonb_array_elements(c.result_snapshot) result WHERE NOT coalesce((rv.snapshot->'scoringConfig'->>'perDivision')::boolean,false) OR coalesce(result->>'divisionId','')=group_id ORDER BY (result->>'rank')::integer,result->>'contestantId' OFFSET greatest(0,amount-1) LIMIT 1;
     IF cutoff_rank IS NULL THEN SELECT max((result->>'rank')::integer) INTO cutoff_rank FROM jsonb_array_elements(c.result_snapshot) result; END IF;
   END IF;
   SELECT auto_ids || coalesce(array_agg((result->>'contestantId')::uuid),'{}'::uuid[]) INTO auto_ids FROM jsonb_array_elements(c.result_snapshot) result
   WHERE (NOT coalesce((rv.snapshot->'scoringConfig'->>'perDivision')::boolean,false) OR coalesce(result->>'divisionId','')=group_id)
   AND CASE coalesce(r->>'advancementType','none') WHEN 'none' THEN true WHEN 'manual' THEN false WHEN 'threshold' THEN (result->>'finalScore')::numeric >= (r->>'advancementValue')::numeric ELSE (result->>'rank')::integer<=cutoff_rank END;
 END LOOP;
 IF basis='automatic' AND NOT (p_qualifiers @> auto_ids AND auto_ids @> p_qualifiers) THEN RAISE EXCEPTION 'MANUAL_SEEDING_NOT_PERMITTED_BY_RULES'; END IF;
 IF basis='manual' AND length(trim(coalesce(p_reason,'')))=0 THEN RAISE EXCEPTION 'MANUAL_QUALIFICATION_REASON_REQUIRED'; END IF;
 INSERT INTO competition_advancement_decisions(event_id,round_id,next_round_id,calculation_id,rules_version,qualifiers,automatic_qualifiers,selection_basis,reason,confirmed_by)
 VALUES(p_event,p_round,p_next,c.id,c.rules_version,to_jsonb(p_qualifiers),to_jsonb(auto_ids),basis,p_reason,p_actor) RETURNING * INTO decision;
 IF p_next IS NOT NULL THEN
   PERFORM set_config('votrix.authorized_operation','advancement',true);
   DELETE FROM competition_round_contestants WHERE round_id=p_next;
   INSERT INTO competition_round_contestants(round_id,contestant_id) SELECT p_next,id FROM unnest(p_qualifiers) id;
 END IF;
 UPDATE competition_rounds SET finalized_at=now() WHERE id=p_round;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.advancement.confirm','competition_advancement_decisions',decision.id,jsonb_build_object('reason',p_reason,'calculationId',c.id,'rulesVersion',c.rules_version,'selectionBasis',basis,'automaticQualifiers',auto_ids,'approvedQualifiers',p_qualifiers,'verifiedBy',c.verified_by));
 RETURN to_jsonb(decision);
END; $$;



REVOKE ALL ON FUNCTION competition_progression_sources(jsonb,uuid),competition_round_roster(uuid,uuid,uuid,uuid[]),competition_sync_continuing_roster(uuid,uuid,uuid,uuid,jsonb),competition_validate_participation(uuid,uuid,jsonb),competition_participation_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_validate_participation(uuid,uuid,jsonb),competition_participation_context(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION competition_scoring_write_v095(uuid,uuid,jsonb,text,jsonb) FROM PUBLIC,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
