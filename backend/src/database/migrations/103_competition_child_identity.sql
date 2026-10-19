-- Phase 2 ONLY: child identity and explicit participation. No historical table
-- rows/payloads are changed. No backfill is executed by this migration.
-- Reviewed deployment requires a catalog inventory and recoverable backup.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.competition_contestants') IS NULL
 OR to_regprocedure('public.competition_owns_event(uuid,uuid)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.events'::regclass AND attname='competition_input_revision' AND NOT attisdropped)
 OR to_regprocedure('public.competition_create_event(uuid,uuid,uuid,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'CHILD_IDENTITY_REQUIRES_REVIEWED_100_THROUGH_102'; END IF;
END $$;

CREATE TABLE IF NOT EXISTS competitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 200),
 competition_type text CHECK(competition_type IS NULL OR length(btrim(competition_type)) BETWEEN 1 AND 100),
 origin text NOT NULL DEFAULT 'native' CHECK(origin IN ('native','legacy')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT competitions_identity_event UNIQUE(id,event_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS competitions_event_name ON competitions(event_id,lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS competitions_one_legacy ON competitions(event_id) WHERE origin='legacy';

CREATE TABLE IF NOT EXISTS competition_legacy_contexts (
 event_id uuid PRIMARY KEY REFERENCES events(id) ON DELETE RESTRICT,
 competition_id uuid NOT NULL UNIQUE,
 mapped_by uuid NOT NULL REFERENCES users(id),
 mapped_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT competition_legacy_context_event FOREIGN KEY(competition_id,event_id)
 REFERENCES competitions(id,event_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS competition_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 competition_id uuid NOT NULL,
 contestant_id uuid NOT NULL REFERENCES competition_contestants(id) ON DELETE CASCADE,
 entry_number integer NOT NULL CHECK(entry_number>0),
 -- The old display number can repeat across divisions. Preserve it as evidence
 -- while assigning a separate globally unique number in this child context.
 legacy_contestant_number integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT competition_entries_context FOREIGN KEY(competition_id,event_id)
 REFERENCES competitions(id,event_id) ON DELETE RESTRICT,
 CONSTRAINT competition_entries_one_membership UNIQUE(competition_id,contestant_id),
 CONSTRAINT competition_entries_number UNIQUE(competition_id,entry_number)
);
CREATE INDEX IF NOT EXISTS competition_entries_master ON competition_entries(contestant_id);
CREATE INDEX IF NOT EXISTS competition_entries_event ON competition_entries(event_id,competition_id);

CREATE OR REPLACE FUNCTION competition_child_relation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE parent_event uuid; parent_origin text;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.event_id IS DISTINCT FROM OLD.event_id
   OR (to_jsonb(NEW)->>'id') IS DISTINCT FROM (to_jsonb(OLD)->>'id')
   OR (to_jsonb(NEW)->>'competition_id') IS DISTINCT FROM (to_jsonb(OLD)->>'competition_id')
   OR (to_jsonb(NEW)->>'contestant_id') IS DISTINCT FROM (to_jsonb(OLD)->>'contestant_id')
   OR (to_jsonb(NEW)->>'origin') IS DISTINCT FROM (to_jsonb(OLD)->>'origin'))
 THEN RAISE EXCEPTION 'CHILD_IDENTITY_IMMUTABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id AND event_type::text IN('pageant','competition_scoring'))
 THEN RAISE EXCEPTION 'COMPETITION_EVENT_REQUIRED'; END IF;
 IF TG_TABLE_NAME='competition_entries' THEN
   SELECT event_id INTO parent_event FROM competition_contestants WHERE id=NEW.contestant_id FOR KEY SHARE;
   IF parent_event IS DISTINCT FROM NEW.event_id THEN RAISE EXCEPTION 'CROSS_EVENT_PARTICIPATION_FORBIDDEN'; END IF;
 ELSIF TG_TABLE_NAME='competition_legacy_contexts' THEN
   SELECT origin INTO parent_origin FROM competitions WHERE id=NEW.competition_id AND event_id=NEW.event_id;
   IF parent_origin IS DISTINCT FROM 'legacy' THEN RAISE EXCEPTION 'EXPLICIT_LEGACY_CONTEXT_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['competitions','competition_entries','competition_legacy_contexts'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||tab)::regclass AND tgname='competition_child_relation_guard') THEN
     EXECUTE format('CREATE TRIGGER competition_child_relation_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION competition_child_relation_guard()',tab);
   END IF;
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',tab);
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon',tab); END IF;
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated',tab); END IF;
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO service_role',tab);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION competition_child_authority(p_event uuid,p_actor uuid,p_draft boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e events;
BEGIN
 SELECT * INTO e FROM events WHERE id=p_event FOR UPDATE;
 IF e.id IS NULL OR e.event_type::text NOT IN('pageant','competition_scoring') THEN RAISE EXCEPTION 'COMPETITION_EVENT_REQUIRED'; END IF;
 IF NOT competition_owns_event(p_event,p_actor) OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role::text='organizer' AND account_status::text='active') THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
 IF p_draft AND (e.status::text<>'draft' OR e.official_rules_id IS NOT NULL) THEN RAISE EXCEPTION 'CHILD_SETUP_FROZEN'; END IF;
END $$;

CREATE OR REPLACE FUNCTION competition_create_child(p_event uuid,p_actor uuid,p_id uuid,p_name text,p_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE child competitions;
BEGIN
 PERFORM competition_child_authority(p_event,p_actor,true);
 IF p_id IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200
 OR (p_type IS NOT NULL AND length(btrim(p_type)) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'INVALID_CHILD_COMPETITION'; END IF;
 SELECT * INTO child FROM competitions WHERE id=p_id;
 IF child.id IS NOT NULL THEN
   IF child.event_id<>p_event OR child.origin<>'native' OR child.name<>btrim(p_name) OR child.competition_type IS DISTINCT FROM nullif(btrim(p_type),'') THEN RAISE EXCEPTION 'CHILD_REQUEST_CONFLICT'; END IF;
   RETURN to_jsonb(child);
 END IF;
 INSERT INTO competitions(id,event_id,name,competition_type) VALUES(p_id,p_event,btrim(p_name),nullif(btrim(p_type),'')) RETURNING * INTO child;
 -- Invalidate an in-flight legacy publication reviewed before this identity
 -- existed. The existing publication RPC checks these revisions under the
 -- same parent lock. Frozen historical events cannot enter this draft branch.
 UPDATE events SET competition_setup_revision=competition_setup_revision+1,competition_input_revision=competition_input_revision+1 WHERE id=p_event;
 RETURN to_jsonb(child);
END $$;

CREATE OR REPLACE FUNCTION competition_add_entry(p_event uuid,p_actor uuid,p_competition uuid,p_entry uuid,p_number integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE child competitions; participation competition_entries; assigned integer;
BEGIN
 PERFORM competition_child_authority(p_event,p_actor,true);
 SELECT * INTO child FROM competitions WHERE id=p_competition AND event_id=p_event FOR UPDATE;
 IF child.id IS NULL THEN RAISE EXCEPTION 'CHILD_COMPETITION_FORBIDDEN'; END IF;
 IF p_entry IS NULL OR NOT EXISTS(SELECT 1 FROM competition_contestants WHERE id=p_entry AND event_id=p_event) THEN RAISE EXCEPTION 'CROSS_EVENT_PARTICIPATION_FORBIDDEN'; END IF;
 IF p_number IS NOT NULL AND p_number<=0 THEN RAISE EXCEPTION 'INVALID_ENTRY_NUMBER'; END IF;
 SELECT * INTO participation FROM competition_entries WHERE competition_id=p_competition AND contestant_id=p_entry;
 IF participation.id IS NOT NULL THEN
   IF p_number IS NOT NULL AND p_number<>participation.entry_number THEN RAISE EXCEPTION 'PARTICIPATION_REQUEST_CONFLICT'; END IF;
   RETURN to_jsonb(participation);
 END IF;
 -- Parent/child locks serialize requests. A UNIQUE constraint remains the
 -- backstop for direct writes and independently protects each competition.
 SELECT coalesce(p_number,coalesce(max(entry_number),0)+1) INTO assigned FROM competition_entries WHERE competition_id=p_competition;
 INSERT INTO competition_entries(event_id,competition_id,contestant_id,entry_number) VALUES(p_event,p_competition,p_entry,assigned) RETURNING * INTO participation;
 UPDATE events SET competition_setup_revision=competition_setup_revision+1,competition_input_revision=competition_input_revision+1 WHERE id=p_event;
 RETURN to_jsonb(participation);
END $$;

CREATE OR REPLACE FUNCTION competition_map_legacy_event(p_event uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE child competitions; master competition_contestants; assigned integer;
BEGIN
 -- Explicit, audited-by-provenance mapping works for historical frozen events;
 -- only the NEW tables are written. No historical trigger/RPC is invoked.
 PERFORM competition_child_authority(p_event,p_actor,false);
 SELECT c.* INTO child FROM competition_legacy_contexts m JOIN competitions c ON c.id=m.competition_id WHERE m.event_id=p_event;
 IF child.id IS NULL THEN
   IF EXISTS(SELECT 1 FROM competitions WHERE event_id=p_event) THEN RAISE EXCEPTION 'LEGACY_MAPPING_REQUIRES_EMPTY_CONTEXT_SET'; END IF;
   INSERT INTO competitions(event_id,name,competition_type,origin)
   SELECT id,coalesce(nullif(left(btrim(title),200),''),'Legacy competition'),nullif(left(btrim(competition_type),100),''),'legacy' FROM events WHERE id=p_event RETURNING * INTO child;
   INSERT INTO competition_legacy_contexts(event_id,competition_id,mapped_by) VALUES(p_event,child.id,p_actor);
 END IF;
 SELECT coalesce(max(entry_number),0) INTO assigned FROM competition_entries WHERE competition_id=child.id;
 FOR master IN SELECT * FROM competition_contestants WHERE event_id=p_event ORDER BY contestant_number,division_id NULLS FIRST,id LOOP
   IF NOT EXISTS(SELECT 1 FROM competition_entries WHERE competition_id=child.id AND contestant_id=master.id) THEN
     assigned:=assigned+1;
     INSERT INTO competition_entries(event_id,competition_id,contestant_id,entry_number,legacy_contestant_number) VALUES(p_event,child.id,master.id,assigned,master.contestant_number);
   END IF;
 END LOOP;
 RETURN to_jsonb(child);
END $$;

REVOKE ALL ON FUNCTION competition_child_authority(uuid,uuid,boolean),competition_create_child(uuid,uuid,uuid,text,text),competition_add_entry(uuid,uuid,uuid,uuid,integer),competition_map_legacy_event(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_create_child(uuid,uuid,uuid,text,text),competition_add_entry(uuid,uuid,uuid,uuid,integer),competition_map_legacy_event(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
