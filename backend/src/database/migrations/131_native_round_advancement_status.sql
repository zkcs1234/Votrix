-- Expose authoritative outgoing qualification status without changing scoring
-- fingerprints, opening sessions, or confirming qualifiers automatically.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN
 IF to_regprocedure('competition_child_tabulation_snapshot_v130(uuid,uuid,uuid,uuid,boolean)') IS NULL THEN RAISE EXCEPTION 'MIGRATION_130_REQUIRED'; END IF;
 IF to_regprocedure('competition_child_tabulation_snapshot_v131(uuid,uuid,uuid,uuid,boolean)') IS NULL THEN
  ALTER FUNCTION competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean) RENAME TO competition_child_tabulation_snapshot_v131;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION competition_child_next_round(p_config jsonb,p_source jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT r FROM jsonb_array_elements(coalesce(p_config->'rounds','[]')) r
 WHERE CASE WHEN p_source->>'nextRoundId' IS NOT NULL THEN r->>'id'=p_source->>'nextRoundId'
 ELSE coalesce(r->>'purpose','')<>'special' AND (r->>'displayOrder')::integer>(p_source->>'displayOrder')::integer END
 ORDER BY (r->>'displayOrder')::integer,r->>'id' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION competition_child_tabulation_snapshot(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_reviewer boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; cfg jsonb; source jsonb; target jsonb; q competition_child_qualifications; next_session competition_child_sessions; current boolean;
BEGIN
 state:=competition_child_tabulation_snapshot_v131(p_event,p_competition,p_actor,p_round,p_reviewer);
 SELECT v.configuration_snapshot INTO cfg FROM competitions c JOIN competition_child_rule_versions v ON v.id=c.official_child_rules_id WHERE c.id=p_competition AND c.event_id=p_event;
 SELECT r INTO source FROM jsonb_array_elements(coalesce(cfg->'rounds','[]')) r WHERE r->>'id'=p_round::text;
 target:=competition_child_next_round(cfg,source);
 IF target IS NULL THEN RETURN state||jsonb_build_object('advancement',NULL); END IF;
 SELECT * INTO q FROM competition_child_qualifications WHERE event_id=p_event AND competition_id=p_competition AND to_round=(target->>'id')::uuid ORDER BY version DESC LIMIT 1;
 SELECT * INTO next_session FROM competition_child_sessions WHERE event_id=p_event AND competition_id=p_competition AND round_id=(target->>'id')::uuid;
 current:=coalesce(q.from_round=p_round AND state->'complete'='true'::jsonb AND state->'calculation'->'finalized'='true'::jsonb AND q.calculation_id::text=state->'calculation'->>'id' AND q.source_digest=state->>'sourceDigest',false);
 RETURN state||jsonb_build_object('advancement',jsonb_build_object(
  'fromRoundId',p_round,'fromRoundName',source->>'name','toRoundId',target->>'id','nextRoundName',target->>'name',
  'nextRound',jsonb_build_object('id',target->>'id','name',target->>'name','progression',coalesce(target->>'progression','back_to_zero'),'weight',target->'weight'),
  'perDivision',EXISTS(SELECT 1 FROM competitions WHERE id=p_competition AND event_id=p_event AND competition_type='pageant'),
  'scoreContributions',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',r->>'name','weight',r->'weight') ORDER BY (r->>'displayOrder')::integer),'[]') FROM jsonb_array_elements(cfg->'rounds') r WHERE coalesce(r->>'purpose','')<>'special'),
  'policy',coalesce(source->>'advancementType','none'),'value',source->'advancementValue',
  'qualificationCurrent',current,'qualificationVersion',q.version,
  'qualifiedEntryIds',CASE WHEN current THEN q.qualifier_ids ELSE '[]'::jsonb END,
  'nextSessionId',next_session.id,'nextSessionStatus',next_session.status));
END $$;

-- Use the same next-main-round resolver as the application. A special round
-- between Preliminary and Final must not intercept their qualification roster.
DO $$ DECLARE definition text; updated_definition text; BEGIN
 definition:=pg_get_functiondef('competition_child_confirm_qualification(uuid,uuid,uuid,uuid,uuid,text,jsonb,text,boolean)'::regprocedure);
 IF position('competition_child_next_round' IN definition)=0 THEN
  updated_definition:=regexp_replace(
   definition,
   $pattern$SELECT[[:space:]]+value[[:space:]]+INTO[[:space:]]+target[[:space:]]+FROM[[:space:]]+jsonb_array_elements\(state->'rules'->'configuration_snapshot'->'rounds'\)[[:space:]]+WHERE([[:space:]]|[^;])*?;$pattern$,
   $replacement$target:=competition_child_next_round(state->'rules'->'configuration_snapshot',definition);$replacement$
  );
  IF updated_definition=definition THEN RAISE EXCEPTION 'QUALIFICATION_NEXT_ROUND_GUARD_NOT_FOUND'; END IF;
  EXECUTE updated_definition;
 END IF;
END $$;
REVOKE ALL ON FUNCTION competition_child_tabulation_snapshot_v131(uuid,uuid,uuid,uuid,boolean),competition_child_next_round(jsonb,jsonb),competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
