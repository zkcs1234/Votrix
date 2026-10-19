-- Legacy Pageant setup could create separate native child competitions for
-- divisions. Review and freeze only the canonical Pageant competition; retain
-- those old rows without treating them as independent scoring configurations.
BEGIN;

DO $$
BEGIN
 IF to_regprocedure('public.competition_complete_creation_v110(uuid,uuid,jsonb)') IS NULL
 OR to_regprocedure('public.competition_complete_creation(uuid,uuid,jsonb,text)') IS NULL
 OR NOT EXISTS (
   SELECT 1 FROM pg_attribute
   WHERE attrelid='public.events'::regclass
     AND attname='competition_type'
     AND NOT attisdropped
 )
 OR NOT EXISTS (
   SELECT 1 FROM pg_attribute
   WHERE attrelid='public.competitions'::regclass
     AND attname='competition_type'
     AND NOT attisdropped
 )
 THEN
   RAISE EXCEPTION 'MIGRATIONS_110_AND_115_REQUIRED';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.competition_complete_creation_v110(p_event uuid,p_actor uuid,p_children jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e events; c competitions; expected jsonb; frozen competition_child_rule_versions;
BEGIN
 PERFORM competition_child_authority(p_event,p_actor,false);
 SELECT * INTO e FROM events WHERE id=p_event FOR UPDATE;
 IF jsonb_typeof(p_children) IS DISTINCT FROM 'array' OR jsonb_array_length(p_children)=0 THEN RAISE EXCEPTION 'CHILD_COMPETITIONS_REQUIRED'; END IF;
 IF e.start_date IS NULL OR e.end_date IS NULL OR e.end_date<e.start_date OR length(btrim(coalesce(e.title,'')))=0 OR length(btrim(coalesce(e.competition_type,'')))=0 THEN RAISE EXCEPTION 'EVENT_DETAILS_REQUIRED'; END IF;
 IF jsonb_array_length(p_children)<>(
   SELECT count(*) FROM competitions child_row
   WHERE child_row.event_id=p_event AND child_row.origin='native'
     AND NOT (e.competition_type='pageant' AND child_row.competition_type='pageant' AND lower(btrim(child_row.name))<>'pageant')
 ) OR
 (SELECT count(DISTINCT (v->>'id')::uuid) FROM jsonb_array_elements(p_children) v)<>jsonb_array_length(p_children) OR
 EXISTS(
   SELECT 1 FROM jsonb_array_elements(p_children) v
   WHERE NOT EXISTS(
     SELECT 1 FROM competitions child_row
     WHERE child_row.id=(v->>'id')::uuid AND child_row.event_id=p_event AND child_row.origin='native'
       AND NOT (e.competition_type='pageant' AND child_row.competition_type='pageant' AND lower(btrim(child_row.name))<>'pageant')
   )
 ) THEN RAISE EXCEPTION 'CHILD_REVISION_CONFLICT'; END IF;
 FOR c IN
   SELECT * FROM competitions child
   WHERE child.event_id=p_event AND child.origin='native'
     AND NOT (e.competition_type='pageant' AND child.competition_type='pageant' AND lower(btrim(child.name))<>'pageant')
   ORDER BY child.id FOR UPDATE
 LOOP
  SELECT v INTO expected FROM jsonb_array_elements(p_children) v WHERE v->>'id'=c.id::text;
  IF (expected->>'setupRevision')::bigint IS DISTINCT FROM c.setup_revision OR (expected->>'inputRevision')::bigint IS DISTINCT FROM c.input_revision THEN RAISE EXCEPTION 'CHILD_REVISION_CONFLICT'; END IF;
  IF c.official_child_rules_id IS NULL THEN
   PERFORM competition_freeze_native_rules(p_event,c.id,p_actor,c.setup_revision,c.input_revision);
  ELSE
   SELECT * INTO frozen FROM competition_child_rule_versions WHERE id=c.official_child_rules_id;
   IF frozen.setup_revision IS DISTINCT FROM c.setup_revision OR frozen.input_revision IS DISTINCT FROM c.input_revision THEN RAISE EXCEPTION 'CHILD_REVISION_CONFLICT'; END IF;
  END IF;
 END LOOP;
 IF e.competition_created_at IS NULL THEN
  INSERT INTO audit_logs(user_id,action,entity,entity_id,details)
  VALUES(p_actor,'competition.event.complete_creation','events',p_event,jsonb_build_object('competitionCount',jsonb_array_length(p_children),'reviewedCompetitions',p_children));
 END IF;
 UPDATE events SET competition_created_at=coalesce(competition_created_at,now()) WHERE id=p_event;
 RETURN jsonb_build_object('eventId',p_event,'created',true);
END $$;

REVOKE ALL ON FUNCTION public.competition_complete_creation_v110(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
