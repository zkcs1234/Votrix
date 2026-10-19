BEGIN;
CREATE FUNCTION competition_create_round_criterion(p_event uuid,p_actor uuid,p_round uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE criterion competition_criteria; total numeric;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event AND status='draft' AND official_rules_id IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'SETUP_FROZEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM competition_rounds WHERE id=p_round AND event_id=p_event) THEN RAISE EXCEPTION 'ROUND_FORBIDDEN'; END IF;
 SELECT coalesce(sum(c.percentage),0) INTO total FROM competition_criteria c JOIN competition_round_criteria rc ON rc.criteria_id=c.id WHERE rc.round_id=p_round AND c.is_active;
 IF (p_payload->>'percentage')::numeric<=0 OR total+(p_payload->>'percentage')::numeric>100.001 THEN RAISE EXCEPTION 'CRITERION_WEIGHT_BUDGET'; END IF;
 INSERT INTO competition_criteria(event_id,name,percentage,min_score,max_score,display_order) VALUES(p_event,p_payload->>'name',(p_payload->>'percentage')::numeric,(p_payload->>'minScore')::numeric,(p_payload->>'maxScore')::numeric,(SELECT coalesce(max(display_order),-1)+1 FROM competition_criteria WHERE event_id=p_event)) RETURNING * INTO criterion;
 INSERT INTO competition_round_criteria(round_id,criteria_id) VALUES(p_round,criterion.id);
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.criterion.create','competition_criteria',criterion.id,jsonb_build_object('roundId',p_round));
 RETURN to_jsonb(criterion);
END; $$;
REVOKE ALL ON FUNCTION competition_create_round_criterion(uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_create_round_criterion(uuid,uuid,uuid,jsonb) TO service_role;

CREATE FUNCTION competition_guard_frozen_setup() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_event uuid; official uuid;
BEGIN
 IF TG_TABLE_NAME IN('competition_round_criteria','competition_round_contestants') THEN
   SELECT r.event_id INTO v_event FROM competition_rounds r WHERE id=coalesce(NEW.round_id,OLD.round_id);
 ELSIF TG_TABLE_NAME='competition_judge_assignments' THEN
   SELECT ep.event_id INTO v_event FROM event_participants ep WHERE ep.id=coalesce(NEW.participant_id,OLD.participant_id);
 ELSE v_event:=coalesce(NEW.event_id,OLD.event_id); END IF;
 SELECT official_rules_id INTO official FROM events WHERE id=v_event FOR UPDATE;
 IF official IS NOT NULL AND current_setting('votrix.authorized_operation',true) IS DISTINCT FROM 'advancement' THEN RAISE EXCEPTION 'OFFICIAL_SETUP_FROZEN'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
-- Operational round finalized_at is separate from configuration; do not guard
-- that timestamp with the setup trigger.
CREATE TRIGGER competition_round_config_frozen BEFORE INSERT OR DELETE OR UPDATE OF name,weight,display_order,workflow ON competition_rounds FOR EACH ROW EXECUTE FUNCTION competition_guard_frozen_setup();
CREATE TRIGGER competition_parent_config_frozen BEFORE INSERT OR UPDATE OR DELETE ON competition_criteria FOR EACH ROW EXECUTE FUNCTION competition_guard_frozen_setup();
CREATE TRIGGER competition_minor_config_frozen BEFORE INSERT OR UPDATE OR DELETE ON competition_minor_criteria FOR EACH ROW EXECUTE FUNCTION competition_guard_frozen_setup();
CREATE TRIGGER competition_roster_frozen BEFORE INSERT OR UPDATE OR DELETE ON competition_round_contestants FOR EACH ROW EXECUTE FUNCTION competition_guard_frozen_setup();
CREATE TRIGGER competition_criteria_membership_frozen BEFORE INSERT OR UPDATE OR DELETE ON competition_round_criteria FOR EACH ROW EXECUTE FUNCTION competition_guard_frozen_setup();
CREATE TRIGGER competition_assignments_frozen BEFORE INSERT OR UPDATE OR DELETE ON competition_judge_assignments FOR EACH ROW EXECUTE FUNCTION competition_guard_frozen_setup();
COMMIT;
