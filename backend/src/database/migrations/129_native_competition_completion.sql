-- Complete a native competition event only after every native child has
-- finalized rounds, confirmed each advancement, and published its terminal results.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN
 IF to_regprocedure('competition_child_publication_action(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL
   OR to_regprocedure('competition_child_publication_action_v129(uuid,uuid,uuid,uuid,text,jsonb)') IS NOT NULL
   OR to_regprocedure('competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean)') IS NULL
   OR to_regclass('competition_child_qualifications') IS NULL
   OR to_regclass('competition_child_calculation_transitions') IS NULL
   OR to_regclass('competition_child_sessions') IS NULL
   OR to_regclass('competition_child_calculations') IS NULL
   OR to_regclass('competition_child_publications') IS NULL
   OR to_regclass('competition_child_configurations') IS NULL
   OR to_regclass('competition_child_rounds') IS NULL THEN
  RAISE EXCEPTION 'MIGRATIONS_106_AND_107_REQUIRED';
 END IF;
END $$;

ALTER FUNCTION competition_child_publication_action(uuid,uuid,uuid,uuid,text,jsonb)
 RENAME TO competition_child_publication_action_v129;

CREATE OR REPLACE FUNCTION competition_native_round_completion_ready(
 p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_require_publication boolean
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; v_calculation uuid; v_publication text; v_publication_calculation uuid;
BEGIN
 state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,p_round,false);
 IF state->'complete' IS DISTINCT FROM 'true'::jsonb
  OR state->'session'->>'status' IS DISTINCT FROM 'closed'
  OR state->'calculation'->'verified' IS DISTINCT FROM 'true'::jsonb
  OR state->'calculation'->'finalized' IS DISTINCT FROM 'true'::jsonb
  OR state->'calculation'->>'id' IS NULL
  OR state->'calculation'->>'source_digest' IS DISTINCT FROM state->>'sourceDigest' THEN
  RETURN false;
 END IF;
 v_calculation:=(state->'calculation'->>'id')::uuid;
 IF p_require_publication THEN
  SELECT action,calculation_id INTO v_publication,v_publication_calculation
  FROM competition_child_publications
  WHERE event_id=p_event AND competition_id=p_competition
   AND round_id IS NOT DISTINCT FROM p_round
  ORDER BY version DESC LIMIT 1;
  IF v_publication IS NULL OR v_publication NOT IN('publish','replace')
   OR v_publication_calculation IS DISTINCT FROM v_calculation THEN
   RETURN false;
  END IF;
 END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION competition_native_event_completion_ready(p_event uuid,p_actor uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE child record; source_round jsonb; target_round jsonb; rounds jsonb;
 v_calculation uuid; v_source_digest text; round_count integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM competitions WHERE event_id=p_event AND origin='native')
  OR EXISTS(SELECT 1 FROM competitions WHERE event_id=p_event AND origin<>'native')
  OR EXISTS(
   SELECT 1 FROM competitions c
   WHERE c.event_id=p_event AND c.origin='native'
    AND NOT EXISTS(SELECT 1 FROM competition_child_configurations cfg
     WHERE cfg.competition_id=c.id AND cfg.event_id=c.event_id)
  ) THEN
  RETURN false;
 END IF;
 FOR child IN
  SELECT c.id,cfg.configuration
  FROM competitions c
  JOIN competition_child_configurations cfg ON cfg.competition_id=c.id AND cfg.event_id=c.event_id
  WHERE c.event_id=p_event AND c.origin='native'
 LOOP
  IF child.configuration->>'structure' IS DISTINCT FROM 'single'
   AND child.configuration->>'structure' IS DISTINCT FROM 'multiple' THEN RETURN false; END IF;
  IF child.configuration->>'structure'='single' THEN
   IF NOT competition_native_round_completion_ready(p_event,child.id,p_actor,NULL,true) THEN RETURN false; END IF;
   CONTINUE;
  END IF;
  rounds:=child.configuration->'rounds';
  IF jsonb_typeof(rounds) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  SELECT count(*) INTO round_count FROM jsonb_array_elements(rounds) r
   WHERE r->>'purpose' IS DISTINCT FROM 'special';
  IF round_count=0 THEN RETURN false; END IF;
  FOR source_round IN
   SELECT value FROM jsonb_array_elements(rounds)
   WHERE value->>'purpose' IS DISTINCT FROM 'special'
  LOOP
   IF NOT competition_native_round_completion_ready(
    p_event,child.id,p_actor,(source_round->>'id')::uuid,false
   ) THEN RETURN false; END IF;
   SELECT value INTO target_round
   FROM jsonb_array_elements(rounds)
   WHERE value->>'purpose' IS DISTINCT FROM 'special'
    AND (
     (source_round->>'nextRoundId' IS NOT NULL AND value->>'id'=source_round->>'nextRoundId')
     OR (source_round->>'nextRoundId' IS NULL
      AND (value->>'displayOrder')::integer>(source_round->>'displayOrder')::integer)
    )
   ORDER BY (value->>'displayOrder')::integer LIMIT 1;
   IF target_round IS NULL THEN
    IF source_round->>'nextRoundId' IS NOT NULL OR NOT competition_native_round_completion_ready(
      p_event,child.id,p_actor,(source_round->>'id')::uuid,true
    ) THEN RETURN false; END IF;
   ELSE
    SELECT id,source_digest INTO v_calculation,v_source_digest
    FROM competition_child_calculations
    WHERE event_id=p_event AND competition_id=child.id
     AND round_id IS NOT DISTINCT FROM (source_round->>'id')::uuid
    ORDER BY version DESC LIMIT 1;
    IF v_calculation IS NULL OR NOT EXISTS(
     SELECT 1 FROM competition_child_qualifications q
     WHERE q.event_id=p_event AND q.competition_id=child.id
      AND q.from_round=(source_round->>'id')::uuid
      AND q.to_round=(target_round->>'id')::uuid
      AND q.calculation_id=v_calculation AND q.source_digest=v_source_digest
      AND q.version=(SELECT max(current_q.version)
       FROM competition_child_qualifications current_q
       WHERE current_q.competition_id=child.id
        AND current_q.to_round=(target_round->>'id')::uuid)
    ) THEN RETURN false; END IF;
   END IF;
   target_round:=NULL;
  END LOOP;
 END LOOP;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION competition_child_publication_action(
 p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_action text,p_body jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 result:=competition_child_publication_action_v129(p_event,p_competition,p_actor,p_round,p_action,p_body);
 IF competition_native_event_completion_ready(p_event,p_actor) THEN
  UPDATE events SET status='completed',competition_lifecycle='results_published',scoring_enabled=false
  WHERE id=p_event AND status::text NOT IN('archived','cancelled');
 ELSIF p_action='withdraw' THEN
  UPDATE events SET status='active',competition_lifecycle='tabulation_pending',scoring_enabled=false
  WHERE id=p_event AND status::text='completed';
 END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION competition_native_round_completion_ready(uuid,uuid,uuid,uuid,boolean),
 competition_native_event_completion_ready(uuid,uuid),
 competition_child_publication_action_v129(uuid,uuid,uuid,uuid,text,jsonb),
 competition_child_publication_action(uuid,uuid,uuid,uuid,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION competition_child_publication_action(uuid,uuid,uuid,uuid,text,jsonb)
 TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
