-- Compatibility with the complete foundation: event_participants has a scope column.
-- Rename only the local PL/pgSQL variable; validation, snapshots and ACLs are retained.
BEGIN;
CREATE OR REPLACE FUNCTION competition_freeze_native_rules(p_event uuid,p_competition uuid,p_actor uuid,p_setup bigint,p_input bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; config jsonb; rule competition_child_rule_versions; v_round_scope uuid; panel integer;
BEGIN
 c:=competition_native_authority(p_event,p_competition,p_actor,true);
 IF p_setup IS DISTINCT FROM c.setup_revision OR p_input IS DISTINCT FROM c.input_revision THEN RAISE EXCEPTION 'CHILD_REVISION_CONFLICT'; END IF;
 SELECT configuration INTO config FROM competition_child_configurations WHERE competition_id=c.id;
 PERFORM competition_validate_native_configuration(p_event,c.id,config,true);
 IF NOT EXISTS(SELECT 1 FROM competition_entries WHERE competition_id=c.id) THEN RAISE EXCEPTION 'CHILD_ENTRIES_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id JOIN users u ON u.id=ep.user_id WHERE a.competition_id=c.id AND (ep.event_id IS DISTINCT FROM p_event OR ep.participant_type::text IS DISTINCT FROM 'COMPETITION_JUDGE' OR ep.is_active IS DISTINCT FROM true OR coalesce(ep.judge_role::text,'') NOT IN('judge','head_judge') OR u.account_status::text IS DISTINCT FROM 'active' OR u.role::text NOT IN('participant','voter'))) THEN RAISE EXCEPTION 'INACTIVE_CHILD_JUDGE_REQUIRES_REVIEW'; END IF;
 FOR v_round_scope IN SELECT id FROM competition_child_rounds WHERE competition_id=c.id UNION ALL SELECT NULL::uuid WHERE config->>'structure'='single' LOOP
 SELECT count(DISTINCT ep.user_id) INTO panel FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id JOIN users u ON u.id=ep.user_id WHERE a.competition_id=c.id AND (a.round_id IS NULL OR a.round_id=v_round_scope) AND ep.event_id=p_event AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.is_active AND ep.judge_role::text IN('judge','head_judge') AND u.account_status::text='active' AND u.role::text IN('participant','voter');
 IF panel=0 THEN RAISE EXCEPTION 'EXPLICIT_CHILD_JUDGES_REQUIRED'; END IF;
 IF config->'scoringConfig'->>'calculationMethod'='lowest_removal' AND panel<=coalesce((config->'scoringConfig'->>'dropLowest')::integer,0)+coalesce((config->'scoringConfig'->>'dropHighest')::integer,0) THEN RAISE EXCEPTION 'REMOVAL_EXHAUSTS_CHILD_PANEL'; END IF;
 END LOOP;
 -- Sum/carry arithmetic is only compatible when the explicit judge panels
 -- match across rounds. Different panels require a future normalization rule.
 IF config->'scoringConfig'->>'calculationMethod'='sum' AND EXISTS(SELECT 1 FROM jsonb_array_elements(config->'rounds') r WHERE coalesce(r->>'progression','back_to_zero')<>'back_to_zero') AND
 (SELECT count(DISTINCT panels.panel) FROM (SELECT r.id,coalesce(string_agg(DISTINCT a.participant_id::text,',' ORDER BY a.participant_id::text),'') AS panel FROM competition_child_rounds r LEFT JOIN competition_child_judge_assignments a ON a.competition_id=c.id AND (a.round_id IS NULL OR a.round_id=r.id) WHERE r.competition_id=c.id GROUP BY r.id) panels)>1 THEN RAISE EXCEPTION 'SUM_CARRY_REQUIRES_COMPATIBLE_PANELS'; END IF;
 INSERT INTO competition_child_rule_versions(competition_id,event_id,version,setup_revision,input_revision,configuration_snapshot,assignment_snapshot,participation_snapshot,frozen_by)
 VALUES(c.id,p_event,coalesce((SELECT max(version)+1 FROM competition_child_rule_versions WHERE competition_id=c.id),1),c.setup_revision,c.input_revision,config,
 (SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('judgeId',ep.user_id,'judgeRole',ep.judge_role) ORDER BY a.id) FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id WHERE a.competition_id=c.id),
 (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM competition_entries e WHERE competition_id=c.id),p_actor) RETURNING * INTO rule;
 UPDATE competitions SET official_child_rules_id=rule.id WHERE id=c.id;
 RETURN to_jsonb(rule);
END $$;
REVOKE ALL ON FUNCTION competition_freeze_native_rules(uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION competition_freeze_native_rules(uuid,uuid,uuid,bigint,bigint) TO service_role;
CREATE OR REPLACE FUNCTION competition_child_scoring_choices(p_event uuid,p_actor uuid,p_owner boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; cfg jsonb; v_round_scope uuid; result jsonb:='[]'; context jsonb;
BEGIN
 IF p_owner AND (NOT competition_owns_event(p_event,p_actor) OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role::text='organizer' AND account_status::text='active')) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
 FOR c IN SELECT * FROM competitions WHERE event_id=p_event AND origin='native' ORDER BY name,id LOOP
  SELECT configuration INTO cfg FROM competition_child_configurations WHERE competition_id=c.id;
  FOR v_round_scope IN SELECT (r->>'id')::uuid FROM jsonb_array_elements(coalesce(cfg->'rounds','[]')) r UNION ALL SELECT NULL::uuid WHERE cfg->>'structure'='single' LOOP
   IF p_owner OR EXISTS(SELECT 1 FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id JOIN users u ON u.id=ep.user_id WHERE a.competition_id=c.id AND (a.round_id IS NULL OR a.round_id=v_round_scope) AND ep.user_id=p_actor AND ep.event_id=p_event AND ep.is_active AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.judge_role::text IN('judge','head_judge') AND u.role::text IN('voter','participant') AND u.account_status::text='active') THEN
    result:=result||jsonb_build_array(jsonb_build_object('competitionId',c.id,'competitionName',c.name,'roundId',v_round_scope,'roundName',coalesce((SELECT r->>'name' FROM jsonb_array_elements(cfg->'rounds') r WHERE r->>'id'=v_round_scope::text),'Single phase')));
   END IF;
  END LOOP;
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION competition_child_scoring_choices(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION competition_child_scoring_choices(uuid,uuid,boolean) TO service_role;
COMMIT;
