-- Published native events use the scheduled status. Preserve all existing
-- scoring, access, qualification, and review guards while making that state
-- operational only after the native setup review marker has been recorded.
BEGIN;

DO $$
BEGIN
 IF to_regprocedure('public.competition_child_live_view_v105(uuid,uuid,uuid,uuid,boolean)') IS NULL
 OR to_regprocedure('public.competition_child_live_control_v105(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL
 OR to_regprocedure('public.competition_child_live_control(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL
 OR to_regprocedure('public.competition_child_score_write(uuid,uuid,uuid,uuid,text,jsonb)') IS NULL
 OR to_regprocedure('public.competition_child_judge_navigation(uuid,uuid,boolean)') IS NULL
 OR to_regprocedure('public.competition_complete_creation(uuid,uuid,jsonb,text)') IS NULL
 OR NOT EXISTS (
   SELECT 1 FROM pg_attribute
   WHERE attrelid='public.events'::regclass
     AND attname='competition_created_at'
     AND NOT attisdropped
 )
 THEN
   RAISE EXCEPTION 'MIGRATIONS_105_108_115_117_REQUIRED';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.competition_native_scheduled_event_scoring_enabled(p_event uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
 SELECT EXISTS(
   SELECT 1
   FROM public.events e
   WHERE e.id=p_event
     AND e.status::text='scheduled'
     AND e.competition_created_at IS NOT NULL
     AND EXISTS(
       SELECT 1 FROM public.competitions c
       WHERE c.event_id=e.id AND c.origin='native'
     )
 );
$$;
REVOKE ALL ON FUNCTION public.competition_native_scheduled_event_scoring_enabled(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.competition_native_scheduled_event_scoring_enabled(uuid)
TO service_role;

DO $$
DECLARE item record; definition text; updated_definition text; target regprocedure;
BEGIN
 FOR item IN
   SELECT * FROM (VALUES
     (
       'public.competition_child_live_view_v105(uuid,uuid,uuid,uuid,boolean)',
       'event_status[[:space:]]+IN[[:space:]]*\([[:space:]]*''draft''[[:space:]]*,[[:space:]]*''active''[[:space:]]*\)',
       '(event_status IN(''draft'',''active'') OR (event_status=''scheduled'' AND public.competition_native_scheduled_event_scoring_enabled(p_event)))'
     ),
     (
       'public.competition_child_live_control_v105(uuid,uuid,uuid,uuid,text,jsonb)',
       'status::text[[:space:]]+IN[[:space:]]*\([[:space:]]*''draft''[[:space:]]*,[[:space:]]*''active''[[:space:]]*\)',
       '(status::text IN(''draft'',''active'') OR (status::text=''scheduled'' AND public.competition_native_scheduled_event_scoring_enabled(p_event)))'
     ),
     (
       'public.competition_child_live_control(uuid,uuid,uuid,uuid,text,jsonb)',
       'status::text[[:space:]]+IN[[:space:]]*\([[:space:]]*''draft''[[:space:]]*,[[:space:]]*''active''[[:space:]]*\)',
       '(status::text IN(''draft'',''active'') OR (status::text=''scheduled'' AND public.competition_native_scheduled_event_scoring_enabled(p_event)))'
     ),
     (
       'public.competition_child_score_write(uuid,uuid,uuid,uuid,text,jsonb)',
       'status::text[[:space:]]+IN[[:space:]]*\([[:space:]]*''draft''[[:space:]]*,[[:space:]]*''active''[[:space:]]*\)',
       '(status::text IN(''draft'',''active'') OR (status::text=''scheduled'' AND public.competition_native_scheduled_event_scoring_enabled(p_event)))'
     ),
     (
       'public.competition_child_judge_navigation(uuid,uuid,boolean)',
       'view->>''eventStatus''[[:space:]]+NOT[[:space:]]+IN[[:space:]]*\([[:space:]]*''draft''[[:space:]]*,[[:space:]]*''active''[[:space:]]*\)',
       '((view->>''eventStatus'' NOT IN(''draft'',''active'')) AND NOT ((view->>''eventStatus'')=''scheduled'' AND public.competition_native_scheduled_event_scoring_enabled(p_event)))'
     )
   ) AS replacements(signature,pattern,replacement)
 LOOP
   target:=to_regprocedure(item.signature);
   definition:=pg_get_functiondef(target);
   IF position('public.competition_native_scheduled_event_scoring_enabled(p_event)' IN definition)>0 THEN
     CONTINUE;
   END IF;
   updated_definition:=regexp_replace(definition,item.pattern,item.replacement,'g');
   IF updated_definition=definition THEN
     RAISE EXCEPTION 'SCHEDULED_SCORING_GUARD_NOT_FOUND: %',item.signature;
   END IF;
   EXECUTE updated_definition;
 END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
