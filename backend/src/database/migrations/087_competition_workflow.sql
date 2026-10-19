-- Additive workflow schema. Apply after forward migrations through 086.
-- Historical score locks/publications are preserved, never promoted to submissions.
BEGIN;

-- The legacy UNIQUE(event_id,status) allowed one active AND one paused session.
-- Require an explicit choice of the current session; never retire history here.
LOCK TABLE competition_sessions IN SHARE ROW EXCLUSIVE MODE;
DO $live_session_preflight$
DECLARE conflicts jsonb;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('eventId',event_id,'sessions',sessions) ORDER BY event_id)
 INTO conflicts FROM (
   SELECT event_id,jsonb_agg(jsonb_build_object('sessionId',id,'status',status) ORDER BY id) AS sessions
   FROM competition_sessions WHERE status IN ('active','paused')
   GROUP BY event_id HAVING count(*)>1
 ) duplicated;
 IF conflicts IS NOT NULL THEN
   RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='COMPETITION_DUPLICATE_LIVE_SESSIONS',
     DETAIL=conflicts::text,
     HINT='Choose the current session and explicitly complete obsolete active/paused sessions before rerunning 087. Preserve session records and their scores.';
 END IF;
END;
$live_session_preflight$;

CREATE TABLE competition_rule_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id),
 version integer NOT NULL, snapshot jsonb NOT NULL, acknowledged_by uuid NOT NULL REFERENCES users(id),
 acknowledged_at timestamptz NOT NULL DEFAULT now(), reason text, UNIQUE(event_id,version)
);
ALTER TABLE events ADD COLUMN official_rules_id uuid REFERENCES competition_rule_versions(id),
 ADD COLUMN competition_lifecycle text NOT NULL DEFAULT 'legacy';
ALTER TABLE competition_rounds ADD COLUMN workflow jsonb NOT NULL DEFAULT '{}';
ALTER TABLE competition_criteria ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE competition_contestants ADD COLUMN entry_type text CHECK(entry_type IN ('individual','duo','group','other')),
 ADD COLUMN entry_label text;
ALTER TABLE competition_divisions ADD COLUMN row_color text;

CREATE TABLE competition_lineups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id),
 round_id uuid REFERENCES competition_rounds(id), criteria_id uuid REFERENCES competition_criteria(id),
 rules_version uuid REFERENCES competition_rule_versions(id), name text NOT NULL,
 mode text NOT NULL, slots jsonb NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE competition_sessions ADD COLUMN rules_version uuid REFERENCES competition_rule_versions(id),
 ADD COLUMN access_config jsonb NOT NULL DEFAULT '{"entries":{"mode":"all","ids":[]},"criteria":{"mode":"all","ids":[]},"intersections":{}}',
 ADD COLUMN submission_window boolean NOT NULL DEFAULT true, ADD COLUMN revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN lineup_id uuid REFERENCES competition_lineups(id), ADD COLUMN active_slot integer NOT NULL DEFAULT 0;
ALTER TABLE competition_sessions DROP CONSTRAINT competition_sessions_unique_active;
CREATE UNIQUE INDEX competition_one_live_session ON competition_sessions(event_id) WHERE status IN ('active','paused');

ALTER TABLE competition_session_judge_scores ADD COLUMN rules_version uuid REFERENCES competition_rule_versions(id),
 ADD COLUMN revision bigint NOT NULL DEFAULT 0, ADD COLUMN lock_versions jsonb NOT NULL DEFAULT '{}';
-- Historical NULL-round duplicates remain intact. New rows are serialized by the
-- session lock in workflow RPCs and explicitly located with IS NOT DISTINCT FROM.
CREATE TABLE competition_judge_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES competition_sessions(id),
 event_id uuid NOT NULL REFERENCES events(id), round_id uuid REFERENCES competition_rounds(id),
 judge_id uuid NOT NULL REFERENCES users(id), contestant_id uuid NOT NULL REFERENCES competition_contestants(id),
 criteria_id uuid NOT NULL REFERENCES competition_criteria(id), rules_version uuid NOT NULL REFERENCES competition_rule_versions(id),
 scores jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX competition_draft_cell ON competition_judge_drafts(session_id,judge_id,coalesce(round_id,'00000000-0000-0000-0000-000000000000'),contestant_id,criteria_id,rules_version);
CREATE TABLE competition_round_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id),
 session_id uuid NOT NULL REFERENCES competition_sessions(id), round_id uuid REFERENCES competition_rounds(id),
 judge_id uuid NOT NULL REFERENCES users(id), rules_version uuid NOT NULL REFERENCES competition_rule_versions(id),
 version bigint NOT NULL, status text NOT NULL CHECK(status IN ('submitted','invalidated')),
 sources jsonb NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(), invalidated_at timestamptz, reason text
);
CREATE UNIQUE INDEX competition_current_submission ON competition_round_submissions(session_id,judge_id,coalesce(round_id,'00000000-0000-0000-0000-000000000000')) WHERE status='submitted';

ALTER TABLE competition_deductions ADD COLUMN rule_id text, ADD COLUMN rules_version uuid REFERENCES competition_rule_versions(id),
 ADD COLUMN decision_status text NOT NULL DEFAULT 'legacy' CHECK(decision_status IN ('legacy','pending','approved','voided')),
 ADD COLUMN evidence text, ADD COLUMN approved_by uuid REFERENCES users(id), ADD COLUMN approved_at timestamptz;
CREATE TABLE competition_eligibility_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id),
 round_id uuid REFERENCES competition_rounds(id), contestant_id uuid NOT NULL REFERENCES competition_contestants(id),
 rules_version uuid NOT NULL REFERENCES competition_rule_versions(id), decision text NOT NULL CHECK(decision='non_competing'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','voided')),
 reason text NOT NULL, evidence text, reported_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz
);
CREATE TABLE competition_advancement_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id),
 round_id uuid NOT NULL REFERENCES competition_rounds(id), next_round_id uuid REFERENCES competition_rounds(id),
 calculation_id uuid NOT NULL REFERENCES competition_result_calculations(id), rules_version uuid NOT NULL REFERENCES competition_rule_versions(id),
 qualifiers jsonb NOT NULL, overrides jsonb NOT NULL DEFAULT '{}', reason text,
 confirmed_by uuid NOT NULL REFERENCES users(id), confirmed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(round_id,calculation_id)
);
ALTER TABLE competition_result_calculations ADD COLUMN rules_version uuid REFERENCES competition_rule_versions(id),
 ADD COLUMN source_versions jsonb NOT NULL DEFAULT '[]', ADD COLUMN source_digest text,
 ADD COLUMN verified_by uuid REFERENCES users(id), ADD COLUMN verified_at timestamptz,
 ADD COLUMN verification jsonb NOT NULL DEFAULT '{}';
-- Migration 082 used varchar(16); the new verification states exceed that limit.
ALTER TABLE competition_result_calculations ALTER COLUMN status TYPE text;
ALTER TABLE competition_result_calculations DROP CONSTRAINT competition_result_calculations_status_check;
ALTER TABLE competition_result_calculations ADD CONSTRAINT competition_result_calculations_status_check
 CHECK(status IN ('calculated','awaiting_submissions','provisional','ready_for_verification','under_verification','finalized','published','superseded'));

-- Preserve original order as metadata. Repair only order, not scores/results.
WITH ordered AS (SELECT id,display_order,row_number() OVER(PARTITION BY event_id ORDER BY display_order,created_at,id)-1 AS n FROM competition_rounds)
UPDATE competition_rounds r SET workflow=r.workflow || jsonb_build_object('legacyDisplayOrder',o.display_order), display_order=o.n FROM ordered o WHERE o.id=r.id;

CREATE FUNCTION competition_immutable_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published rule versions are immutable'; END; $$;
CREATE TRIGGER competition_rules_immutable BEFORE UPDATE OR DELETE ON competition_rule_versions FOR EACH ROW EXECUTE FUNCTION competition_immutable_rules();

CREATE FUNCTION competition_gate_open(g jsonb, target uuid) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE coalesce(g->>'mode','all') WHEN 'all' THEN true WHEN 'none' THEN false WHEN 'selected' THEN coalesce(g->'ids','[]') ? target::text ELSE false END;
$$;

-- SQL functions accept only service-role calls. Every operation revalidates
-- actor/enrollment/scope/context while holding the session row lock, so a gate
-- closure or round switch cannot race a previously validated score write.
CREATE FUNCTION competition_scoring_write(p_event uuid,p_judge uuid,p_context jsonb,p_action text,p_payload jsonb)
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
 SELECT qualifiers INTO source_list FROM competition_advancement_decisions WHERE event_id=p_event AND rules_version=rv.id AND next_round_id=s.current_round_id ORDER BY confirmed_at DESC LIMIT 1;
 IF source_list IS NOT NULL THEN scope_round:=jsonb_set(scope_round,'{contestantIds}',source_list); END IF;
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
REVOKE ALL ON FUNCTION competition_scoring_write(uuid,uuid,jsonb,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_scoring_write(uuid,uuid,jsonb,text,jsonb) TO service_role;

DROP VIEW IF EXISTS v_competition_active_session;
CREATE VIEW v_competition_active_session AS SELECT s.*,r.name AS current_round_name,c.name AS active_contestant_name,c.contestant_number AS active_contestant_number,c.photo AS active_contestant_photo FROM competition_sessions s LEFT JOIN competition_rounds r ON r.id=s.current_round_id LEFT JOIN competition_contestants c ON c.id=s.active_contestant_id WHERE s.status='active';
ALTER TABLE competition_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_judge_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_round_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_eligibility_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_advancement_decisions ENABLE ROW LEVEL SECURITY;
COMMIT;
