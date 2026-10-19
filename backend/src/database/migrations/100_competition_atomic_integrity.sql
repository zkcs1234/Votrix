-- Additive repair after 099. Apply only after reviewing the preflight on the
-- intended database. Existing scores, rules and result payloads are preserved.
BEGIN;
ALTER TABLE events ADD COLUMN competition_setup_revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN competition_input_revision bigint NOT NULL DEFAULT 1;
ALTER TABLE competition_result_calculations ADD COLUMN source_input_revision bigint;

CREATE FUNCTION competition_check_relations(p_table text,p_row jsonb,p_old jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_event uuid; target uuid; field text; tab text; parent_id uuid;
BEGIN
 v_event:=nullif(p_row->>'event_id','')::uuid;
 IF v_event IS NULL AND p_table IN ('competition_round_criteria','competition_round_contestants') THEN
   SELECT event_id INTO v_event FROM competition_rounds WHERE id=(p_row->>'round_id')::uuid;
 ELSIF v_event IS NULL AND p_table='competition_judge_assignments' THEN
   SELECT event_id INTO v_event FROM event_participants WHERE id=(p_row->>'participant_id')::uuid;
 ELSIF v_event IS NULL AND p_table='competition_scores' THEN
   SELECT event_id INTO v_event FROM competition_contestants WHERE id=(p_row->>'contestant_id')::uuid;
 END IF;
 IF v_event IS NULL THEN RAISE EXCEPTION 'EVENT_RELATION_FORBIDDEN: %',p_table; END IF;
 IF p_old IS NOT NULL AND p_old ? 'event_id' AND p_old->>'event_id' IS DISTINCT FROM p_row->>'event_id' THEN
   RAISE EXCEPTION 'RESOURCE_EVENT_IMMUTABLE';
 END IF;
 FOR field,tab IN SELECT * FROM (VALUES
   ('round_id','competition_rounds'),('next_round_id','competition_rounds'),
   ('category_id','competition_categories'),('division_id','competition_divisions'),
   ('criteria_id','competition_criteria'),('contestant_id','competition_contestants'),
   ('session_id','competition_sessions'),('rules_version','competition_rule_versions'),
   ('participant_id','event_participants'),('calculation_id','competition_result_calculations')) links LOOP
   target:=nullif(p_row->>field,'')::uuid;
   IF target IS NOT NULL THEN
     EXECUTE format('SELECT id FROM public.%I WHERE id=$1 AND event_id=$2',tab) INTO parent_id USING target,v_event;
     IF parent_id IS NULL THEN RAISE EXCEPTION 'CROSS_EVENT_RELATION_FORBIDDEN: %.%',p_table,field; END IF;
   END IF;
 END LOOP;
 target:=nullif(p_row->'workflow'->>'nextRoundId','')::uuid;
 IF target IS NOT NULL AND (target=(p_row->>'id')::uuid OR NOT EXISTS(SELECT 1 FROM competition_rounds WHERE id=target AND event_id=v_event)) THEN
   RAISE EXCEPTION 'NEXT_ROUND_FORBIDDEN';
 END IF;
 target:=nullif(p_row->>'minor_criteria_id','')::uuid;
 IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM competition_minor_criteria WHERE id=target AND event_id=v_event AND criteria_id=(p_row->>'criteria_id')::uuid) THEN
   RAISE EXCEPTION 'MINOR_CRITERION_RELATION_FORBIDDEN';
 END IF;
 IF p_row->>'judge_id' IS NOT NULL AND p_row->>'participant_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM event_participants WHERE id=(p_row->>'participant_id')::uuid AND user_id=(p_row->>'judge_id')::uuid AND event_id=v_event AND participant_type='COMPETITION_JUDGE') THEN
   RAISE EXCEPTION 'JUDGE_ENROLLMENT_RELATION_FORBIDDEN';
 END IF;
 IF p_table='competition_judge_assignments' THEN
   target:=(p_row->>'scope_id')::uuid;
   IF p_row->>'scope'='event' THEN
     IF target IS DISTINCT FROM v_event THEN RAISE EXCEPTION 'ASSIGNMENT_EVENT_FORBIDDEN'; END IF;
   ELSE
     tab:=CASE p_row->>'scope' WHEN 'round' THEN 'competition_rounds' WHEN 'category' THEN 'competition_categories' WHEN 'division' THEN 'competition_divisions' END;
     IF tab IS NULL THEN RAISE EXCEPTION 'ASSIGNMENT_SCOPE_FORBIDDEN';END IF;
     EXECUTE format('SELECT id FROM public.%I WHERE id=$1 AND event_id=$2',tab) INTO parent_id USING target,v_event;
     IF parent_id IS NULL THEN RAISE EXCEPTION 'ASSIGNMENT_SCOPE_FORBIDDEN'; END IF;
   END IF;
 END IF;
END; $$;

-- Refuse inconsistent existing links; never silently move/delete historical data.
DO $$ DECLARE tab text; row_data jsonb;
BEGIN
 FOREACH tab IN ARRAY ARRAY['competition_rounds','competition_categories','competition_criteria','competition_minor_criteria','competition_contestants','competition_round_criteria','competition_round_contestants','competition_judge_assignments','competition_sessions','competition_session_judge_scores','competition_scores','competition_judge_drafts','competition_round_submissions','competition_deductions','competition_eligibility_decisions','competition_advancement_decisions','competition_lineups','competition_result_calculations'] LOOP
   FOR row_data IN EXECUTE format('SELECT to_jsonb(t) FROM public.%I t',tab) LOOP
     PERFORM competition_check_relations(tab,row_data);
   END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION competition_guard_relations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM competition_check_relations(TG_TABLE_NAME,to_jsonb(NEW),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END);
 RETURN NEW;
END; $$;
DO $$ DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['competition_rounds','competition_categories','competition_criteria','competition_minor_criteria','competition_contestants','competition_round_criteria','competition_round_contestants','competition_judge_assignments','competition_sessions','competition_session_judge_scores','competition_scores','competition_judge_drafts','competition_round_submissions','competition_deductions','competition_eligibility_decisions','competition_advancement_decisions','competition_lineups','competition_result_calculations'] LOOP
   EXECUTE format('CREATE TRIGGER competition_relation_integrity BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION competition_guard_relations()',tab);
 END LOOP;
END $$;

CREATE FUNCTION competition_revision_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_setup jsonb; new_setup jsonb;
BEGIN
 old_setup:=jsonb_build_object('config',to_jsonb(OLD)->'scoring_config','divisions',to_jsonb(OLD)->'divisions_enabled','organization',OLD.organization_id,
   'title',to_jsonb(OLD)->'title','description',to_jsonb(OLD)->'description','start',to_jsonb(OLD)->'start_date','end',to_jsonb(OLD)->'end_date','type',to_jsonb(OLD)->'competition_type');
 new_setup:=jsonb_build_object('config',to_jsonb(NEW)->'scoring_config','divisions',to_jsonb(NEW)->'divisions_enabled','organization',NEW.organization_id,
   'title',to_jsonb(NEW)->'title','description',to_jsonb(NEW)->'description','start',to_jsonb(NEW)->'start_date','end',to_jsonb(NEW)->'end_date','type',to_jsonb(NEW)->'competition_type');
 IF old_setup IS DISTINCT FROM new_setup THEN
   IF OLD.official_rules_id IS NOT NULL AND NEW.official_rules_id IS NOT DISTINCT FROM OLD.official_rules_id THEN RAISE EXCEPTION 'OFFICIAL_SETUP_FROZEN'; END IF;
   NEW.competition_setup_revision:=OLD.competition_setup_revision+1;
   NEW.competition_input_revision:=OLD.competition_input_revision+1;
 ELSIF NEW.official_rules_id IS DISTINCT FROM OLD.official_rules_id THEN
   NEW.competition_input_revision:=OLD.competition_input_revision+1;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER competition_event_revision BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION competition_revision_event();

CREATE FUNCTION competition_revision_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row_data jsonb; v_event uuid; setup boolean; event_ids uuid[];
BEGIN
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_OP='UPDATE' AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NEW;END IF;
 setup:=TG_TABLE_NAME IN ('competition_rounds','competition_categories','competition_divisions','competition_criteria','competition_minor_criteria','competition_contestants','competition_round_criteria','competition_round_contestants','competition_judge_assignments','event_participants','users','organizations');
 IF TG_TABLE_NAME='users' THEN
   SELECT array_agg(DISTINCT ep.event_id ORDER BY ep.event_id) INTO event_ids FROM event_participants ep WHERE ep.user_id=(row_data->>'id')::uuid AND ep.participant_type='COMPETITION_JUDGE';
 ELSIF TG_TABLE_NAME='organizations' THEN
   SELECT array_agg(id ORDER BY id) INTO event_ids FROM events WHERE organization_id=(row_data->>'id')::uuid;
 ELSE
   v_event:=nullif(row_data->>'event_id','')::uuid;
   IF v_event IS NULL AND TG_TABLE_NAME IN ('competition_round_criteria','competition_round_contestants') THEN SELECT event_id INTO v_event FROM competition_rounds WHERE id=(row_data->>'round_id')::uuid;
   ELSIF v_event IS NULL AND TG_TABLE_NAME='competition_judge_assignments' THEN SELECT event_id INTO v_event FROM event_participants WHERE id=(row_data->>'participant_id')::uuid;END IF;
   event_ids:=ARRAY[v_event];
 END IF;
 FOREACH v_event IN ARRAY coalesce(event_ids,'{}'::uuid[]) LOOP
   -- This lock is shared with scoring, approval and publication transactions.
   PERFORM 1 FROM events WHERE id=v_event FOR UPDATE;
   UPDATE events SET competition_setup_revision=competition_setup_revision+CASE WHEN setup THEN 1 ELSE 0 END,
     competition_input_revision=competition_input_revision+1 WHERE id=v_event;
 END LOOP;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
DO $$ DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['competition_rounds','competition_categories','competition_divisions','competition_criteria','competition_minor_criteria','competition_contestants','competition_round_criteria','competition_round_contestants','competition_judge_assignments','event_participants','competition_round_submissions','competition_deductions','competition_eligibility_decisions','competition_advancement_decisions'] LOOP
   EXECUTE format('CREATE TRIGGER competition_source_revision BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION competition_revision_source()',tab);
 END LOOP;
END $$;
CREATE TRIGGER competition_account_revision BEFORE UPDATE OF account_status,role ON users FOR EACH ROW EXECUTE FUNCTION competition_revision_source();
CREATE TRIGGER competition_ownership_revision BEFORE UPDATE OF organizer_id ON organizations FOR EACH ROW EXECUTE FUNCTION competition_revision_source();
CREATE TRIGGER competition_session_revision BEFORE INSERT OR UPDATE OF rules_version,current_round_id ON competition_sessions FOR EACH ROW EXECUTE FUNCTION competition_revision_source();
CREATE TRIGGER competition_category_config_frozen BEFORE INSERT OR UPDATE OR DELETE ON competition_categories FOR EACH ROW EXECUTE FUNCTION competition_guard_frozen_setup();
CREATE TRIGGER competition_division_config_frozen BEFORE INSERT OR UPDATE OR DELETE ON competition_divisions FOR EACH ROW EXECUTE FUNCTION competition_guard_frozen_setup();

-- Preserve prior RPCs privately and strengthen their atomic validation.
ALTER FUNCTION competition_publish_rules(uuid,uuid,uuid,jsonb) RENAME TO competition_publish_rules_v099;
REVOKE ALL ON FUNCTION competition_publish_rules_v099(uuid,uuid,uuid,jsonb) FROM PUBLIC,service_role;
CREATE FUNCTION competition_publish_rules(p_event uuid,p_actor uuid,p_id uuid,p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE revision bigint;
BEGIN
 SELECT competition_setup_revision INTO revision FROM events WHERE id=p_event FOR UPDATE;
 IF NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN';END IF;
 IF p_snapshot->>'setupRevision' IS NULL OR (p_snapshot->>'setupRevision')::bigint IS DISTINCT FROM revision THEN RAISE EXCEPTION 'FULL_SETUP_CHANGED_REFRESH';END IF;
 RETURN competition_publish_rules_v099(p_event,p_actor,p_id,p_snapshot);
END; $$;
ALTER FUNCTION competition_result_transition(uuid,uuid,uuid,text,text,text) RENAME TO competition_result_transition_v099;
REVOKE ALL ON FUNCTION competition_result_transition_v099(uuid,uuid,uuid,text,text,text) FROM PUBLIC,service_role;
CREATE FUNCTION competition_result_transition(p_event uuid,p_actor uuid,p_calculation uuid,p_action text,p_digest text,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE revision bigint; c competition_result_calculations;
BEGIN
 SELECT competition_input_revision INTO revision FROM events WHERE id=p_event FOR UPDATE;
 SELECT * INTO c FROM competition_result_calculations WHERE id=p_calculation AND event_id=p_event FOR UPDATE;
 IF c.source_input_revision IS NULL OR c.source_input_revision IS DISTINCT FROM revision THEN RAISE EXCEPTION 'SOURCE_REVISION_CONFLICT: Recalculate and verify current inputs';END IF;
 RETURN competition_result_transition_v099(p_event,p_actor,p_calculation,p_action,p_digest,p_reason);
END; $$;
-- A calculation INSERT is an optimistic transaction boundary, not a claim that
-- multiple JS SELECTs formed a consistent database snapshot.
CREATE FUNCTION competition_guard_calculation_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE revision bigint;
BEGIN
 IF NEW.rules_version IS NULL THEN RETURN NEW;END IF;
 SELECT competition_input_revision INTO revision FROM events WHERE id=NEW.event_id FOR UPDATE;
 IF NEW.source_input_revision IS NULL OR NEW.source_input_revision IS DISTINCT FROM revision THEN RAISE EXCEPTION 'SOURCE_REVISION_CONFLICT';END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER competition_calculation_revision BEFORE INSERT ON competition_result_calculations FOR EACH ROW EXECUTE FUNCTION competition_guard_calculation_revision();
CREATE FUNCTION competition_guard_calculation_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.round_id IS DISTINCT FROM OLD.round_id OR NEW.source_digest IS DISTINCT FROM OLD.source_digest OR NEW.source_input_revision IS DISTINCT FROM OLD.source_input_revision THEN RAISE EXCEPTION 'CALCULATION_SOURCE_IDENTITY_IMMUTABLE';END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER competition_calculation_identity BEFORE UPDATE ON competition_result_calculations FOR EACH ROW EXECUTE FUNCTION competition_guard_calculation_identity();
ALTER FUNCTION competition_confirm_advancement(uuid,uuid,uuid,uuid,uuid,uuid[],text) RENAME TO competition_confirm_advancement_v099;
REVOKE ALL ON FUNCTION competition_confirm_advancement_v099(uuid,uuid,uuid,uuid,uuid,uuid[],text) FROM PUBLIC,service_role;
CREATE FUNCTION competition_confirm_advancement(p_event uuid,p_actor uuid,p_round uuid,p_next uuid,p_calculation uuid,p_qualifiers uuid[],p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE revision bigint; c competition_result_calculations;
BEGIN
 SELECT competition_input_revision INTO revision FROM events WHERE id=p_event FOR UPDATE;
 IF NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN';END IF;
 SELECT * INTO c FROM competition_result_calculations WHERE id=p_calculation AND event_id=p_event FOR UPDATE;
 IF c.source_input_revision IS NULL OR c.source_input_revision IS DISTINCT FROM revision THEN RAISE EXCEPTION 'SOURCE_REVISION_CONFLICT: Recalculate and verify before advancement';END IF;
 RETURN competition_confirm_advancement_v099(p_event,p_actor,p_round,p_next,p_calculation,p_qualifiers,p_reason);
END; $$;

CREATE FUNCTION competition_reorder_divisions(p_event uuid,p_actor uuid,p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM events WHERE id=p_event AND status='draft' AND official_rules_id IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'SETUP_FROZEN';END IF;
 IF p_ids IS NULL OR cardinality(p_ids)<>(SELECT count(*) FROM competition_divisions WHERE event_id=p_event) OR cardinality(p_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_ids) requested(id)) OR EXISTS(SELECT 1 FROM unnest(p_ids) requested(id) WHERE NOT EXISTS(SELECT 1 FROM competition_divisions d WHERE d.id=requested.id AND d.event_id=p_event)) THEN RAISE EXCEPTION 'INVALID_DIVISION_ORDER';END IF;
 UPDATE competition_divisions d SET display_order=x.n-1 FROM unnest(p_ids) WITH ORDINALITY x(id,n) WHERE d.id=x.id AND d.event_id=p_event;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.divisions.reorder','events',p_event,jsonb_build_object('divisionIds',p_ids));
 RETURN jsonb_build_object('success',true);
END; $$;
REVOKE ALL ON FUNCTION competition_check_relations(text,jsonb,jsonb),competition_publish_rules(uuid,uuid,uuid,jsonb),competition_result_transition(uuid,uuid,uuid,text,text,text),competition_reorder_divisions(uuid,uuid,uuid[]),competition_confirm_advancement(uuid,uuid,uuid,uuid,uuid,uuid[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_publish_rules(uuid,uuid,uuid,jsonb),competition_result_transition(uuid,uuid,uuid,text,text,text),competition_reorder_divisions(uuid,uuid,uuid[]),competition_confirm_advancement(uuid,uuid,uuid,uuid,uuid,uuid[],text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
