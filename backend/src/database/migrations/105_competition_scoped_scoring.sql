-- Phase 4 only: independent live sessions and immutable scoring sources.
-- No legacy writes, formula changes, qualification, tabulation or results.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN IF to_regprocedure('competition_native_foundation(uuid,uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'MIGRATION_104_REQUIRED'; END IF; END $$;
CREATE TABLE IF NOT EXISTS competition_child_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL,competition_id uuid NOT NULL,round_id uuid,
 rules_version uuid NOT NULL,status text NOT NULL CHECK(status IN('active','paused','closed')),
 revision bigint NOT NULL DEFAULT 1,source_revision bigint NOT NULL DEFAULT 1,
 entry_ids jsonb NOT NULL,entry_access jsonb NOT NULL DEFAULT '{}',criterion_access jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(competition_id,event_id) REFERENCES competitions(id,event_id),
 FOREIGN KEY(round_id,competition_id,event_id) REFERENCES competition_child_rounds(id,competition_id,event_id),
 FOREIGN KEY(rules_version,competition_id,event_id) REFERENCES competition_child_rule_versions(id,competition_id,event_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS competition_child_session_scope ON competition_child_sessions(competition_id,coalesce(round_id,'00000000-0000-0000-0000-000000000000'));
CREATE TABLE IF NOT EXISTS competition_child_score_drafts (
 session_id uuid NOT NULL REFERENCES competition_child_sessions(id),judge_id uuid NOT NULL REFERENCES users(id),
 entry_id uuid NOT NULL REFERENCES competition_entries(id),criterion_id uuid NOT NULL REFERENCES competition_child_criteria(id),
 scores jsonb NOT NULL,revision bigint NOT NULL DEFAULT 1,locked boolean NOT NULL DEFAULT false,
 PRIMARY KEY(session_id,judge_id,entry_id,criterion_id)
);
CREATE TABLE IF NOT EXISTS competition_child_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES competition_child_sessions(id),
 judge_id uuid NOT NULL REFERENCES users(id),rules_version uuid NOT NULL REFERENCES competition_child_rule_versions(id),
 sources jsonb NOT NULL,submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS competition_child_submission_heads (
 session_id uuid NOT NULL REFERENCES competition_child_sessions(id),judge_id uuid NOT NULL REFERENCES users(id),
 submission_id uuid NOT NULL UNIQUE REFERENCES competition_child_submissions(id),PRIMARY KEY(session_id,judge_id)
);
CREATE TABLE IF NOT EXISTS competition_child_scoring_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES competition_child_sessions(id),
 actor_id uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,action text NOT NULL,
 payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(session_id,actor_id,request_id)
);
CREATE OR REPLACE FUNCTION competition_child_scoring_relation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s competition_child_sessions; row_data jsonb;
BEGIN
 row_data:=to_jsonb(NEW);
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM unnest(ARRAY['id','event_id','competition_id','round_id','rules_version','session_id','judge_id','entry_id','criterion_id','entry_ids']) field WHERE row_data->field IS DISTINCT FROM to_jsonb(OLD)->field) THEN RAISE EXCEPTION 'SCORING_IDENTITY_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME='competition_child_sessions' THEN
  IF NOT EXISTS(SELECT 1 FROM competitions WHERE id=NEW.competition_id AND event_id=NEW.event_id AND origin='native' AND official_child_rules_id=NEW.rules_version) THEN RAISE EXCEPTION 'NATIVE_SESSION_FORBIDDEN'; END IF;
 ELSE
  SELECT * INTO s FROM competition_child_sessions WHERE id=(row_data->>'session_id')::uuid;
  IF TG_TABLE_NAME='competition_child_score_drafts' THEN IF NOT s.entry_ids ? NEW.entry_id::text OR NOT EXISTS(SELECT 1 FROM competition_child_criteria WHERE id=NEW.criterion_id AND competition_id=s.competition_id AND event_id=s.event_id AND round_id IS NOT DISTINCT FROM s.round_id) THEN RAISE EXCEPTION 'CROSS_COMPETITION_SCORE_FORBIDDEN'; END IF; END IF;
  IF TG_TABLE_NAME='competition_child_submissions' THEN IF NEW.rules_version IS DISTINCT FROM s.rules_version THEN RAISE EXCEPTION 'SUBMISSION_RULES_FORBIDDEN'; END IF; END IF;
  IF TG_TABLE_NAME='competition_child_submission_heads' THEN IF NOT EXISTS(SELECT 1 FROM competition_child_submissions WHERE id=NEW.submission_id AND session_id=s.id AND judge_id=NEW.judge_id) THEN RAISE EXCEPTION 'SUBMISSION_HEAD_FORBIDDEN'; END IF; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['competition_child_sessions','competition_child_score_drafts','competition_child_submissions','competition_child_submission_heads'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass AND tgname='competition_child_scoring_relation_guard') THEN EXECUTE format('CREATE TRIGGER competition_child_scoring_relation_guard BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION competition_child_scoring_relation_guard()',t); END IF;
 END LOOP;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['competition_child_submissions','competition_child_scoring_audit'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass AND tgname='competition_child_scoring_immutable') THEN EXECUTE format('CREATE TRIGGER competition_child_scoring_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION competition_immutable_rules()',t); END IF;
 END LOOP;
END $$;

-- One boundary for reads and writes: live enrollment AND frozen judge identity.
CREATE OR REPLACE FUNCTION competition_child_scoring_context(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_owner boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; v competition_child_rule_versions; ctx jsonb;
BEGIN
 IF p_owner THEN
  ctx:=competition_native_foundation(p_event,p_competition,p_actor);
 ELSE
  ctx:=competition_native_judge_context(p_event,p_competition,p_actor,p_round);
 END IF;
 SELECT * INTO c FROM competitions WHERE id=p_competition AND event_id=p_event AND origin='native';
 SELECT * INTO v FROM competition_child_rule_versions WHERE id=c.official_child_rules_id;
 IF v.id IS NULL OR v.setup_revision IS DISTINCT FROM c.setup_revision OR v.input_revision IS DISTINCT FROM c.input_revision THEN RAISE EXCEPTION 'CURRENT_FROZEN_RULES_REQUIRED'; END IF;
 IF v.configuration_snapshot->>'structure'='single' AND p_round IS NOT NULL OR v.configuration_snapshot->>'structure'='multiple' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v.configuration_snapshot->'rounds') r WHERE r->>'id'=p_round::text) THEN RAISE EXCEPTION 'SCORING_CONTEXT_FORBIDDEN'; END IF;
 IF NOT p_owner AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v.assignment_snapshot) a WHERE a->>'judgeId'=p_actor::text AND (a->>'round_id' IS NULL OR a->>'round_id'=p_round::text)) THEN RAISE EXCEPTION 'FROZEN_JUDGE_FORBIDDEN'; END IF;
 RETURN jsonb_build_object('eventId',p_event,'competitionId',c.id,'competitionName',c.name,'roundId',p_round,'setupRevision',c.setup_revision,'inputRevision',c.input_revision,'rulesVersion',v.id);
END $$;

CREATE OR REPLACE FUNCTION competition_child_scoring_choices(p_event uuid,p_actor uuid,p_owner boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; cfg jsonb; scope uuid; result jsonb:='[]'; context jsonb;
BEGIN
 IF p_owner AND (NOT competition_owns_event(p_event,p_actor) OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role::text='organizer' AND account_status::text='active')) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
 FOR c IN SELECT * FROM competitions WHERE event_id=p_event AND origin='native' ORDER BY name,id LOOP
  SELECT configuration INTO cfg FROM competition_child_configurations WHERE competition_id=c.id;
  FOR scope IN SELECT (r->>'id')::uuid FROM jsonb_array_elements(coalesce(cfg->'rounds','[]')) r UNION ALL SELECT NULL::uuid WHERE cfg->>'structure'='single' LOOP
   IF p_owner OR EXISTS(SELECT 1 FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id JOIN users u ON u.id=ep.user_id WHERE a.competition_id=c.id AND (a.round_id IS NULL OR a.round_id=scope) AND ep.user_id=p_actor AND ep.event_id=p_event AND ep.is_active AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.judge_role::text IN('judge','head_judge') AND u.role::text IN('voter','participant') AND u.account_status::text='active') THEN
    result:=result||jsonb_build_array(jsonb_build_object('competitionId',c.id,'competitionName',c.name,'roundId',scope,'roundName',coalesce((SELECT r->>'name' FROM jsonb_array_elements(cfg->'rounds') r WHERE r->>'id'=scope::text),'Single phase')));
   END IF;
  END LOOP;
 END LOOP;
 RETURN result;
END $$;

-- Recipients are recomputed from current account/enrollment and frozen identity.
-- Used by mutation RPCs; never an event-wide broadcast or client subscription.
CREATE OR REPLACE FUNCTION competition_child_scoring_recipients(p_event uuid,p_competition uuid,p_round uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(DISTINCT recipient),'[]') FROM (
 SELECT o.organizer_id recipient FROM events e JOIN organizations o ON o.id=e.organization_id JOIN users u ON u.id=o.organizer_id WHERE e.id=p_event AND u.account_status::text='active' AND u.role::text='organizer'
 UNION SELECT ep.user_id FROM competitions c JOIN competition_child_rule_versions v ON v.id=c.official_child_rules_id CROSS JOIN jsonb_array_elements(v.assignment_snapshot) frozen JOIN competition_child_judge_assignments a ON a.id=(frozen->>'id')::uuid JOIN event_participants ep ON ep.id=a.participant_id JOIN users u ON u.id=ep.user_id WHERE c.id=p_competition AND c.event_id=p_event AND ep.event_id=p_event AND ep.user_id::text=frozen->>'judgeId' AND (a.round_id IS NULL OR a.round_id=p_round) AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.is_active AND ep.judge_role::text IN('judge','head_judge') AND u.account_status::text='active' AND u.role::text IN('participant','voter')
 ) panel;
$$;

CREATE OR REPLACE FUNCTION competition_child_live_view(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_owner boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx jsonb; s competition_child_sessions; v competition_child_rule_versions; cfg jsonb; entries jsonb; criteria jsonb; progress jsonb; operational boolean; event_status text;
BEGIN
 ctx:=competition_child_scoring_context(p_event,p_competition,p_actor,p_round,p_owner);
 SELECT status::text INTO event_status FROM events WHERE id=p_event;operational:=event_status IN('draft','active');
 SELECT * INTO v FROM competition_child_rule_versions WHERE id=(ctx->>'rulesVersion')::uuid;cfg:=v.configuration_snapshot;
 SELECT * INTO s FROM competition_child_sessions WHERE competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round;
 SELECT coalesce(jsonb_agg(k||jsonb_build_object('minors',coalesce(k->'minorCriteria','[]'),'open',operational AND s.status='active' AND coalesce((s.criterion_access->>(k->>'id'))::boolean,false)) ORDER BY k->>'id'),'[]') INTO criteria FROM jsonb_array_elements(cfg->'criteria') k WHERE (k->>'roundId')::uuid IS NOT DISTINCT FROM p_round;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'masterId',e.contestant_id,'contestantNumber',e.entry_number,'name',m.name,'photo',to_jsonb(m)->>'photo','open',operational AND s.status='active' AND coalesce((s.entry_access->>e.id::text)::boolean,false),'lockedCriteria',coalesce((SELECT jsonb_agg(d.criterion_id ORDER BY d.criterion_id) FROM competition_child_score_drafts d WHERE d.session_id=s.id AND d.judge_id=p_actor AND d.entry_id=e.id AND d.locked),'[]')) ORDER BY e.entry_number),'[]') INTO entries
 FROM competition_entries e JOIN competition_contestants m ON m.id=e.contestant_id WHERE e.competition_id=p_competition AND (s.id IS NULL OR s.entry_ids ? e.id::text);
 IF p_owner THEN
 SELECT coalesce(jsonb_agg(jsonb_build_object('judgeId',panel.judge,'judgeName',coalesce(nullif(btrim(concat_ws(' ',to_jsonb(u)->>'first_name',to_jsonb(u)->>'last_name')),''),to_jsonb(u)->>'email',panel.judge::text),'lockedCount',(SELECT count(*) FROM competition_child_score_drafts d WHERE d.session_id=s.id AND d.judge_id=panel.judge AND d.locked),'requiredCount',jsonb_array_length(entries)*jsonb_array_length(criteria),'submitted',EXISTS(SELECT 1 FROM competition_child_submission_heads h WHERE h.session_id=s.id AND h.judge_id=panel.judge)) ORDER BY panel.judge),'[]') INTO progress FROM (SELECT DISTINCT (a->>'judgeId')::uuid judge FROM jsonb_array_elements(v.assignment_snapshot) a WHERE a->>'round_id' IS NULL OR a->>'round_id'=p_round::text) panel JOIN users u ON u.id=panel.judge;
 END IF;
 RETURN jsonb_build_object('context',ctx||jsonb_build_object('sessionId',s.id,'sessionRevision',s.revision),'eventStatus',event_status,'scoringAvailable',coalesce(operational AND s.status='active',false),'viewerJudgeId',CASE WHEN p_owner THEN NULL ELSE p_actor END,'session',CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END,'contestants',entries,'criteria',criteria,'progress',progress,'submission',CASE WHEN p_owner THEN NULL ELSE (SELECT jsonb_build_object('id',h.submission_id) FROM competition_child_submission_heads h WHERE h.session_id=s.id AND h.judge_id=p_actor) END,
 'drafts',CASE WHEN p_owner THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.entry_id,d.criterion_id) FROM competition_child_score_drafts d WHERE d.session_id=s.id AND d.judge_id=p_actor),'[]') END,
 'laterRoundBlocked',p_round IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'rounds') r WHERE r->>'id'=p_round::text AND (r->>'displayOrder')::integer>0));
END $$;

CREATE OR REPLACE FUNCTION competition_child_live_control(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_action text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx jsonb; s competition_child_sessions; v competition_child_rule_versions; result jsonb; previous competition_child_scoring_audit; request uuid; ids jsonb; target uuid;
BEGIN
 PERFORM competition_native_authority(p_event,p_competition,p_actor,false);
 ctx:=competition_child_scoring_context(p_event,p_competition,p_actor,p_round,true);
 IF NOT EXISTS(SELECT 1 FROM events WHERE id=p_event AND status::text IN('draft','active')) THEN RAISE EXCEPTION 'EVENT_SCORING_CLOSED'; END IF;
 SELECT * INTO v FROM competition_child_rule_versions WHERE id=(ctx->>'rulesVersion')::uuid;
 IF p_body->>'rulesVersion' IS DISTINCT FROM ctx->>'rulesVersion' OR (p_body->>'setupRevision')::bigint IS DISTINCT FROM (ctx->>'setupRevision')::bigint OR (p_body->>'inputRevision')::bigint IS DISTINCT FROM (ctx->>'inputRevision')::bigint THEN RAISE EXCEPTION 'CHILD_REVISION_CONFLICT'; END IF;
 request:=(p_body->>'requestId')::uuid;IF request IS NULL THEN RAISE EXCEPTION 'REQUEST_ID_REQUIRED'; END IF;
 SELECT * INTO s FROM competition_child_sessions WHERE competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round FOR UPDATE;
 SELECT * INTO previous FROM competition_child_scoring_audit WHERE session_id=s.id AND actor_id=p_actor AND request_id=request;
 IF previous.id IS NOT NULL THEN IF previous.payload IS DISTINCT FROM p_body OR previous.action<>p_action THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;RETURN previous.result||jsonb_build_object('notificationUserIds',competition_child_scoring_recipients(p_event,p_competition,p_round)); END IF;
 IF p_action='start' AND s.id IS NULL THEN
  IF p_round IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(v.configuration_snapshot->'rounds') r WHERE r->>'id'=p_round::text AND (r->>'displayOrder')::integer>0) THEN RAISE EXCEPTION 'FINALIZED_QUALIFICATION_REQUIRED'; END IF;
  SELECT coalesce(jsonb_agg(e->>'id' ORDER BY (e->>'entry_number')::integer),'[]') INTO ids FROM jsonb_array_elements(v.participation_snapshot) e WHERE p_round IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v.configuration_snapshot->'rounds') r WHERE r->>'id'=p_round::text AND r ? 'entryIds') OR EXISTS(SELECT 1 FROM jsonb_array_elements(v.configuration_snapshot->'rounds') r WHERE r->>'id'=p_round::text AND r->'entryIds' ? (e->>'id'));
  IF jsonb_array_length(ids)=0 THEN RAISE EXCEPTION 'ELIGIBLE_ENTRIES_REQUIRED'; END IF;
  INSERT INTO competition_child_sessions(event_id,competition_id,round_id,rules_version,status,entry_ids) VALUES(p_event,p_competition,p_round,v.id,'active',ids) RETURNING * INTO s;
 ELSE
  IF s.id IS NULL OR (p_body->>'sessionId')::uuid IS DISTINCT FROM s.id OR (p_body->>'sessionRevision')::bigint IS DISTINCT FROM s.revision THEN RAISE EXCEPTION 'SESSION_REVISION_CONFLICT'; END IF;
  IF p_action IN('pause','resume','close') THEN
   IF s.status='closed' OR p_action='pause' AND s.status<>'active' OR p_action='resume' AND s.status<>'paused' THEN RAISE EXCEPTION 'SESSION_CLOSED_OR_INVALID_TRANSITION'; END IF;
   UPDATE competition_child_sessions SET status=CASE p_action WHEN 'pause' THEN 'paused' WHEN 'resume' THEN 'active' ELSE 'closed' END,revision=revision+1 WHERE id=s.id RETURNING * INTO s;
  ELSIF p_action='access' THEN
   IF s.status='closed' OR jsonb_typeof(p_body->'open') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'SESSION_CLOSED_OR_INVALID_ACCESS'; END IF;
   target:=(p_body->>'targetId')::uuid;
   IF p_body->>'kind'='entry' AND s.entry_ids ? target::text THEN UPDATE competition_child_sessions SET entry_access=jsonb_set(entry_access,ARRAY[target::text],p_body->'open'),revision=revision+1 WHERE id=s.id RETURNING * INTO s;
   ELSIF p_body->>'kind'='criterion' AND EXISTS(SELECT 1 FROM jsonb_array_elements(v.configuration_snapshot->'criteria') k WHERE k->>'id'=target::text AND (k->>'roundId')::uuid IS NOT DISTINCT FROM p_round) THEN UPDATE competition_child_sessions SET criterion_access=jsonb_set(criterion_access,ARRAY[target::text],p_body->'open'),revision=revision+1 WHERE id=s.id RETURNING * INTO s;
   ELSE RAISE EXCEPTION 'SCOPED_ACCESS_FORBIDDEN'; END IF;
  ELSIF p_action='reopen' THEN
   IF p_body->'acknowledged' IS DISTINCT FROM 'true'::jsonb OR length(btrim(coalesce(p_body->>'reason','')))<5 THEN RAISE EXCEPTION 'ACKNOWLEDGED_REASON_REQUIRED'; END IF;
   -- Preserve snapshots; reopening permits the original judge to correct sources.
   IF p_body->>'judgeId' IS NOT NULL THEN
    target:=(p_body->>'judgeId')::uuid;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v.assignment_snapshot) a WHERE a->>'judgeId'=target::text AND (a->>'round_id' IS NULL OR a->>'round_id'=p_round::text)) THEN RAISE EXCEPTION 'FROZEN_JUDGE_FORBIDDEN'; END IF;
    UPDATE competition_child_score_drafts SET locked=false,revision=revision+1 WHERE session_id=s.id AND judge_id=target;
    DELETE FROM competition_child_submission_heads WHERE session_id=s.id AND judge_id=target;
   END IF;
   UPDATE competition_child_sessions SET status='paused',revision=revision+1,source_revision=source_revision+1 WHERE id=s.id RETURNING * INTO s;
  ELSE RAISE EXCEPTION 'INVALID_LIVE_ACTION'; END IF;
 END IF;
 result:=jsonb_build_object('sessionId',s.id,'sessionRevision',s.revision,'status',s.status,'notificationUserIds',competition_child_scoring_recipients(p_event,p_competition,p_round));
 INSERT INTO competition_child_scoring_audit(session_id,actor_id,request_id,action,payload,result) VALUES(s.id,p_actor,request,p_action,p_body,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION competition_child_score_write(p_event uuid,p_competition uuid,p_judge uuid,p_round uuid,p_action text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx jsonb; s competition_child_sessions; v competition_child_rule_versions; k jsonb; t jsonb; d competition_child_score_drafts; previous competition_child_scoring_audit; request uuid; entry uuid; criterion uuid; targets jsonb; incoming jsonb; n numeric; result jsonb; submission competition_child_submissions;
BEGIN
 -- Shared event/child locks serialize with setup and dependency invalidation.
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 PERFORM 1 FROM competitions WHERE id=p_competition AND event_id=p_event FOR UPDATE;
 ctx:=competition_child_scoring_context(p_event,p_competition,p_judge,p_round,false);
 IF NOT EXISTS(SELECT 1 FROM events WHERE id=p_event AND status::text IN('draft','active')) THEN RAISE EXCEPTION 'EVENT_SCORING_CLOSED'; END IF;
 SELECT * INTO s FROM competition_child_sessions WHERE id=(p_body->>'sessionId')::uuid AND competition_id=p_competition AND event_id=p_event AND round_id IS NOT DISTINCT FROM p_round FOR UPDATE;
 IF s.id IS NULL OR p_body->>'rulesVersion' IS DISTINCT FROM ctx->>'rulesVersion' OR (p_body->>'setupRevision')::bigint IS DISTINCT FROM (ctx->>'setupRevision')::bigint OR (p_body->>'inputRevision')::bigint IS DISTINCT FROM (ctx->>'inputRevision')::bigint THEN RAISE EXCEPTION 'CHILD_REVISION_CONFLICT'; END IF;
 request:=(p_body->>'requestId')::uuid;IF request IS NULL THEN RAISE EXCEPTION 'REQUEST_ID_REQUIRED'; END IF;
 SELECT * INTO previous FROM competition_child_scoring_audit WHERE session_id=s.id AND actor_id=p_judge AND request_id=request;
 IF previous.id IS NOT NULL THEN IF previous.payload IS DISTINCT FROM p_body OR previous.action<>p_action THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;RETURN previous.result||jsonb_build_object('notificationUserIds',competition_child_scoring_recipients(p_event,p_competition,p_round)); END IF;
 IF s.status<>'active' OR (p_body->>'sessionRevision')::bigint IS DISTINCT FROM s.revision THEN RAISE EXCEPTION 'SESSION_CLOSED_OR_REVISION_CONFLICT'; END IF;
 SELECT * INTO v FROM competition_child_rule_versions WHERE id=s.rules_version;
 IF EXISTS(SELECT 1 FROM competition_child_submission_heads WHERE session_id=s.id AND judge_id=p_judge) THEN RAISE EXCEPTION 'ROUND_ALREADY_SUBMITTED'; END IF;
 IF p_action IN('draft','lock') THEN
  entry:=(p_body->>'entryId')::uuid;criterion:=(p_body->>'criterionId')::uuid;incoming:=p_body->'scores';
  IF NOT s.entry_ids ? entry::text OR coalesce((s.entry_access->>entry::text)::boolean,false) IS NOT TRUE OR coalesce((s.criterion_access->>criterion::text)::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'SCOPED_ACCESS_FORBIDDEN'; END IF;
  SELECT value INTO k FROM jsonb_array_elements(v.configuration_snapshot->'criteria') WHERE value->>'id'=criterion::text AND (value->>'roundId')::uuid IS NOT DISTINCT FROM p_round;
  IF k IS NULL OR jsonb_typeof(incoming) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_SCOPED_SCORES'; END IF;
  targets:=CASE WHEN jsonb_array_length(coalesce(k->'minorCriteria','[]'))>0 THEN k->'minorCriteria' ELSE jsonb_build_array(k) END;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(incoming) key WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(targets) target_def WHERE target_def->>'id'=key)) OR p_action='lock' AND (SELECT count(*) FROM jsonb_object_keys(incoming))<>jsonb_array_length(targets) THEN RAISE EXCEPTION 'INCOMPLETE_OR_FOREIGN_SCORES'; END IF;
  FOR t IN SELECT value FROM jsonb_array_elements(targets) LOOP
   IF incoming ? (t->>'id') THEN
    IF jsonb_typeof(incoming->(t->>'id')) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'INVALID_NUMERIC_SCORE'; END IF;
    n:=(incoming->>(t->>'id'))::numeric;
    IF n<(t->>'minScore')::numeric OR n>(t->>'maxScore')::numeric THEN RAISE EXCEPTION 'SCORE_OUT_OF_BOUNDS'; END IF;
   END IF;
  END LOOP;
  SELECT * INTO d FROM competition_child_score_drafts WHERE session_id=s.id AND judge_id=p_judge AND entry_id=entry AND criterion_id=criterion FOR UPDATE;
  IF d.locked OR (p_body->>'rowRevision')::bigint IS DISTINCT FROM coalesce(d.revision,0) THEN RAISE EXCEPTION 'LOCKED_OR_ROW_REVISION_CONFLICT'; END IF;
  INSERT INTO competition_child_score_drafts(session_id,judge_id,entry_id,criterion_id,scores,locked) VALUES(s.id,p_judge,entry,criterion,incoming,p_action='lock') ON CONFLICT(session_id,judge_id,entry_id,criterion_id) DO UPDATE SET scores=excluded.scores,locked=excluded.locked,revision=competition_child_score_drafts.revision+1 RETURNING * INTO d;
  result:=jsonb_build_object('rowRevision',d.revision,'locked',d.locked);
 ELSIF p_action='submit' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(s.entry_ids) e CROSS JOIN jsonb_array_elements(v.configuration_snapshot->'criteria') criterion_def WHERE (criterion_def->>'roundId')::uuid IS NOT DISTINCT FROM p_round AND NOT EXISTS(SELECT 1 FROM competition_child_score_drafts score_row WHERE score_row.session_id=s.id AND score_row.judge_id=p_judge AND score_row.entry_id=e::uuid AND score_row.criterion_id=(criterion_def->>'id')::uuid AND score_row.locked)) THEN RAISE EXCEPTION 'ALL_CRITERIA_LOCKS_REQUIRED'; END IF;
  INSERT INTO competition_child_submissions(session_id,judge_id,rules_version,sources) SELECT s.id,p_judge,v.id,jsonb_agg(to_jsonb(score_row) ORDER BY entry_id,criterion_id) FROM competition_child_score_drafts score_row WHERE score_row.session_id=s.id AND score_row.judge_id=p_judge RETURNING * INTO submission;
  INSERT INTO competition_child_submission_heads VALUES(s.id,p_judge,submission.id);
  result:=jsonb_build_object('submissionId',submission.id);
 ELSE RAISE EXCEPTION 'INVALID_SCORE_ACTION'; END IF;
 UPDATE competition_child_sessions SET source_revision=source_revision+1 WHERE id=s.id;
 result:=result||jsonb_build_object('sessionId',s.id,'notificationUserIds',competition_child_scoring_recipients(p_event,p_competition,p_round));
 INSERT INTO competition_child_scoring_audit(session_id,actor_id,request_id,action,payload,result) VALUES(s.id,p_judge,request,p_action,p_body,result);
 RETURN result;
END $$;

-- Only the trusted API may call authorized RPCs; it cannot mutate tables directly.
REVOKE ALL ON FUNCTION competition_child_scoring_recipients(uuid,uuid,uuid),competition_child_scoring_relation_guard() FROM PUBLIC;
DO $$ DECLARE t text; f record; role_name text; BEGIN
 FOREACH t IN ARRAY ARRAY['competition_child_sessions','competition_child_score_drafts','competition_child_submissions','competition_child_submission_heads','competition_child_scoring_audit'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON %I FROM %I',t,role_name); END IF; END LOOP;
 END LOOP;
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('competition_child_scoring_context','competition_child_scoring_choices','competition_child_live_view','competition_child_live_control','competition_child_score_write') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.signature,role_name); END IF; END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature); END IF;
 END LOOP;
END $$;
COMMIT;
