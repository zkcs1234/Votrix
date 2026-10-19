BEGIN;

-- Compare validated sources while holding the same event lock used by setup
-- triggers. Readiness rules remain in shared/competition-criteria-readiness.js.
-- This function only detects a source change between validation and publication.
CREATE FUNCTION competition_criteria_source(p_event uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT jsonb_build_object(
   'rounds', coalesce((SELECT jsonb_agg(jsonb_build_object(
     'id',r.id,'name',r.name,'displayOrder',coalesce(r.display_order,0),
     'criteriaIds',coalesce((SELECT jsonb_agg(rc.criteria_id ORDER BY rc.criteria_id)
       FROM competition_round_criteria rc WHERE rc.round_id=r.id),'[]'::jsonb)
   ) ORDER BY r.id) FROM competition_rounds r WHERE r.event_id=p_event),'[]'::jsonb),
   'criteria',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'id',c.id,'name',c.name,'isActive',coalesce(c.is_active,true),
     'percentage',c.percentage,'minScore',c.min_score,'maxScore',c.max_score
   ) ORDER BY c.id) FROM competition_criteria c WHERE c.event_id=p_event),'[]'::jsonb),
   'minors',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'id',m.id,'criteriaId',m.criteria_id,'name',m.name,'isActive',coalesce(m.is_active,true),
     'scoreType',m.score_type,'customMin',m.custom_min,'customMax',m.custom_max
   ) ORDER BY m.id) FROM competition_minor_criteria m WHERE m.event_id=p_event),'[]'::jsonb)
 );
$$;
REVOKE ALL ON FUNCTION competition_criteria_source(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_criteria_source(uuid) TO service_role;

CREATE OR REPLACE FUNCTION competition_publish_rules(p_event uuid,p_actor uuid,p_id uuid,p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e events; v integer;
BEGIN
 SELECT * INTO e FROM events WHERE id=p_event FOR UPDATE;
 IF NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
 IF e.status<>'draft' OR e.official_rules_id IS NOT NULL THEN RAISE EXCEPTION 'RULES_ALREADY_FROZEN'; END IF;
 IF p_snapshot->'criteriaSource' IS NULL OR p_snapshot->'criteriaSource' IS DISTINCT FROM competition_criteria_source(p_event) THEN
   RAISE EXCEPTION 'CRITERIA_SETUP_CHANGED_REFRESH: Reload saved criteria before publishing';
 END IF;
 IF NOT coalesce((p_snapshot->'scoringConfig'->>'confirmed')::boolean,false) OR p_snapshot->'scoringConfig'->>'calculationMethod'='undecided' THEN RAISE EXCEPTION 'RULES_NOT_CONFIRMED'; END IF;
 SELECT coalesce(max(version),0)+1 INTO v FROM competition_rule_versions WHERE event_id=p_event;
 INSERT INTO competition_rule_versions(id,event_id,version,snapshot,acknowledged_by) VALUES(p_id,p_event,v,p_snapshot,p_actor);
 UPDATE events SET official_rules_id=p_id,status='scheduled',competition_lifecycle='published_setup' WHERE id=p_event;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.rules.confirm','competition_rule_versions',p_id,jsonb_build_object('version',v));
 RETURN jsonb_build_object('id',p_id,'version',v,'status','scheduled');
END; $$;
REVOKE ALL ON FUNCTION competition_publish_rules(uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_publish_rules(uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
