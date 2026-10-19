-- Add score-free per-criterion lock progress to organizer live snapshots.
BEGIN;

DO $$
BEGIN
 IF to_regprocedure('public.competition_child_live_view_v105(uuid,uuid,uuid,uuid,boolean)') IS NULL
 OR to_regprocedure('public.competition_child_live_view(uuid,uuid,uuid,uuid,boolean)') IS NULL
 OR to_regclass('public.competition_child_score_drafts') IS NULL
 THEN
   RAISE EXCEPTION 'MIGRATIONS_105_AND_106_REQUIRED';
 END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.competition_child_live_view(
 p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_owner boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
 result jsonb;
 q jsonb;
 blocked boolean;
 v_session_id uuid;
 v_entry_count integer;
 v_judge_count integer;
 criteria_progress jsonb;
BEGIN
 result:=public.competition_child_live_view_v105(p_event,p_competition,p_actor,p_round,p_owner);
 IF result->'laterRoundBlocked'='true'::jsonb THEN
  q:=public.competition_child_qualification_state(p_event,p_competition,p_round);
  blocked:=q->'current' IS DISTINCT FROM 'true'::jsonb;
  result:=result||jsonb_build_object('laterRoundBlocked',blocked);
  IF blocked THEN
   result:=result||jsonb_build_object(
    'scoringAvailable',false,
    'criteria',(SELECT coalesce(jsonb_agg(k||jsonb_build_object('open',false)),'[]'::jsonb) FROM jsonb_array_elements(result->'criteria') k),
    'contestants',(SELECT coalesce(jsonb_agg(e||jsonb_build_object('open',false)),'[]'::jsonb) FROM jsonb_array_elements(result->'contestants') e)
   );
  END IF;
 END IF;

 IF p_owner AND result->'session' IS NOT NULL AND result->'session'<>'null'::jsonb THEN
  v_session_id:=(result->'session'->>'id')::uuid;
  v_entry_count:=jsonb_array_length(coalesce(result->'session'->'entry_ids','[]'::jsonb));
  SELECT count(DISTINCT assignment->>'judgeId')::integer
  INTO v_judge_count
  FROM public.competition_child_rule_versions rules
  CROSS JOIN LATERAL jsonb_array_elements(rules.assignment_snapshot) AS assignments(assignment)
  WHERE rules.id=(result->'context'->>'rulesVersion')::uuid
    AND (assignment->>'round_id' IS NULL OR assignment->>'round_id'=coalesce(p_round::text,''));

  SELECT coalesce(jsonb_agg(
   criterion||jsonb_build_object(
    'lockedCount',(
     SELECT count(*)::integer
     FROM public.competition_child_score_drafts draft
     WHERE draft.session_id=v_session_id
       AND draft.criterion_id=(criterion->>'id')::uuid
       AND draft.locked
       AND result->'session'->'entry_ids' ? draft.entry_id::text
    ),
    'requiredCount',v_entry_count*v_judge_count,
    'lockedJudgeCount',(
     SELECT count(*)::integer
     FROM (
      SELECT draft.judge_id
      FROM public.competition_child_score_drafts draft
      WHERE draft.session_id=v_session_id
        AND draft.criterion_id=(criterion->>'id')::uuid
        AND draft.locked
        AND result->'session'->'entry_ids' ? draft.entry_id::text
      GROUP BY draft.judge_id
      HAVING count(DISTINCT draft.entry_id)>=v_entry_count
     ) completed_judges
    ),
    'judgeCount',v_judge_count,
    'participantCount',v_entry_count
   ) ORDER BY criterion->>'id'),'[]'::jsonb)
  INTO criteria_progress
  FROM jsonb_array_elements(coalesce(result->'criteria','[]'::jsonb)) criterion;

  result:=result||jsonb_build_object('criteria',criteria_progress);
 END IF;
 RETURN result;
END
$$;

REVOKE ALL ON FUNCTION public.competition_child_live_view(uuid,uuid,uuid,uuid,boolean)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.competition_child_live_view(uuid,uuid,uuid,uuid,boolean)
TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
