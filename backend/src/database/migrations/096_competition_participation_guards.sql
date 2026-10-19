-- Apply once, after 095. Existing memberships are retained as planned entries;
-- no historical score, submission, calculation or advancement is rewritten.
BEGIN;
ALTER TABLE competition_advancement_decisions ADD COLUMN automatic_qualifiers jsonb,
 ADD COLUMN selection_basis text CHECK(selection_basis IN ('automatic','manual'));

CREATE FUNCTION competition_registration_source(p_event uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT jsonb_build_object('divisionsEnabled',coalesce(e.divisions_enabled,false),
 'entries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'divisionId',c.division_id) ORDER BY c.id) FROM competition_contestants c WHERE c.event_id=e.id),'[]'::jsonb),
 'rounds',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'displayOrder',coalesce(r.display_order,0),'divisionId',r.division_id,
 'purpose',coalesce(r.workflow->>'purpose','regular'),'advancementType',coalesce(r.advancement_type,'none'),'advancementValue',r.advancement_value,
 'nextRoundId',r.workflow->>'nextRoundId','contestantIds',coalesce((SELECT jsonb_agg(rc.contestant_id ORDER BY rc.contestant_id) FROM competition_round_contestants rc WHERE rc.round_id=r.id),'[]'::jsonb)) ORDER BY r.id) FROM competition_rounds r WHERE r.event_id=e.id),'[]'::jsonb)) FROM events e WHERE e.id=p_event;
$$;
CREATE FUNCTION competition_qualification_sources(p_rounds jsonb,p_round uuid) RETURNS SETOF jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT s FROM jsonb_array_elements(coalesce(p_rounds,'[]')) s
 WHERE (s->>'purpose'='qualification' OR coalesce(s->>'advancementType','none')<>'none')
 AND coalesce(nullif(s->>'nextRoundId',''),(SELECT n->>'id' FROM jsonb_array_elements(p_rounds) n
   WHERE (n->>'displayOrder')::integer>(s->>'displayOrder')::integer ORDER BY (n->>'displayOrder')::integer,n->>'id' LIMIT 1))=p_round::text;
$$;
CREATE FUNCTION competition_require_qualified(p_event uuid,p_rules uuid,p_round uuid,p_entry uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot jsonb; decision competition_advancement_decisions;
BEGIN
 IF p_round IS NULL THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM competition_rounds WHERE id=p_round AND event_id=p_event) THEN RAISE EXCEPTION 'ROUND_FORBIDDEN'; END IF;
 IF p_rules IS NULL THEN SELECT competition_registration_source(p_event) INTO snapshot;
 ELSE SELECT rv.snapshot INTO snapshot FROM competition_rule_versions rv WHERE rv.id=p_rules AND rv.event_id=p_event; END IF;
 IF EXISTS(SELECT 1 FROM competition_qualification_sources(snapshot->'rounds',p_round)) THEN
   SELECT d.* INTO decision FROM competition_advancement_decisions d WHERE d.event_id=p_event AND d.rules_version=p_rules AND d.next_round_id=p_round
   AND EXISTS(SELECT 1 FROM competition_qualification_sources(snapshot->'rounds',p_round) s WHERE s->>'id'=d.round_id::text);
   IF decision.id IS NULL THEN RAISE EXCEPTION 'QUALIFICATION_NOT_CONFIRMED: Awaiting verified and approved advancement'; END IF;
   IF p_entry IS NOT NULL AND NOT decision.qualifiers ? p_entry::text THEN RAISE EXCEPTION 'ENTRY_NOT_QUALIFIED_FOR_ROUND'; END IF;
 END IF;
END; $$;

CREATE FUNCTION competition_guard_round_participation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target uuid; entry_id uuid; v_event uuid; version uuid; r competition_rounds; c competition_contestants; snapshot jsonb;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.round_id ELSE NEW.round_id END;
 entry_id:=CASE WHEN TG_OP='DELETE' THEN OLD.contestant_id ELSE NEW.contestant_id END;
 SELECT * INTO r FROM competition_rounds WHERE id=target;
 v_event:=r.event_id;
 SELECT official_rules_id INTO version FROM events WHERE id=v_event FOR UPDATE;
 IF TG_OP='UPDATE' AND (OLD.round_id IS DISTINCT FROM NEW.round_id OR OLD.contestant_id IS DISTINCT FROM NEW.contestant_id) THEN RAISE EXCEPTION 'REPLACE_MEMBERSHIP_THROUGH_AUTHORIZED_OPERATION'; END IF;
 SELECT competition_registration_source(v_event) INTO snapshot;
 IF EXISTS(SELECT 1 FROM competition_qualification_sources(snapshot->'rounds',target)) THEN
   IF current_setting('votrix.authorized_operation',true) IS DISTINCT FROM 'advancement' THEN RAISE EXCEPTION 'PROTECTED_ROUND_ASSIGNMENT: Use approved advancement'; END IF;
   IF TG_OP<>'DELETE' THEN PERFORM competition_require_qualified(v_event,version,target,entry_id); END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
   SELECT * INTO c FROM competition_contestants WHERE id=entry_id AND competition_contestants.event_id=v_event;
   IF c.id IS NULL THEN RAISE EXCEPTION 'ENTRY_FORBIDDEN'; END IF;
   IF r.division_id IS NOT NULL AND c.division_id IS DISTINCT FROM r.division_id THEN RAISE EXCEPTION 'ENTRY_DIVISION_NOT_ELIGIBLE'; END IF;
   IF EXISTS(SELECT 1 FROM competition_eligibility_decisions d WHERE d.event_id=v_event AND d.rules_version=version AND d.contestant_id=entry_id AND d.status='approved' AND (d.round_id IS NULL OR d.round_id=target)) THEN RAISE EXCEPTION 'ENTRY_NON_COMPETING'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER competition_participation_guard BEFORE INSERT OR UPDATE OR DELETE ON competition_round_contestants FOR EACH ROW EXECUTE FUNCTION competition_guard_round_participation();

CREATE FUNCTION competition_set_round_membership(p_event uuid,p_actor uuid,p_round uuid,p_entry uuid,p_add boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e events;
BEGIN
 SELECT * INTO e FROM events WHERE id=p_event FOR UPDATE;
 IF NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
 IF e.status<>'draft' OR e.official_rules_id IS NOT NULL THEN RAISE EXCEPTION 'OFFICIAL_SETUP_FROZEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM competition_rounds WHERE id=p_round AND event_id=p_event) OR NOT EXISTS(SELECT 1 FROM competition_contestants WHERE id=p_entry AND event_id=p_event) THEN RAISE EXCEPTION 'ROUND_OR_ENTRY_FORBIDDEN'; END IF;
 IF EXISTS(SELECT 1 FROM competition_qualification_sources(competition_registration_source(p_event)->'rounds',p_round)) THEN RAISE EXCEPTION 'PROTECTED_ROUND_ASSIGNMENT: Use approved advancement'; END IF;
 IF p_add THEN INSERT INTO competition_round_contestants(round_id,contestant_id) VALUES(p_round,p_entry) ON CONFLICT DO NOTHING;
 ELSE DELETE FROM competition_round_contestants WHERE round_id=p_round AND contestant_id=p_entry; END IF;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,CASE WHEN p_add THEN 'competition.entry.assign' ELSE 'competition.entry.remove' END,'competition_rounds',p_round,jsonb_build_object('contestantId',p_entry));
 RETURN jsonb_build_object('success',true);
END; $$;

CREATE FUNCTION competition_guard_entry_registration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE enabled boolean; version uuid;
BEGIN
 SELECT divisions_enabled,official_rules_id INTO enabled,version FROM events WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.event_id ELSE NEW.event_id END FOR UPDATE;
 IF TG_OP='DELETE' THEN
   IF EXISTS(SELECT 1 FROM competition_session_judge_scores WHERE contestant_id=OLD.id) OR EXISTS(SELECT 1 FROM competition_scores WHERE contestant_id=OLD.id)
     OR EXISTS(SELECT 1 FROM competition_rule_versions WHERE event_id=OLD.event_id AND snapshot->'contestants' @> jsonb_build_array(jsonb_build_object('id',OLD.id)))
     OR EXISTS(SELECT 1 FROM competition_advancement_decisions WHERE event_id=OLD.event_id AND qualifiers ? OLD.id::text)
     OR EXISTS(SELECT 1 FROM competition_result_calculations WHERE event_id=OLD.event_id AND result_snapshot @> jsonb_build_array(jsonb_build_object('contestantId',OLD.id))) THEN RAISE EXCEPTION 'HISTORICAL_ENTRY_MUST_BE_PRESERVED'; END IF;
   RETURN OLD;
 END IF;
 IF version IS NOT NULL THEN RAISE EXCEPTION 'OFFICIAL_REGISTRATION_FROZEN'; END IF;
 IF TG_OP='UPDATE' AND NEW.event_id IS DISTINCT FROM OLD.event_id THEN RAISE EXCEPTION 'ENTRY_EVENT_IMMUTABLE'; END IF;
 IF coalesce(enabled,false) AND NEW.division_id IS NULL THEN RAISE EXCEPTION 'ENTRY_DIVISION_REQUIRED'; END IF;
 IF NEW.division_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM competition_divisions WHERE id=NEW.division_id AND event_id=NEW.event_id) THEN RAISE EXCEPTION 'DIVISION_FORBIDDEN'; END IF;
   IF TG_OP='INSERT' OR NEW.division_id IS DISTINCT FROM OLD.division_id THEN
     IF NOT coalesce(enabled,false) THEN RAISE EXCEPTION 'DIVISIONS_DISABLED'; END IF;
     IF EXISTS(SELECT 1 FROM competition_divisions WHERE id=NEW.division_id AND NOT is_active) THEN RAISE EXCEPTION 'DIVISION_INACTIVE'; END IF;
   END IF;
 END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM competition_round_contestants rc JOIN competition_rounds r ON r.id=rc.round_id WHERE rc.contestant_id=OLD.id AND r.division_id IS NOT NULL AND r.division_id IS DISTINCT FROM NEW.division_id) THEN RAISE EXCEPTION 'REMOVE_INCOMPATIBLE_ROUND_ASSIGNMENTS_FIRST'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER competition_entry_registration_guard BEFORE INSERT OR UPDATE OR DELETE ON competition_contestants FOR EACH ROW EXECUTE FUNCTION competition_guard_entry_registration();

-- Keep existing operations intact behind private wrappers. Public callers cannot
-- bypass the new guards by invoking the previous function signatures.
ALTER FUNCTION competition_publish_rules(uuid,uuid,uuid,jsonb) RENAME TO competition_publish_rules_v095;
REVOKE ALL ON FUNCTION competition_publish_rules_v095(uuid,uuid,uuid,jsonb) FROM PUBLIC,service_role;
CREATE FUNCTION competition_publish_rules(p_event uuid,p_actor uuid,p_id uuid,p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 IF p_snapshot->'registrationSource' IS DISTINCT FROM competition_registration_source(p_event) THEN RAISE EXCEPTION 'REGISTRATION_SETUP_CHANGED_REFRESH'; END IF;
 RETURN competition_publish_rules_v095(p_event,p_actor,p_id,p_snapshot);
END; $$;

ALTER FUNCTION competition_scoring_write(uuid,uuid,jsonb,text,jsonb) RENAME TO competition_scoring_write_v095;
REVOKE ALL ON FUNCTION competition_scoring_write_v095(uuid,uuid,jsonb,text,jsonb) FROM PUBLIC,service_role;
CREATE FUNCTION competition_scoring_write(p_event uuid,p_judge uuid,p_context jsonb,p_action text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s competition_sessions;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 SELECT * INTO s FROM competition_sessions WHERE id=(p_context->>'sessionId')::uuid AND event_id=p_event FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'STALE_SESSION_CONTEXT'; END IF;
 PERFORM competition_require_qualified(p_event,s.rules_version,s.current_round_id,(p_payload->>'contestantId')::uuid);
 RETURN competition_scoring_write_v095(p_event,p_judge,p_context,p_action,p_payload);
END; $$;
CREATE FUNCTION competition_guard_qualified_score() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_event uuid; version uuid;
BEGIN
 SELECT event_id INTO v_event FROM competition_contestants WHERE id=NEW.contestant_id;
 SELECT official_rules_id INTO version FROM events WHERE id=v_event FOR UPDATE;
 IF TG_TABLE_NAME<>'competition_scores' THEN
   IF NEW.event_id IS DISTINCT FROM v_event THEN RAISE EXCEPTION 'ENTRY_FORBIDDEN'; END IF;
   version:=NEW.rules_version;
 END IF;
 PERFORM competition_require_qualified(v_event,version,NEW.round_id,NEW.contestant_id);
 RETURN NEW;
END; $$;
CREATE TRIGGER competition_qualified_json_score BEFORE INSERT OR UPDATE OF scores,contestant_id,round_id,rules_version ON competition_session_judge_scores FOR EACH ROW EXECUTE FUNCTION competition_guard_qualified_score();
CREATE TRIGGER competition_qualified_draft BEFORE INSERT OR UPDATE OF scores,contestant_id,round_id,rules_version ON competition_judge_drafts FOR EACH ROW EXECUTE FUNCTION competition_guard_qualified_score();
CREATE TRIGGER competition_qualified_projection BEFORE INSERT OR UPDATE OF score,contestant_id,round_id ON competition_scores FOR EACH ROW EXECUTE FUNCTION competition_guard_qualified_score();
CREATE FUNCTION competition_guard_qualified_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE entry uuid;
BEGIN
 IF NEW.status NOT IN ('active','paused') THEN RETURN NEW; END IF;
 PERFORM 1 FROM events WHERE id=NEW.event_id FOR UPDATE;
 PERFORM competition_require_qualified(NEW.event_id,NEW.rules_version,NEW.current_round_id);
 FOREACH entry IN ARRAY coalesce(NEW.contestant_order,'{}'::uuid[]) LOOP
   PERFORM competition_require_qualified(NEW.event_id,NEW.rules_version,NEW.current_round_id,entry);
 END LOOP;
 RETURN NEW;
END; $$;
CREATE TRIGGER competition_qualified_session BEFORE INSERT OR UPDATE OF current_round_id,contestant_order ON competition_sessions FOR EACH ROW EXECUTE FUNCTION competition_guard_qualified_session();

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
 expected_next:=coalesce((r->>'nextRoundId')::uuid,(SELECT (n->>'id')::uuid FROM jsonb_array_elements(rv.snapshot->'rounds') n WHERE (n->>'displayOrder')::integer>(r->>'displayOrder')::integer ORDER BY (n->>'displayOrder')::integer,n->>'id' LIMIT 1));
 IF p_next IS DISTINCT FROM expected_next THEN RAISE EXCEPTION 'INVALID_NEXT_ROUND'; END IF;
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

REVOKE ALL ON FUNCTION competition_registration_source(uuid),competition_qualification_sources(jsonb,uuid),competition_require_qualified(uuid,uuid,uuid,uuid),competition_set_round_membership(uuid,uuid,uuid,uuid,boolean),competition_publish_rules(uuid,uuid,uuid,jsonb),competition_scoring_write(uuid,uuid,jsonb,text,jsonb),competition_confirm_advancement(uuid,uuid,uuid,uuid,uuid,uuid[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_registration_source(uuid),competition_set_round_membership(uuid,uuid,uuid,uuid,boolean),competition_publish_rules(uuid,uuid,uuid,jsonb),competition_scoring_write(uuid,uuid,jsonb,text,jsonb),competition_confirm_advancement(uuid,uuid,uuid,uuid,uuid,uuid[],text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
