BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN
 IF to_regprocedure('public.competition_child_score_write(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL
 OR to_regprocedure('public.competition_child_score_write_v126(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL
 OR to_regprocedure('public.competition_child_score_write_v128(uuid,uuid,uuid,uuid,text,jsonb)') IS NOT NULL
 THEN RAISE EXCEPTION 'MIGRATION_126_REQUIRED_OR_128_ALREADY_APPLIED'; END IF;
END $$;

ALTER FUNCTION public.competition_child_score_write(uuid,uuid,uuid,uuid,text,jsonb)
 RENAME TO competition_child_score_write_v128;

CREATE OR REPLACE FUNCTION public.competition_child_score_write(
 p_event uuid,p_competition uuid,p_judge uuid,p_round uuid,p_action text,p_body jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE record jsonb; incoming jsonb; normalized jsonb:='[]'::jsonb; offense_key text; reason text;
BEGIN
 IF p_action IN('draft','lock') AND p_body ? 'deductions' THEN
  incoming:=p_body->'deductions';
  IF jsonb_typeof(incoming) IS DISTINCT FROM 'array' OR jsonb_array_length(incoming)>10000 THEN
   RAISE EXCEPTION 'INVALID_JUDGE_DEDUCTIONS';
  END IF;
  FOR record IN SELECT value FROM jsonb_array_elements(incoming) LOOP
   IF jsonb_typeof(record) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_JUDGE_DEDUCTIONS'; END IF;
   IF coalesce(nullif(btrim(record->>'offenseKey'),''),'')='' AND coalesce(nullif(btrim(record->>'reason'),''),'')='' THEN
    IF record->>'id' IS NULL OR record->>'id' !~* '^[0-9a-f-]{36}$' OR record->>'ruleId' IS NULL THEN
     RAISE EXCEPTION 'INVALID_JUDGE_DEDUCTIONS';
    END IF;
    offense_key:='judge-click:'||(record->>'id');
    reason:='Judge applied the configured deduction using the Deduct button.';
    normalized:=normalized||jsonb_build_array(
     (record-'offenseKey'-'reason')||jsonb_build_object('offenseKey',offense_key,'reason',reason)
    );
   ELSE
    normalized:=normalized||jsonb_build_array(record);
   END IF;
  END LOOP;
  p_body:=jsonb_set(p_body,'{deductions}',normalized,true);
 END IF;
 RETURN public.competition_child_score_write_v128(p_event,p_competition,p_judge,p_round,p_action,p_body);
END $$;

REVOKE ALL ON FUNCTION public.competition_child_score_write_v128(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.competition_child_score_write(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.competition_child_score_write(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
