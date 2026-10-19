BEGIN;
CREATE FUNCTION competition_owns_event(p_event uuid,p_actor uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM events e JOIN organizations o ON o.id=e.organization_id JOIN users u ON u.id=o.organizer_id WHERE e.id=p_event AND u.id=p_actor AND u.account_status='active' AND e.event_type::text IN ('competition_scoring','pageant'));
$$;
CREATE FUNCTION competition_publish_rules(p_event uuid,p_actor uuid,p_id uuid,p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e events; v integer;
BEGIN
 SELECT * INTO e FROM events WHERE id=p_event FOR UPDATE;
 IF NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
 IF e.status<>'draft' OR e.official_rules_id IS NOT NULL THEN RAISE EXCEPTION 'RULES_ALREADY_FROZEN'; END IF;
 IF NOT coalesce((p_snapshot->'scoringConfig'->>'confirmed')::boolean,false) OR p_snapshot->'scoringConfig'->>'calculationMethod'='undecided' THEN RAISE EXCEPTION 'RULES_NOT_CONFIRMED'; END IF;
 SELECT coalesce(max(version),0)+1 INTO v FROM competition_rule_versions WHERE event_id=p_event;
 INSERT INTO competition_rule_versions(id,event_id,version,snapshot,acknowledged_by) VALUES(p_id,p_event,v,p_snapshot,p_actor);
 UPDATE events SET official_rules_id=p_id,status='scheduled',competition_lifecycle='published_setup' WHERE id=p_event;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.rules.confirm','competition_rule_versions',p_id,jsonb_build_object('version',v));
 RETURN jsonb_build_object('id',p_id,'version',v,'status','scheduled');
END; $$;

CREATE FUNCTION competition_reorder_rounds(p_event uuid,p_actor uuid,p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e events;
BEGIN
 SELECT * INTO e FROM events WHERE id=p_event FOR UPDATE;
 IF NOT competition_owns_event(p_event,p_actor) OR e.status<>'draft' OR e.official_rules_id IS NOT NULL THEN RAISE EXCEPTION 'ROUND_ORDER_FROZEN'; END IF;
 IF cardinality(p_ids)<>(SELECT count(*) FROM competition_rounds WHERE event_id=p_event) OR cardinality(p_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_ids) id) OR EXISTS(SELECT 1 FROM unnest(p_ids) id WHERE NOT EXISTS(SELECT 1 FROM competition_rounds r WHERE r.id=id AND r.event_id=p_event)) THEN RAISE EXCEPTION 'INVALID_ROUND_ORDER'; END IF;
 UPDATE competition_rounds r SET display_order=x.n-1 FROM unnest(p_ids) WITH ORDINALITY x(id,n) WHERE r.id=x.id;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.round.order','events',p_event,jsonb_build_object('roundIds',p_ids));
 RETURN jsonb_build_object('success',true);
END; $$;

CREATE FUNCTION competition_operational_action(p_event uuid,p_actor uuid,p_session uuid,p_action text,p_payload jsonb) RETURNS jsonb
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
   SELECT array_agg((value->>'id')::uuid ORDER BY (value->>'contestantNumber')::integer) INTO ids FROM jsonb_array_elements(rv.snapshot->'contestants') WHERE r IS NULL OR coalesce(r->'contestantIds','[]') ? (value->>'id');
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
     SELECT coalesce((SELECT qualifiers FROM competition_advancement_decisions WHERE event_id=p_event AND rules_version=s.rules_version AND next_round_id=(r->>'id')::uuid ORDER BY confirmed_at DESC LIMIT 1),r->'contestantIds') INTO gate;
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

CREATE FUNCTION competition_result_transition(p_event uuid,p_actor uuid,p_calculation uuid,p_action text,p_digest text,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c competition_result_calculations; rv competition_rule_versions; independent boolean;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 SELECT * INTO c FROM competition_result_calculations WHERE id=p_calculation AND event_id=p_event FOR UPDATE;
 SELECT * INTO rv FROM competition_rule_versions WHERE id=c.rules_version;
 IF c.id IS NULL OR c.rules_version IS DISTINCT FROM (SELECT official_rules_id FROM events WHERE id=p_event) OR c.source_digest IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'STALE_CALCULATION'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(c.source_versions) src WHERE NOT EXISTS(SELECT 1 FROM competition_round_submissions s WHERE s.id=(src->>'id')::uuid AND s.version=(src->>'version')::bigint AND s.status='submitted')) THEN RAISE EXCEPTION 'SOURCE_VERSION_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM competition_deductions WHERE event_id=p_event AND rules_version=c.rules_version AND decision_status='pending') OR EXISTS(SELECT 1 FROM competition_eligibility_decisions WHERE event_id=p_event AND rules_version=c.rules_version AND status='pending') THEN RAISE EXCEPTION 'PENDING_DECISIONS'; END IF;
 independent:=coalesce((rv.snapshot->'scoringConfig'->>'independentApproval')::boolean,true) OR rv.snapshot->'scoringConfig'->>'calculationMethod'='manual';
 IF p_action='verify' THEN
   IF NOT competition_owns_event(p_event,p_actor) AND NOT EXISTS(SELECT 1 FROM event_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.event_id=p_event AND ep.user_id=p_actor AND ep.is_active=true AND ep.judge_role::text='score_reviewer' AND u.account_status='active' AND rv.snapshot->'scoringConfig'->>'verifierId'=p_actor::text) THEN RAISE EXCEPTION 'VERIFIER_FORBIDDEN'; END IF;
   IF independent AND c.created_by=p_actor THEN RAISE EXCEPTION 'INDEPENDENT_APPROVAL_REQUIRED'; END IF;
   IF c.status NOT IN ('ready_for_verification','under_verification') THEN RAISE EXCEPTION 'CALCULATION_NOT_READY'; END IF;
   UPDATE competition_result_calculations SET status='under_verification',verified_by=p_actor,verified_at=now(),verification=jsonb_build_object('reason',p_reason,'sourceDigest',p_digest) WHERE id=c.id RETURNING * INTO c;
 ELSE
   IF NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
   IF p_action='finalize' THEN
     IF c.status<>'under_verification' OR c.verified_at IS NULL THEN RAISE EXCEPTION 'VERIFICATION_REQUIRED'; END IF;
     UPDATE competition_result_calculations SET status='finalized',finalized_by=p_actor,finalized_at=now() WHERE id=c.id RETURNING * INTO c;
   ELSIF p_action='publish' THEN
     IF c.status<>'finalized' THEN RAISE EXCEPTION 'FINALIZATION_REQUIRED'; END IF;
     UPDATE competition_result_calculations SET status='published',published_by=p_actor,published_at=now() WHERE id=c.id RETURNING * INTO c;
     IF c.round_id IS NULL THEN
       UPDATE events SET status='completed',competition_lifecycle='results_published',scoring_enabled=false WHERE id=p_event;
       UPDATE competition_sessions SET status='completed',completed_at=coalesce(completed_at,now()),submission_window=false,access_config='{"entries":{"mode":"none","ids":[]},"criteria":{"mode":"none","ids":[]},"intersections":{}}' WHERE event_id=p_event AND rules_version=c.rules_version AND status IN('active','paused');
     END IF;
   ELSE RAISE EXCEPTION 'UNKNOWN_TRANSITION'; END IF;
 END IF;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.results.'||p_action,'competition_result_calculations',c.id,jsonb_build_object('reason',p_reason,'rulesVersion',c.rules_version));
 RETURN to_jsonb(c);
END; $$;

CREATE FUNCTION competition_confirm_advancement(p_event uuid,p_actor uuid,p_round uuid,p_next uuid,p_calculation uuid,p_qualifiers uuid[],p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c competition_result_calculations; decision competition_advancement_decisions;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 IF NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
 SELECT * INTO c FROM competition_result_calculations WHERE id=p_calculation AND event_id=p_event AND round_id=p_round AND verified_at IS NOT NULL AND status IN ('under_verification','finalized','published') FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'VERIFIED_ROUND_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM competition_advancement_decisions WHERE round_id=p_round AND rules_version=c.rules_version) THEN RAISE EXCEPTION 'AUTHORIZED_ADVANCEMENT_AMENDMENT_REQUIRED'; END IF;
 IF p_next IS NOT NULL AND NOT EXISTS(SELECT 1 FROM competition_rounds n JOIN competition_rounds r ON r.id=p_round WHERE n.id=p_next AND n.event_id=p_event AND n.display_order>r.display_order) THEN RAISE EXCEPTION 'INVALID_NEXT_ROUND'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_qualifiers) id WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.result_snapshot) r WHERE r->>'contestantId'=id::text)) THEN RAISE EXCEPTION 'INVALID_QUALIFIER'; END IF;
 INSERT INTO competition_advancement_decisions(event_id,round_id,next_round_id,calculation_id,rules_version,qualifiers,reason,confirmed_by) VALUES(p_event,p_round,p_next,c.id,c.rules_version,to_jsonb(p_qualifiers),p_reason,p_actor) RETURNING * INTO decision;
 IF p_next IS NOT NULL THEN
   PERFORM set_config('votrix.authorized_operation','advancement',true);
   DELETE FROM competition_round_contestants WHERE round_id=p_next;
   INSERT INTO competition_round_contestants(round_id,contestant_id) SELECT p_next,id FROM unnest(p_qualifiers) id;
 END IF;
 UPDATE competition_rounds SET finalized_at=now() WHERE id=p_round;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.advancement.confirm','competition_advancement_decisions',decision.id,jsonb_build_object('reason',p_reason,'calculationId',c.id));
 RETURN to_jsonb(decision);
END; $$;

REVOKE ALL ON FUNCTION competition_publish_rules(uuid,uuid,uuid,jsonb),competition_reorder_rounds(uuid,uuid,uuid[]),competition_operational_action(uuid,uuid,uuid,text,jsonb),competition_result_transition(uuid,uuid,uuid,text,text,text),competition_confirm_advancement(uuid,uuid,uuid,uuid,uuid,uuid[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_publish_rules(uuid,uuid,uuid,jsonb),competition_reorder_rounds(uuid,uuid,uuid[]) TO service_role;
-- grant the actual five-argument operational signature and result/advancement RPCs
GRANT EXECUTE ON FUNCTION competition_operational_action(uuid,uuid,uuid,text,jsonb),competition_result_transition(uuid,uuid,uuid,text,text,text),competition_confirm_advancement(uuid,uuid,uuid,uuid,uuid,uuid[],text) TO service_role;
COMMIT;
