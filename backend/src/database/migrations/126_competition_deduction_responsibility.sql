-- Native deduction ownership. No historical rules, decisions, submissions or
-- finalized results are rewritten. Apply only after 123/124; 125 is independent.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN
 IF to_regprocedure('public.competition_child_native_deductions_enabled(jsonb,uuid)') IS NULL
 OR to_regprocedure('public.competition_child_score_write(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL
 OR to_regprocedure('public.competition_child_public_projection(uuid)') IS NULL
 OR position('evidence-''policy''' IN regexp_replace(pg_get_functiondef('public.competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean)'::regprocedure),'\s','','g'))=0
 THEN RAISE EXCEPTION 'MIGRATIONS_123_AND_124_REQUIRED'; END IF;
END $$;

ALTER TABLE competition_child_score_drafts ADD COLUMN IF NOT EXISTS deductions jsonb NOT NULL DEFAULT '[]'::jsonb;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='competition_child_score_drafts'::regclass AND conname='competition_child_deductions_array') THEN
  ALTER TABLE competition_child_score_drafts ADD CONSTRAINT competition_child_deductions_array CHECK(jsonb_typeof(deductions)='array');
 END IF;
END $$;

CREATE OR REPLACE FUNCTION competition_deduction_mode(cfg jsonb,scope uuid) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce((SELECT r->>'deductionMode' FROM jsonb_array_elements(coalesce(cfg->'rounds','[]')) r WHERE r->>'id'=scope::text),cfg->'scoringConfig'->>'deductionMode',CASE WHEN jsonb_array_length(coalesce(cfg->'scoringConfig'->'deductionRules','[]'))>0 THEN 'organizer' ELSE 'none' END)
$$;
CREATE OR REPLACE FUNCTION competition_deduction_rule_round(cfg jsonb,rule jsonb) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(nullif(rule->>'roundId','')::uuid,(SELECT nullif(c->>'roundId','')::uuid FROM jsonb_array_elements(coalesce(cfg->'criteria','[]')) c WHERE c->>'id'=rule->>'criteriaId'))
$$;
CREATE OR REPLACE FUNCTION competition_deduction_rules(cfg jsonb,scope uuid,owner_role text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(rule||jsonb_build_object('anchorCriterionId',coalesce(rule->>'criteriaId',(SELECT c->>'id' FROM jsonb_array_elements(coalesce(cfg->'criteria','[]')) WITH ORDINALITY item(c,n) WHERE (c->>'roundId')::uuid IS NOT DISTINCT FROM scope ORDER BY n LIMIT 1)))),'[]')
 FROM jsonb_array_elements(coalesce(cfg->'scoringConfig'->'deductionRules','[]')) rule
 WHERE coalesce(rule->>'appliedBy','organizer')=owner_role
 AND (NOT (cfg->'scoringConfig' ? 'deductionMode' OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(cfg->'rounds','[]')) r WHERE r ? 'deductionMode')) OR competition_deduction_mode(cfg,scope)=owner_role)
 AND (competition_deduction_rule_round(cfg,rule)=scope OR competition_deduction_rule_round(cfg,rule) IS NULL AND ((cfg->>'structure'='single' AND scope IS NULL) OR cfg->>'structure'='multiple' AND scope::text=cfg->'rounds'->-1->>'id'))
$$;

-- Keep the original validator/scoring implementations as private delegates.
DO $$ BEGIN
 IF to_regprocedure('competition_validate_native_configuration_v126(uuid,uuid,jsonb,boolean)') IS NULL THEN ALTER FUNCTION competition_validate_native_configuration(uuid,uuid,jsonb,boolean) RENAME TO competition_validate_native_configuration_v126; END IF;
 IF to_regprocedure('competition_child_score_write_v126(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL THEN ALTER FUNCTION competition_child_score_write(uuid,uuid,uuid,uuid,text,jsonb) RENAME TO competition_child_score_write_v126; END IF;
 IF to_regprocedure('competition_child_live_view_v126(uuid,uuid,uuid,uuid,boolean)') IS NULL THEN ALTER FUNCTION competition_child_live_view(uuid,uuid,uuid,uuid,boolean) RENAME TO competition_child_live_view_v126; END IF;
 IF to_regprocedure('competition_child_deduction_action_v126(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL THEN ALTER FUNCTION competition_child_deduction_action(uuid,uuid,uuid,uuid,text,jsonb) RENAME TO competition_child_deduction_action_v126; END IF;
 IF to_regprocedure('competition_child_native_deductions_enabled_v126(jsonb,uuid)') IS NULL THEN ALTER FUNCTION competition_child_native_deductions_enabled(jsonb,uuid) RENAME TO competition_child_native_deductions_enabled_v126; END IF;
 IF to_regprocedure('competition_child_public_projection_v126(uuid)') IS NULL THEN ALTER FUNCTION competition_child_public_projection(uuid) RENAME TO competition_child_public_projection_v126; END IF;
END $$;

CREATE OR REPLACE FUNCTION competition_validate_native_configuration(p_event uuid,p_competition uuid,p_config jsonb,p_complete boolean)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE clean jsonb; r jsonb; rule jsonb; scope uuid; method text; owner_role text; modern boolean; occurrences numeric;
BEGIN
 modern:=p_config->'scoringConfig' ? 'deductionMode' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') item WHERE item ? 'deductionMode');
 IF NOT modern THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p_config->'scoringConfig'->'deductionRules','[]')) item WHERE item ? 'appliedBy') THEN RAISE EXCEPTION 'DEDUCTION_MODE_REQUIRED'; END IF;
  PERFORM competition_validate_native_configuration_v126(p_event,p_competition,p_config,p_complete);RETURN;
 END IF;
 clean:=jsonb_set(p_config,'{scoringConfig}',((p_config->'scoringConfig')-'deductionMode')||jsonb_build_object('deductionRules','[]'::jsonb));
 clean:=jsonb_set(clean,'{rounds}',coalesce((SELECT jsonb_agg(item-'deductionMode' ORDER BY n) FROM jsonb_array_elements(p_config->'rounds') WITH ORDINALITY rows(item,n)),'[]'));
 PERFORM competition_validate_native_configuration_v126(p_event,p_competition,clean,p_complete);
 IF p_config->'scoringConfig' ? 'deductionMode' AND (jsonb_typeof(p_config->'scoringConfig'->'deductionMode') IS DISTINCT FROM 'string' OR p_config->'scoringConfig'->>'deductionMode' NOT IN('none','organizer','judge')) THEN RAISE EXCEPTION 'INVALID_DEDUCTION_MODE'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_config->'rounds') LOOP
  IF r->>'deductionMode' IS NOT NULL AND r->>'deductionMode' NOT IN('none','organizer','judge') THEN RAISE EXCEPTION 'INVALID_DEDUCTION_MODE'; END IF;
 END LOOP;
 IF jsonb_typeof(coalesce(p_config->'scoringConfig'->'deductionRules','[]')) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(p_config->'scoringConfig'->'deductionRules','[]'))>100 THEN RAISE EXCEPTION 'INVALID_DEDUCTION_RULES'; END IF;
 FOR rule IN SELECT value FROM jsonb_array_elements(coalesce(p_config->'scoringConfig'->'deductionRules','[]')) LOOP
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(rule) k WHERE k NOT IN('id','description','amount','units','roundId','criteriaId','appliedBy','perViolation','maxOccurrences')) THEN RAISE EXCEPTION 'UNSUPPORTED_DEDUCTION_FIELD'; END IF;
  scope:=competition_deduction_rule_round(p_config,rule);
  owner_role:=rule->>'appliedBy';
  IF owner_role IS NULL THEN RAISE EXCEPTION 'EXPLICIT_DEDUCTION_OWNER_REQUIRED'; END IF;
  IF rule ? 'appliedBy' AND jsonb_typeof(rule->'appliedBy') IS DISTINCT FROM 'string' OR owner_role NOT IN('organizer','judge') OR competition_deduction_mode(p_config,coalesce(scope,(p_config->'rounds'->-1->>'id')::uuid))<>owner_role THEN RAISE EXCEPTION 'DEDUCTION_OWNERSHIP_CONFLICT'; END IF;
  method:=coalesce((SELECT item->>'calculationMethod' FROM jsonb_array_elements(p_config->'rounds') item WHERE item->>'id'=coalesce(scope::text,p_config->'rounds'->-1->>'id')),p_config->'scoringConfig'->>'calculationMethod');
  IF jsonb_typeof(rule->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(rule->'description') IS DISTINCT FROM 'string' OR length(btrim(coalesce(rule->>'id','')))=0 OR length(rule->>'id')>200 OR length(btrim(coalesce(rule->>'description','')))=0 OR length(rule->>'description')>200 OR jsonb_typeof(rule->'amount') IS DISTINCT FROM 'number' OR (rule->>'amount')::numeric<=0 OR (rule->>'amount')::numeric>1000000 OR method='manual' OR rule->>'units' IS NULL OR rule->>'units' NOT IN('points','placements') OR rule->>'units'='placements' AND (method<>'rank_based' OR rule->>'criteriaId' IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_DEDUCTION_RULE'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_config->'scoringConfig'->'deductionRules') item WHERE item->>'id'=rule->>'id')<>1 THEN RAISE EXCEPTION 'DUPLICATE_DEDUCTION_RULE'; END IF;
  IF rule->>'roundId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') item WHERE item->>'id'=rule->>'roundId') THEN RAISE EXCEPTION 'DEDUCTION_ROUND_FORBIDDEN'; END IF;
  IF rule->>'criteriaId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'criteria') item WHERE item->>'id'=rule->>'criteriaId' AND (rule->>'roundId' IS NULL OR item->>'roundId'=rule->>'roundId')) THEN RAISE EXCEPTION 'DEDUCTION_CRITERION_FORBIDDEN'; END IF;
  occurrences:=coalesce((rule->>'maxOccurrences')::numeric,1);
  IF rule ? 'perViolation' AND jsonb_typeof(rule->'perViolation') IS DISTINCT FROM 'boolean' OR rule ? 'maxOccurrences' AND jsonb_typeof(rule->'maxOccurrences') IS DISTINCT FROM 'number' OR occurrences<>trunc(occurrences) OR occurrences NOT BETWEEN 1 AND 100 OR NOT coalesce((rule->>'perViolation')::boolean,false) AND occurrences<>1 THEN RAISE EXCEPTION 'INVALID_DEDUCTION_LIMIT'; END IF;
  IF p_config->'scoringConfig' ? 'numericCarryBasis' AND rule->>'units'='placements' AND scope IS NOT NULL AND scope::text IS DISTINCT FROM p_config->'rounds'->-1->>'id' THEN RAISE EXCEPTION 'PLACEMENT_CARRY_FORBIDDEN'; END IF;
  IF owner_role='judge' AND scope IS NULL AND p_config->>'structure'='multiple' AND coalesce(p_config->'rounds'->-1->>'progression','back_to_zero')<>'back_to_zero' AND coalesce(p_config->'scoringConfig'->>'numericCarryBasis','')<>'weighted_judge_average' THEN RAISE EXCEPTION 'USE_ROUND_SCOPE_FOR_COMBINED_NUMERIC_JUDGE_DEDUCTIONS'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'scoringConfig'->'deductionRules') other_rule WHERE other_rule->>'id'<>rule->>'id' AND lower(btrim(other_rule->>'description'))=lower(btrim(rule->>'description')) AND coalesce(other_rule->>'appliedBy','organizer')=owner_role AND coalesce(competition_deduction_rule_round(p_config,other_rule),(p_config->'rounds'->-1->>'id')::uuid) IS NOT DISTINCT FROM coalesce(scope,(p_config->'rounds'->-1->>'id')::uuid) AND (other_rule->>'criteriaId' IS NULL OR rule->>'criteriaId' IS NULL OR other_rule->>'criteriaId'=rule->>'criteriaId')) THEN RAISE EXCEPTION 'OVERLAPPING_DEDUCTION_RULES'; END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION competition_child_native_deductions_enabled(cfg jsonb,p_round uuid) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE target jsonb; scope jsonb;
BEGIN
 IF NOT (cfg->'scoringConfig' ? 'deductionMode' OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(cfg->'rounds','[]')) r WHERE r ? 'deductionMode')) THEN RETURN competition_child_native_deductions_enabled_v126(cfg,p_round); END IF;
 IF jsonb_array_length(competition_deduction_rules(cfg,p_round,'organizer'))>0 THEN RETURN true; END IF;
 SELECT value INTO target FROM jsonb_array_elements(coalesce(cfg->'rounds','[]')) WHERE value->>'id'=p_round::text;
 IF target->>'progression'='carry_forward' OR target->>'progression'='weighted' AND target->>'id'=cfg->'rounds'->-1->>'id' THEN
  FOR scope IN SELECT value FROM jsonb_array_elements(cfg->'rounds') WHERE (value->>'displayOrder')::integer<=(target->>'displayOrder')::integer LOOP
   IF jsonb_array_length(competition_deduction_rules(cfg,(scope->>'id')::uuid,'organizer'))>0 THEN RETURN true; END IF;
  END LOOP;
 END IF;
 RETURN false;
END $$;

CREATE OR REPLACE FUNCTION competition_child_live_view(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_owner boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; cfg jsonb;
BEGIN
 result:=competition_child_live_view_v126(p_event,p_competition,p_actor,p_round,p_owner);
 SELECT v.configuration_snapshot INTO cfg FROM competitions c JOIN competition_child_rule_versions v ON v.id=c.official_child_rules_id WHERE c.id=p_competition AND c.event_id=p_event;
 RETURN result||jsonb_build_object('deductionSettings',jsonb_build_object('mode',competition_deduction_mode(cfg,p_round),'rules',competition_deduction_rules(cfg,p_round,'judge'),'configuration',cfg));
END $$;

CREATE OR REPLACE FUNCTION competition_child_score_write(p_event uuid,p_competition uuid,p_judge uuid,p_round uuid,p_action text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; cfg jsonb; incoming jsonb; saved jsonb; allowed jsonb; record jsonb; rule jsonb; previous_receipt boolean; entry_locked boolean; expected_anchor uuid; limit_count integer;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 PERFORM 1 FROM competitions WHERE id=p_competition AND event_id=p_event FOR UPDATE;
 previous_receipt:=EXISTS(SELECT 1 FROM competition_child_scoring_audit WHERE session_id=(p_body->>'sessionId')::uuid AND actor_id=p_judge AND request_id=(p_body->>'requestId')::uuid);
 SELECT deductions INTO saved FROM competition_child_score_drafts WHERE session_id=(p_body->>'sessionId')::uuid AND judge_id=p_judge AND entry_id=(p_body->>'entryId')::uuid AND criterion_id=(p_body->>'criterionId')::uuid;
 entry_locked:=EXISTS(SELECT 1 FROM competition_child_score_drafts WHERE session_id=(p_body->>'sessionId')::uuid AND judge_id=p_judge AND entry_id=(p_body->>'entryId')::uuid AND locked);
 result:=competition_child_score_write_v126(p_event,p_competition,p_judge,p_round,p_action,p_body);
 IF previous_receipt OR p_action NOT IN('draft','lock') THEN RETURN result; END IF;
 incoming:=coalesce(p_body->'deductions',saved,'[]'::jsonb);
 IF jsonb_typeof(incoming) IS DISTINCT FROM 'array' OR jsonb_array_length(incoming)>10000 THEN RAISE EXCEPTION 'INVALID_JUDGE_DEDUCTIONS'; END IF;
 SELECT v.configuration_snapshot INTO cfg FROM competition_child_sessions s JOIN competition_child_rule_versions v ON v.id=s.rules_version WHERE s.id=(p_body->>'sessionId')::uuid;
 allowed:=competition_deduction_rules(cfg,p_round,'judge');
 FOR record IN SELECT value FROM jsonb_array_elements(incoming) LOOP
  IF jsonb_typeof(record) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(record) k WHERE k NOT IN('id','ruleId','offenseKey','reason')) OR record->>'id' IS NULL OR (record->>'id')::uuid IS NULL OR length(btrim(coalesce(record->>'offenseKey','')))=0 OR length(record->>'offenseKey')>200 OR length(btrim(coalesce(record->>'reason','')))<5 OR length(record->>'reason')>2000 THEN RAISE EXCEPTION 'DEDUCTION_REASON_AND_REFERENCE_REQUIRED'; END IF;
  SELECT value INTO rule FROM jsonb_array_elements(allowed) WHERE value->>'id'=record->>'ruleId';
  expected_anchor:=(rule->>'anchorCriterionId')::uuid;
  IF rule IS NULL OR expected_anchor IS DISTINCT FROM (p_body->>'criterionId')::uuid THEN RAISE EXCEPTION 'JUDGE_DEDUCTION_SCOPE_FORBIDDEN'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(incoming) item WHERE item->>'id'=record->>'id')<>1 OR (SELECT count(*) FROM jsonb_array_elements(incoming) item WHERE item->>'ruleId'=record->>'ruleId' AND lower(btrim(item->>'offenseKey'))=lower(btrim(record->>'offenseKey')))<>1 THEN RAISE EXCEPTION 'DUPLICATE_JUDGE_DEDUCTION'; END IF;
  IF EXISTS(SELECT 1 FROM competition_child_score_drafts d JOIN competition_child_sessions s ON s.id=d.session_id CROSS JOIN LATERAL jsonb_array_elements(d.deductions) item WHERE s.competition_id=p_competition AND (d.session_id IS DISTINCT FROM (p_body->>'sessionId')::uuid OR d.judge_id IS DISTINCT FROM p_judge OR d.entry_id IS DISTINCT FROM (p_body->>'entryId')::uuid OR d.criterion_id IS DISTINCT FROM (p_body->>'criterionId')::uuid) AND item->>'id'=record->>'id') THEN RAISE EXCEPTION 'DUPLICATE_JUDGE_DEDUCTION'; END IF;
  limit_count:=CASE WHEN coalesce((rule->>'perViolation')::boolean,false) THEN coalesce((rule->>'maxOccurrences')::integer,1) ELSE 1 END;
  IF (SELECT count(*) FROM jsonb_array_elements(incoming) item WHERE item->>'ruleId'=record->>'ruleId')>limit_count THEN RAISE EXCEPTION 'JUDGE_DEDUCTION_LIMIT_EXCEEDED'; END IF;
 END LOOP;
 -- Entry-wide deductions stop changing as soon as any criterion is locked.
 IF entry_locked AND (SELECT coalesce(jsonb_agg(item ORDER BY item->>'id'),'[]') FROM jsonb_array_elements(incoming) item WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(allowed) r WHERE r->>'id'=item->>'ruleId' AND r->>'criteriaId' IS NULL)) IS DISTINCT FROM (SELECT coalesce(jsonb_agg(item ORDER BY item->>'id'),'[]') FROM jsonb_array_elements(coalesce(saved,'[]')) item WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(allowed) r WHERE r->>'id'=item->>'ruleId' AND r->>'criteriaId' IS NULL)) THEN RAISE EXCEPTION 'ENTRY_DEDUCTIONS_LOCKED'; END IF;
 UPDATE competition_child_score_drafts SET deductions=incoming WHERE session_id=(p_body->>'sessionId')::uuid AND judge_id=p_judge AND entry_id=(p_body->>'entryId')::uuid AND criterion_id=(p_body->>'criterionId')::uuid;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION competition_child_deduction_action(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_action text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; state jsonb; rule jsonb; decision competition_child_deduction_decisions; last_action text; count_active integer; limit_count integer;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 PERFORM 1 FROM competitions WHERE id=p_competition AND event_id=p_event FOR UPDATE;
 IF p_action='propose' THEN
  PERFORM competition_native_authority(p_event,p_competition,p_actor,false);
  state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,p_round,false);
  SELECT value INTO rule FROM jsonb_array_elements(competition_deduction_rules(state->'rules'->'configuration_snapshot',p_round,'organizer')) WHERE value->>'id'=p_body->>'ruleKey';
  IF rule IS NULL THEN RAISE EXCEPTION 'ORGANIZER_DEDUCTION_SCOPE_FORBIDDEN'; END IF;
  IF rule->>'appliedBy'='organizer' THEN
   IF length(coalesce(p_body->>'offenseKey',''))>200 OR length(coalesce(p_body->>'reason',''))>2000 THEN RAISE EXCEPTION 'DEDUCTION_DETAILS_TOO_LONG'; END IF;
   IF EXISTS(SELECT 1 FROM competition_child_deduction_decisions WHERE session_id=(state->'session'->>'id')::uuid AND entry_id=(p_body->>'entryId')::uuid AND rule_key=rule->>'id' AND lower(btrim(offense_key))=lower(btrim(p_body->>'offenseKey'))) THEN RAISE EXCEPTION 'DUPLICATE_ORGANIZER_DEDUCTION'; END IF;
   limit_count:=CASE WHEN coalesce((rule->>'perViolation')::boolean,false) THEN coalesce((rule->>'maxOccurrences')::integer,1) ELSE 1 END;
   SELECT count(*) INTO count_active FROM competition_child_deduction_decisions d LEFT JOIN LATERAL(SELECT action FROM competition_child_deduction_reviews WHERE decision_id=d.id ORDER BY version DESC LIMIT 1) review ON true WHERE d.session_id=(state->'session'->>'id')::uuid AND d.entry_id=(p_body->>'entryId')::uuid AND d.rule_key=rule->>'id' AND coalesce(review.action,'pending') IN('pending','approve');
   IF count_active>=limit_count THEN RAISE EXCEPTION 'ORGANIZER_DEDUCTION_LIMIT_EXCEEDED'; END IF;
  END IF;
  result:=competition_child_deduction_action_v126(p_event,p_competition,p_actor,p_round,p_action,p_body);
  IF rule->>'appliedBy'='organizer' THEN
   INSERT INTO competition_child_deduction_reviews(decision_id,action,reason,actor_id,version) VALUES((result->>'decisionId')::uuid,'approve',p_body->>'reason',p_actor,1);
   result:=result||jsonb_build_object('appliedDirectly',true);
  END IF;
  RETURN result;
 END IF;
 SELECT d.* INTO decision FROM competition_child_deduction_decisions d JOIN competition_child_sessions s ON s.id=d.session_id WHERE d.id=(p_body->>'decisionId')::uuid AND s.event_id=p_event AND s.competition_id=p_competition AND s.round_id IS NOT DISTINCT FROM p_round;
 IF decision.rule_snapshot->>'appliedBy'='organizer' THEN
  PERFORM competition_native_authority(p_event,p_competition,p_actor,false);
  SELECT action INTO last_action FROM competition_child_deduction_reviews WHERE decision_id=decision.id ORDER BY version DESC LIMIT 1;
  IF p_action<>'revoke' OR decision.proposed_by<>p_actor OR last_action IS DISTINCT FROM 'approve' OR length(btrim(coalesce(p_body->>'reason','')))<5 THEN RAISE EXCEPTION 'ORGANIZER_DEDUCTION_REVERSAL_FORBIDDEN'; END IF;
  INSERT INTO competition_child_deduction_reviews(decision_id,action,reason,actor_id,version) SELECT decision.id,'revoke',p_body->>'reason',p_actor,max(version)+1 FROM competition_child_deduction_reviews WHERE decision_id=decision.id;
  RETURN jsonb_build_object('decisionId',decision.id,'action','revoke');
 END IF;
 RETURN competition_child_deduction_action_v126(p_event,p_competition,p_actor,p_round,p_action,p_body);
END $$;

CREATE OR REPLACE FUNCTION competition_child_public_projection(p_calculation uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE projection jsonb; calc competition_child_calculations; cfg jsonb; target jsonb; scope jsonb; judges_enabled boolean:=false;
BEGIN
 projection:=competition_child_public_projection_v126(p_calculation);
 SELECT * INTO calc FROM competition_child_calculations WHERE id=p_calculation;
 cfg:=calc.source_snapshot->'rules'->'configuration_snapshot';
 IF NOT (cfg->'scoringConfig' ? 'deductionMode' OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(cfg->'rounds','[]')) r WHERE r ? 'deductionMode')) THEN RETURN projection; END IF;
 judges_enabled:=jsonb_array_length(competition_deduction_rules(cfg,calc.round_id,'judge'))>0;
 SELECT value INTO target FROM jsonb_array_elements(coalesce(cfg->'rounds','[]')) WHERE value->>'id'=calc.round_id::text;
 IF target->>'progression'='carry_forward' OR target->>'progression'='weighted' AND target->>'id'=cfg->'rounds'->-1->>'id' THEN
  FOR scope IN SELECT value FROM jsonb_array_elements(cfg->'rounds') WHERE (value->>'displayOrder')::integer<=(target->>'displayOrder')::integer LOOP
   judges_enabled:=judges_enabled OR jsonb_array_length(competition_deduction_rules(cfg,(scope->>'id')::uuid,'judge'))>0;
  END LOOP;
 END IF;
 RETURN projection||jsonb_build_object('deductionSettings',jsonb_build_object('organizer',competition_child_native_deductions_enabled(cfg,calc.round_id),'judge',judges_enabled));
END $$;

-- Include deduction records in the existing immutable submission lineage check.
DO $$ DECLARE definition text; revised text; BEGIN
 definition:=pg_get_functiondef('competition_child_current_sources(uuid,uuid,uuid)'::regprocedure);
 IF position('d.deductions=coalesce(item->''deductions''' IN definition)=0 THEN
  revised:=replace(definition,'AND d.scores=item->''scores''','AND d.scores=item->''scores'' AND d.deductions=coalesce(item->''deductions'',''[]''::jsonb)');
  IF revised=definition THEN RAISE EXCEPTION 'CURRENT_SOURCE_LINEAGE_GUARD_NOT_FOUND'; END IF;
  EXECUTE revised;
 END IF;
END $$;

REVOKE ALL ON FUNCTION competition_validate_native_configuration_v126(uuid,uuid,jsonb,boolean),competition_child_score_write_v126(uuid,uuid,uuid,uuid,text,jsonb),competition_child_live_view_v126(uuid,uuid,uuid,uuid,boolean),competition_child_deduction_action_v126(uuid,uuid,uuid,uuid,text,jsonb),competition_child_native_deductions_enabled_v126(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION competition_child_public_projection_v126(uuid),competition_child_public_projection(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION competition_deduction_mode(jsonb,uuid),competition_deduction_rule_round(jsonb,jsonb),competition_deduction_rules(jsonb,uuid,text),competition_validate_native_configuration(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION competition_child_score_write(uuid,uuid,uuid,uuid,text,jsonb),competition_child_live_view(uuid,uuid,uuid,uuid,boolean),competition_child_deduction_action(uuid,uuid,uuid,uuid,text,jsonb),competition_child_native_deductions_enabled(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION competition_child_score_write(uuid,uuid,uuid,uuid,text,jsonb),competition_child_live_view(uuid,uuid,uuid,uuid,boolean),competition_child_deduction_action(uuid,uuid,uuid,uuid,text,jsonb),competition_child_native_deductions_enabled(jsonb,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION competition_deduction_mode(jsonb,uuid),competition_deduction_rule_round(jsonb,jsonb),competition_deduction_rules(jsonb,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
