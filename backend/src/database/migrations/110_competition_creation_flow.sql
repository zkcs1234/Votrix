-- Eight-step native creation: draft identity edits/removal and all-branch review.
-- Parent and child locks serialize setup edits with the final review transaction.
BEGIN;
ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS participation_format text NOT NULL DEFAULT 'individual'
  CHECK (participation_format IN ('individual','duo','group'));
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS competition_created_at timestamptz;

CREATE OR REPLACE FUNCTION public.competition_edit_draft_child(p_event uuid,p_competition uuid,p_actor uuid,p_setup bigint,p_name text,p_type text,p_format text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions;
BEGIN
 c:=competition_native_authority(p_event,p_competition,p_actor,true);
 IF c.setup_revision IS DISTINCT FROM p_setup THEN RAISE EXCEPTION 'CHILD_REVISION_CONFLICT'; END IF;
 IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 200 OR p_format NOT IN('individual','duo','group') OR length(coalesce(p_type,''))>100 THEN RAISE EXCEPTION 'INVALID_CHILD_DETAILS'; END IF;
 IF c.name=btrim(p_name) AND c.competition_type IS NOT DISTINCT FROM nullif(btrim(p_type),'') AND c.participation_format=p_format THEN RETURN to_jsonb(c); END IF;
 UPDATE competitions SET name=btrim(p_name),competition_type=nullif(btrim(p_type),''),participation_format=p_format,
 setup_revision=setup_revision+1,input_revision=input_revision+1 WHERE id=c.id RETURNING * INTO c;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.child.update','competitions',c.id,jsonb_build_object('eventId',p_event,'setupRevision',c.setup_revision,'participationFormat',p_format));
 RETURN to_jsonb(c);
END $$;

CREATE OR REPLACE FUNCTION public.competition_remove_draft_child(p_event uuid,p_competition uuid,p_actor uuid,p_setup bigint,p_input bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions;
BEGIN
 c:=competition_native_authority(p_event,p_competition,p_actor,true);
 IF c.setup_revision IS DISTINCT FROM p_setup OR c.input_revision IS DISTINCT FROM p_input THEN RAISE EXCEPTION 'CHILD_REVISION_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM competition_child_sessions WHERE competition_id=c.id) OR EXISTS(SELECT 1 FROM competition_child_rule_versions WHERE competition_id=c.id) THEN RAISE EXCEPTION 'CHILD_HISTORY_IMMUTABLE'; END IF;
 DELETE FROM competition_child_judge_assignments WHERE competition_id=c.id;
 DELETE FROM competition_child_minors WHERE competition_id=c.id;
 DELETE FROM competition_child_criteria WHERE competition_id=c.id;
 DELETE FROM competition_child_rounds WHERE competition_id=c.id;
 DELETE FROM competition_child_configurations WHERE competition_id=c.id;
 DELETE FROM competition_entries WHERE competition_id=c.id;
 DELETE FROM competitions WHERE id=c.id;
 UPDATE events SET competition_setup_revision=competition_setup_revision+1,competition_input_revision=competition_input_revision+1 WHERE id=p_event;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.child.remove_draft','competitions',c.id,jsonb_build_object('eventId',p_event,'name',c.name,'setupRevision',p_setup,'inputRevision',p_input));
 RETURN jsonb_build_object('removedCompetitionId',p_competition);
END $$;

CREATE OR REPLACE FUNCTION public.competition_complete_creation(p_event uuid,p_actor uuid,p_children jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e events; c competitions; expected jsonb; frozen competition_child_rule_versions;
BEGIN
 PERFORM competition_child_authority(p_event,p_actor,false);
 SELECT * INTO e FROM events WHERE id=p_event FOR UPDATE;
 IF jsonb_typeof(p_children) IS DISTINCT FROM 'array' OR jsonb_array_length(p_children)=0 THEN RAISE EXCEPTION 'CHILD_COMPETITIONS_REQUIRED'; END IF;
 IF e.start_date IS NULL OR e.end_date IS NULL OR e.end_date<e.start_date OR length(btrim(coalesce(e.title,'')))=0 OR length(btrim(coalesce(e.competition_type,'')))=0 THEN RAISE EXCEPTION 'EVENT_DETAILS_REQUIRED'; END IF;
 IF jsonb_array_length(p_children)<>(SELECT count(*) FROM competitions WHERE event_id=p_event AND origin='native') OR
 (SELECT count(DISTINCT (v->>'id')::uuid) FROM jsonb_array_elements(p_children) v)<>jsonb_array_length(p_children) OR
 EXISTS(SELECT 1 FROM jsonb_array_elements(p_children) v WHERE NOT EXISTS(SELECT 1 FROM competitions WHERE id=(v->>'id')::uuid AND event_id=p_event AND origin='native')) THEN RAISE EXCEPTION 'CHILD_REVISION_CONFLICT'; END IF;
 -- No branch is frozen if any other branch fails. Ordinary rules cannot be
 -- partially published by a sequence of separate HTTP requests.
 FOR c IN SELECT * FROM competitions WHERE event_id=p_event AND origin='native' ORDER BY id FOR UPDATE LOOP
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
  INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.event.complete_creation','events',p_event,jsonb_build_object('competitionCount',jsonb_array_length(p_children),'reviewedCompetitions',p_children));
 END IF;
 UPDATE events SET competition_created_at=coalesce(competition_created_at,now()) WHERE id=p_event;
 RETURN jsonb_build_object('eventId',p_event,'created',true);
END $$;

-- Completed native creation freezes the set of competition identities as well
-- as the rules. Existing events and legacy workflows retain their behavior.
CREATE OR REPLACE FUNCTION public.competition_creation_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM events WHERE id=NEW.event_id FOR UPDATE;
 IF NEW.origin='native' AND EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id AND competition_created_at IS NOT NULL) AND
 (TG_OP='INSERT' OR NEW.name IS DISTINCT FROM OLD.name OR NEW.competition_type IS DISTINCT FROM OLD.competition_type OR NEW.participation_format IS DISTINCT FROM OLD.participation_format) THEN RAISE EXCEPTION 'CHILD_SETUP_FROZEN'; END IF;
 RETURN NEW;
END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.competitions'::regclass AND tgname='competition_creation_identity_guard') THEN
 CREATE TRIGGER competition_creation_identity_guard BEFORE INSERT OR UPDATE ON public.competitions FOR EACH ROW EXECUTE FUNCTION public.competition_creation_identity_guard();
END IF; END $$;
CREATE OR REPLACE FUNCTION public.competition_creation_parent_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.competition_created_at IS NOT NULL AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description OR NEW.banner IS DISTINCT FROM OLD.banner OR NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.end_date IS DISTINCT FROM OLD.end_date OR NEW.competition_type IS DISTINCT FROM OLD.competition_type) THEN RAISE EXCEPTION 'CHILD_SETUP_FROZEN'; END IF;
 IF NEW.competition_type IS DISTINCT FROM OLD.competition_type AND EXISTS(SELECT 1 FROM competitions WHERE event_id=OLD.id AND origin='native') THEN RAISE EXCEPTION 'REMOVE_DEPENDENT_DRAFT_COMPETITIONS_FIRST'; END IF;
 RETURN NEW;
END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.events'::regclass AND tgname='competition_creation_parent_guard') THEN
 CREATE TRIGGER competition_creation_parent_guard BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.competition_creation_parent_guard();
END IF; END $$;
REVOKE ALL ON FUNCTION public.competition_edit_draft_child(uuid,uuid,uuid,bigint,text,text,text),public.competition_remove_draft_child(uuid,uuid,uuid,bigint,bigint),public.competition_complete_creation(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.competition_edit_draft_child(uuid,uuid,uuid,bigint,text,text,text),public.competition_remove_draft_child(uuid,uuid,uuid,bigint,bigint),public.competition_complete_creation(uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
