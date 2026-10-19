-- Phase 1 metadata inventory. SELECT only; execute in a READ ONLY transaction.
-- This is NOT a migration, repair, or an applied-migration ledger.
WITH relations AS (
 SELECT c.oid,c.relname,c.relrowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
 AND (c.relname LIKE 'competition\_%' ESCAPE '\' OR c.relname IN ('events','event_participants','competitions','users'))
), functions AS (
 SELECT p.*,pg_get_function_identity_arguments(p.oid) AS arguments
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'competition\_%' ESCAPE '\'
)
SELECT jsonb_build_object(
 'tables',coalesce((SELECT jsonb_object_agg(relname,jsonb_build_object('columns',(
   SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a
   WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped))) FROM relations r),'{}'),
 'functions',coalesce((SELECT jsonb_agg(DISTINCT proname ORDER BY proname) FROM functions),'[]'),
 'metadata',jsonb_build_object(
   'source','postgresql_catalog',
   'constraints',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'table',r.relname,'name',c.conname,'type',c.contype,'validated',c.convalidated,
     'target',(SELECT relname FROM pg_class WHERE oid=c.confrelid),
     'columns',(SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.conkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num),
     'targetColumns',(SELECT jsonb_agg(a.attname ORDER BY k.n) FROM unnest(c.confkey) WITH ORDINALITY k(num,n) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num),
     'definition',pg_get_constraintdef(c.oid)) ORDER BY r.relname,c.conname)
     FROM pg_constraint c JOIN relations r ON r.oid=c.conrelid),'[]'),
   'indexes',coalesce((SELECT jsonb_agg(jsonb_build_object('table',r.relname,'name',i.relname,'valid',x.indisvalid,'unique',x.indisunique,'definition',pg_get_indexdef(i.oid)) ORDER BY r.relname,i.relname)
     FROM pg_index x JOIN relations r ON r.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid),'[]'),
   'triggers',coalesce((SELECT jsonb_agg(jsonb_build_object('table',r.relname,'name',t.tgname,'enabled',t.tgenabled,'function',p.proname,'definition',pg_get_triggerdef(t.oid)) ORDER BY r.relname,t.tgname)
     FROM pg_trigger t JOIN relations r ON r.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal),'[]'),
   'functionDefinitions',coalesce((SELECT jsonb_agg(jsonb_build_object('name',proname,'arguments',arguments,'argumentTypes',oidvectortypes(proargtypes),'returnType',pg_get_function_result(oid),'definitionMd5',md5(pg_get_functiondef(oid)),
     'securityDefiner',prosecdef,'settings',proconfig,
     'anonExecute',CASE WHEN to_regrole('anon') IS NOT NULL THEN has_function_privilege('anon',oid,'EXECUTE') ELSE false END,
     'authenticatedExecute',CASE WHEN to_regrole('authenticated') IS NOT NULL THEN has_function_privilege('authenticated',oid,'EXECUTE') ELSE false END,
     'serviceExecute',CASE WHEN to_regrole('service_role') IS NOT NULL THEN has_function_privilege('service_role',oid,'EXECUTE') ELSE false END)
     ORDER BY proname,arguments) FROM functions),'[]'),
   'privateTables',coalesce((SELECT jsonb_agg(jsonb_build_object('table',r.relname,'rls',r.relrowsecurity,
     'anonAccess',CASE WHEN to_regrole('anon') IS NOT NULL THEN has_table_privilege('anon',r.oid,'SELECT,INSERT,UPDATE,DELETE') ELSE false END,
     'authenticatedAccess',CASE WHEN to_regrole('authenticated') IS NOT NULL THEN has_table_privilege('authenticated',r.oid,'SELECT,INSERT,UPDATE,DELETE') ELSE false END,
     'serviceSelect',CASE WHEN to_regrole('service_role') IS NOT NULL THEN has_table_privilege('service_role',r.oid,'SELECT') ELSE false END) || CASE WHEN r.relname IN('competition_child_sessions','competition_child_score_drafts','competition_child_submissions','competition_child_submission_heads','competition_child_scoring_audit','competition_child_review_policies','competition_child_deduction_decisions','competition_child_deduction_reviews','competition_child_calculations','competition_child_calculation_transitions','competition_child_qualifications','competition_child_publications') THEN jsonb_build_object('serviceWrite',CASE WHEN to_regrole('service_role') IS NOT NULL THEN has_table_privilege('service_role',r.oid,'INSERT,UPDATE,DELETE') ELSE false END) ELSE '{}'::jsonb END
     ORDER BY r.relname) FROM relations r WHERE r.relname IN (
       'competition_scores','competition_session_judge_scores','competition_result_calculations','competition_deductions',
       'competition_rule_versions','competition_judge_drafts','competition_round_submissions','competition_eligibility_decisions',
       'competition_advancement_decisions','competition_criterion_lock_history','competition_lineups','competition_rule_amendments','competition_create_requests',
       'competitions','competition_legacy_contexts','competition_entries',
       'competition_child_configurations','competition_child_rounds','competition_child_criteria','competition_child_minors','competition_child_judge_assignments','competition_child_rule_versions',
       'competition_child_sessions','competition_child_score_drafts','competition_child_submissions','competition_child_submission_heads','competition_child_scoring_audit',
       'competition_child_review_policies','competition_child_deduction_decisions','competition_child_deduction_reviews','competition_child_calculations','competition_child_calculation_transitions','competition_child_qualifications','competition_child_publications')),'[]'),
   'policies',coalesce((SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check) ORDER BY tablename,policyname)
     FROM pg_policies WHERE schemaname='public' AND tablename IN (SELECT relname FROM relations)),'[]')
  )
);
