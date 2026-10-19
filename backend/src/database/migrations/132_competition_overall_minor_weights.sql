-- Minor weights in new configurations are direct shares of the round total.
-- Older frozen configurations retain their relative-to-major interpretation.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN
 IF to_regprocedure('public.competition_validate_native_configuration_v131(uuid,uuid,jsonb,boolean)') IS NULL THEN
  ALTER FUNCTION competition_validate_native_configuration(uuid,uuid,jsonb,boolean) RENAME TO competition_validate_native_configuration_v131;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION competition_validate_native_configuration(p_event uuid,p_competition uuid,p_config jsonb,p_complete boolean)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE clean jsonb; clean_criteria jsonb; criterion jsonb; total numeric; basis text; points_basis boolean;
BEGIN
 clean:=p_config;
 IF jsonb_typeof(p_config)='object' AND jsonb_typeof(p_config->'scoringConfig')='object' THEN
  basis:=p_config->'scoringConfig'->>'minorWeightBasis';
  IF p_config->'scoringConfig' ? 'minorWeightBasis' AND basis IS DISTINCT FROM 'overall' THEN RAISE EXCEPTION 'INVALID_MINOR_WEIGHT_BASIS'; END IF;
  points_basis:=coalesce(p_config->'scoringConfig'->>'criterionBasis','percentage')='points';
  IF basis='overall' AND NOT points_basis AND jsonb_typeof(p_config->'criteria')='array' THEN
   FOR criterion IN SELECT value FROM jsonb_array_elements(p_config->'criteria') LOOP
    IF jsonb_typeof(criterion->'minorCriteria')='array' AND EXISTS(SELECT 1 FROM jsonb_array_elements(criterion->'minorCriteria') m WHERE m ? 'percentage') THEN
     IF jsonb_typeof(criterion->'percentage') IS DISTINCT FROM 'number' OR (criterion->>'percentage')::numeric<=0 OR
        EXISTS(SELECT 1 FROM jsonb_array_elements(criterion->'minorCriteria') m WHERE jsonb_typeof(m->'percentage') IS DISTINCT FROM 'number' OR (m->>'percentage')::numeric<=0 OR (m->>'percentage')::numeric>100) OR
        EXISTS(SELECT 1 FROM jsonb_array_elements(criterion->'minorCriteria') m WHERE NOT (m ? 'percentage')) THEN
      RAISE EXCEPTION 'INVALID_OVERALL_MINOR_WEIGHTS';
     END IF;
     SELECT sum((m->>'percentage')::numeric) INTO total FROM jsonb_array_elements(criterion->'minorCriteria') m;
     IF abs(total-(criterion->>'percentage')::numeric)>0.001 THEN RAISE EXCEPTION 'MINOR_WEIGHTS_MUST_MATCH_MAJOR'; END IF;
    END IF;
   END LOOP;
   SELECT coalesce(jsonb_agg(
    CASE WHEN jsonb_typeof(c->'minorCriteria')='array' AND EXISTS(SELECT 1 FROM jsonb_array_elements(c->'minorCriteria') m WHERE m ? 'percentage') THEN
     jsonb_set(c,'{minorCriteria}',(
      SELECT jsonb_agg(
       CASE WHEN m ? 'percentage' THEN jsonb_set(m,'{percentage}',to_jsonb((m->>'percentage')::numeric*100/(c->>'percentage')::numeric))
       ELSE m END ORDER BY ordinal
      )
      FROM jsonb_array_elements(c->'minorCriteria') WITH ORDINALITY minors(m,ordinal)
     ))
    ELSE c END ORDER BY ordinal
   ),'[]'::jsonb) INTO clean_criteria
   FROM jsonb_array_elements(p_config->'criteria') WITH ORDINALITY criteria(c,ordinal);
   clean:=jsonb_set(clean,'{criteria}',clean_criteria);
  END IF;
  clean:=jsonb_set(clean,'{scoringConfig}',(clean->'scoringConfig')-'minorWeightBasis');
 END IF;
 PERFORM competition_validate_native_configuration_v131(p_event,p_competition,clean,p_complete);
END $$;

REVOKE ALL ON FUNCTION competition_validate_native_configuration_v131(uuid,uuid,jsonb,boolean),competition_validate_native_configuration(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
