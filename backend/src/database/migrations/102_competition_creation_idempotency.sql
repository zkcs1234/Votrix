-- A stable request UUID makes a retried Create operation return its original
-- event. No existing event or create draft is promoted or rewritten.
BEGIN;
CREATE TABLE competition_create_requests (
 organizer_id uuid NOT NULL REFERENCES users(id), request_id uuid NOT NULL,
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 request_payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organizer_id,request_id)
);
ALTER TABLE competition_create_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON competition_create_requests FROM PUBLIC;
DO $$ DECLARE role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON public.competition_create_requests FROM %I',role_name);END IF;
 END LOOP;
END $$;
GRANT SELECT,INSERT ON competition_create_requests TO service_role;
CREATE FUNCTION competition_create_event(p_actor uuid,p_organization uuid,p_request uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous competition_create_requests; e events; comparison jsonb;
BEGIN
 PERFORM 1 FROM organizations WHERE id=p_organization AND organizer_id=p_actor FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role::text='organizer' AND account_status='active') THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN';END IF;
 IF p_request IS NULL THEN RAISE EXCEPTION 'CREATE_REQUEST_REQUIRED';END IF;
 comparison:=p_payload-ARRAY['banner','image_asset_id'];
 SELECT * INTO previous FROM competition_create_requests WHERE organizer_id=p_actor AND request_id=p_request;
 IF previous.event_id IS NOT NULL THEN
   IF previous.request_payload IS DISTINCT FROM comparison THEN RAISE EXCEPTION 'CREATE_REQUEST_CONFLICT: Start a new create operation for different details';END IF;
   SELECT * INTO e FROM events WHERE id=previous.event_id AND organization_id=p_organization;
   IF e.id IS NULL THEN RAISE EXCEPTION 'CREATE_REQUEST_EVENT_FORBIDDEN';END IF;
   RETURN to_jsonb(e);
 END IF;
 IF length(trim(coalesce(p_payload->>'title','')))=0 OR p_payload->>'start_date' IS NULL OR p_payload->>'end_date' IS NULL OR (p_payload->>'end_date')::timestamptz<(p_payload->>'start_date')::timestamptz THEN RAISE EXCEPTION 'INVALID_CREATE_DETAILS';END IF;
 INSERT INTO events(organization_id,title,description,banner,image_asset_id,start_date,end_date,status,event_type,competition_type,scoring_enabled)
 VALUES(p_organization,p_payload->>'title',p_payload->>'description',p_payload->>'banner',(p_payload->>'image_asset_id')::uuid,(p_payload->>'start_date')::timestamptz,(p_payload->>'end_date')::timestamptz,'draft','competition_scoring',p_payload->>'competition_type',false) RETURNING * INTO e;
 INSERT INTO competition_create_requests(organizer_id,request_id,event_id,request_payload) VALUES(p_actor,p_request,e.id,comparison);
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.event.create','events',e.id,jsonb_build_object('requestId',p_request));
 RETURN to_jsonb(e);
END; $$;
REVOKE ALL ON FUNCTION competition_create_event(uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_create_event(uuid,uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
