-- Review the read-only ACL/RLS inventory before applying to a deployed project.
-- This project uses backend service-role access, not browser Supabase Auth.
-- No score, calculation, historical rule or existing policy is rewritten.
BEGIN;
DO $$ DECLARE tab text; role_name text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED: Inspect role configuration before applying';END IF;
 FOREACH tab IN ARRAY ARRAY['competition_scores','competition_session_judge_scores','competition_result_calculations','competition_deductions','competition_rule_versions','competition_judge_drafts','competition_round_submissions','competition_eligibility_decisions','competition_advancement_decisions','competition_criterion_lock_history','competition_lineups','competition_rule_amendments'] LOOP
   IF to_regclass('public.'||tab) IS NULL THEN RAISE EXCEPTION 'PRIVATE_TABLE_MISSING: %',tab;END IF;
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
   EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',tab);
   FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
     IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',tab,role_name); END IF;
   END LOOP;
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO service_role',tab);
 END LOOP;
 -- The canonical session view can expose private context; browser callers use
 -- enrolled HTTP endpoints. Revoke direct API-role access to this view too.
 IF to_regclass('public.v_competition_active_session') IS NOT NULL THEN
   REVOKE ALL ON v_competition_active_session FROM PUBLIC;
   FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
     IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON public.v_competition_active_session FROM %I',role_name);END IF;
   END LOOP;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
