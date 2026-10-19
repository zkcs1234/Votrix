-- Phase 3. Native setup/permission boundaries only. No scores or sessions.
-- Apply only after reviewed 103; no legacy backfill or payload rewrite.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN IF to_regprocedure('competition_add_entry(uuid,uuid,uuid,uuid,integer)') IS NULL OR to_regclass('competition_legacy_contexts') IS NULL THEN RAISE EXCEPTION 'MIGRATION_103_REQUIRED'; END IF; END $$;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS setup_revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS input_revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS official_child_rules_id uuid;

CREATE TABLE IF NOT EXISTS competition_child_configurations (
 competition_id uuid PRIMARY KEY,event_id uuid NOT NULL,configuration jsonb NOT NULL,
 FOREIGN KEY(competition_id,event_id) REFERENCES competitions(id,event_id)
);
CREATE TABLE IF NOT EXISTS competition_child_rounds (
 id uuid PRIMARY KEY,competition_id uuid NOT NULL,event_id uuid NOT NULL,
 definition jsonb NOT NULL,display_order integer NOT NULL CHECK(display_order>=0),
 FOREIGN KEY(competition_id,event_id) REFERENCES competitions(id,event_id),
 UNIQUE(id,competition_id,event_id),UNIQUE(competition_id,display_order) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS competition_child_criteria (
 id uuid PRIMARY KEY,competition_id uuid NOT NULL,event_id uuid NOT NULL,round_id uuid,
 definition jsonb NOT NULL,
 FOREIGN KEY(competition_id,event_id) REFERENCES competitions(id,event_id),
 FOREIGN KEY(round_id,competition_id,event_id) REFERENCES competition_child_rounds(id,competition_id,event_id),
 UNIQUE(id,competition_id,event_id)
);
CREATE TABLE IF NOT EXISTS competition_child_minors (
 id uuid PRIMARY KEY,competition_id uuid NOT NULL,event_id uuid NOT NULL,criterion_id uuid NOT NULL,
 definition jsonb NOT NULL,
 FOREIGN KEY(criterion_id,competition_id,event_id) REFERENCES competition_child_criteria(id,competition_id,event_id)
);
CREATE TABLE IF NOT EXISTS competition_child_judge_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),competition_id uuid NOT NULL,event_id uuid NOT NULL,
 participant_id uuid NOT NULL REFERENCES event_participants(id),round_id uuid,
 FOREIGN KEY(competition_id,event_id) REFERENCES competitions(id,event_id),
 FOREIGN KEY(round_id,competition_id,event_id) REFERENCES competition_child_rounds(id,competition_id,event_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS competition_child_assignment_context ON competition_child_judge_assignments(competition_id,participant_id,coalesce(round_id,'00000000-0000-0000-0000-000000000000'));
CREATE INDEX IF NOT EXISTS competition_child_assignment_participant ON competition_child_judge_assignments(participant_id);
CREATE TABLE IF NOT EXISTS competition_child_rule_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),competition_id uuid NOT NULL,event_id uuid NOT NULL,
 version integer NOT NULL,setup_revision bigint NOT NULL,input_revision bigint NOT NULL,
 configuration_snapshot jsonb NOT NULL,assignment_snapshot jsonb NOT NULL,participation_snapshot jsonb NOT NULL,
 frozen_by uuid NOT NULL REFERENCES users(id),frozen_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(competition_id,event_id) REFERENCES competitions(id,event_id),
 UNIQUE(competition_id,version),UNIQUE(id,competition_id,event_id)
);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='competitions'::regclass AND conname='competition_child_official_rules') THEN
 ALTER TABLE competitions ADD CONSTRAINT competition_child_official_rules FOREIGN KEY(official_child_rules_id,id,event_id) REFERENCES competition_child_rule_versions(id,competition_id,event_id);
END IF; END $$;

CREATE OR REPLACE FUNCTION competition_native_authority(p_event uuid,p_competition uuid,p_actor uuid,p_edit boolean)
RETURNS competitions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions;
BEGIN
 PERFORM competition_child_authority(p_event,p_actor,p_edit);
 SELECT * INTO c FROM competitions WHERE id=p_competition AND event_id=p_event FOR UPDATE;
 IF c.id IS NULL OR c.origin<>'native' THEN RAISE EXCEPTION 'NATIVE_COMPETITION_REQUIRED'; END IF;
 IF p_edit AND c.official_child_rules_id IS NOT NULL THEN RAISE EXCEPTION 'CHILD_RULES_FROZEN'; END IF;
 RETURN c;
END $$;

CREATE OR REPLACE FUNCTION competition_native_source_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE row_data jsonb; c competitions; ep event_participants;
BEGIN
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 SELECT * INTO c FROM competitions WHERE id=(row_data->>'competition_id')::uuid FOR UPDATE;
 IF c.origin='legacy' AND TG_TABLE_NAME='competition_entries' THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 IF c.id IS NULL OR c.origin<>'native' OR c.event_id IS DISTINCT FROM (row_data->>'event_id')::uuid THEN RAISE EXCEPTION 'NATIVE_COMPETITION_REQUIRED'; END IF;
 IF c.official_child_rules_id IS NOT NULL THEN RAISE EXCEPTION 'CHILD_RULES_FROZEN'; END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)->>'competition_id') IS DISTINCT FROM (to_jsonb(OLD)->>'competition_id') OR (to_jsonb(NEW)->>'event_id') IS DISTINCT FROM (to_jsonb(OLD)->>'event_id') OR (to_jsonb(NEW)->>'id') IS DISTINCT FROM (to_jsonb(OLD)->>'id')) THEN RAISE EXCEPTION 'CHILD_IDENTITY_IMMUTABLE'; END IF;
 IF TG_TABLE_NAME='competition_child_judge_assignments' AND TG_OP<>'DELETE' THEN
   SELECT * INTO ep FROM event_participants WHERE id=NEW.participant_id;
   IF ep.event_id IS DISTINCT FROM c.event_id OR ep.participant_type::text<>'COMPETITION_JUDGE' OR NOT ep.is_active OR ep.judge_role::text NOT IN('judge','head_judge') OR NOT EXISTS(SELECT 1 FROM users WHERE id=ep.user_id AND account_status::text='active' AND role::text IN('participant','voter')) THEN RAISE EXCEPTION 'JUDGE_ASSIGNMENT_FORBIDDEN'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NEW; END IF;
 UPDATE competitions SET setup_revision=setup_revision+1,input_revision=input_revision+1 WHERE id=c.id;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['competition_entries','competition_child_configurations','competition_child_rounds','competition_child_criteria','competition_child_minors','competition_child_judge_assignments'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||tab)::regclass AND tgname='competition_native_source_guard') THEN EXECUTE format('CREATE TRIGGER competition_native_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION competition_native_source_guard()',tab); END IF;
 END LOOP;
END $$;

-- Shared enrollment/account changes invalidate only genuinely dependent native
-- children. Legacy parent revision behavior remains in its existing triggers.
CREATE OR REPLACE FUNCTION competition_native_judge_dependency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE competitions c SET input_revision=input_revision+1
 WHERE c.origin='native' AND EXISTS(SELECT 1 FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id WHERE a.competition_id=c.id AND
 CASE WHEN TG_TABLE_NAME='users' THEN ep.user_id=NEW.id ELSE ep.id=NEW.id END);
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION competition_native_entry_dependency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE competitions c SET input_revision=input_revision+1 WHERE c.origin='native' AND EXISTS(SELECT 1 FROM competition_entries e WHERE e.competition_id=c.id AND e.contestant_id=NEW.id);
 RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='users'::regclass AND tgname='competition_native_account_dependency') THEN CREATE TRIGGER competition_native_account_dependency AFTER UPDATE OF account_status,role ON users FOR EACH ROW WHEN(OLD.account_status IS DISTINCT FROM NEW.account_status OR OLD.role IS DISTINCT FROM NEW.role) EXECUTE FUNCTION competition_native_judge_dependency(); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='event_participants'::regclass AND tgname='competition_native_enrollment_dependency') THEN CREATE TRIGGER competition_native_enrollment_dependency AFTER UPDATE OF is_active,judge_role,user_id,event_id,participant_type ON event_participants FOR EACH ROW WHEN(OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.judge_role IS DISTINCT FROM NEW.judge_role OR OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.event_id IS DISTINCT FROM NEW.event_id OR OLD.participant_type IS DISTINCT FROM NEW.participant_type) EXECUTE FUNCTION competition_native_judge_dependency(); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='competition_contestants'::regclass AND tgname='competition_native_entry_dependency') THEN CREATE TRIGGER competition_native_entry_dependency AFTER UPDATE ON competition_contestants FOR EACH ROW WHEN(OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION competition_native_entry_dependency(); END IF;
END $$;

CREATE OR REPLACE FUNCTION competition_validate_native_configuration(p_event uuid,p_competition uuid,p_config jsonb,p_complete boolean)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r jsonb; criterion jsonb; minor jsonb; penalty jsonb; method text; ids uuid[]; round_ids uuid[]; scope uuid; total numeric; ordinal integer:=0;
BEGIN
 IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' OR p_config->>'structure' IS NULL OR p_config->>'structure' NOT IN('single','multiple') OR jsonb_typeof(p_config->'rounds') IS DISTINCT FROM 'array' OR jsonb_typeof(p_config->'criteria') IS DISTINCT FROM 'array' OR jsonb_typeof(p_config->'scoringConfig') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_NATIVE_CONFIGURATION'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_config->'scoringConfig') k WHERE k NOT IN('calculationMethod','tiePolicy','decimalPlaces','dropHighest','dropLowest','deductionRules','manualBasis')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_SCORING_OPTION'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_config) k WHERE k NOT IN('structure','rounds','criteria','scoringConfig')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_CONFIGURATION_FIELD'; END IF;
 method:=p_config->'scoringConfig'->>'calculationMethod';
 IF method IS NULL OR method NOT IN('weighted_average','sum','rank_based','highest_score','lowest_removal','manual','undecided') OR p_complete AND method='undecided' THEN RAISE EXCEPTION 'UNSUPPORTED_CALCULATION_METHOD'; END IF;
 IF coalesce(p_config->'scoringConfig'->>'tiePolicy','shared') NOT IN('shared','highest_criterion') OR method='rank_based' AND coalesce(p_config->'scoringConfig'->>'tiePolicy','shared')<>'shared' THEN RAISE EXCEPTION 'UNSUPPORTED_TIE_POLICY'; END IF;
 IF coalesce((p_config->'scoringConfig'->>'decimalPlaces')::numeric,2) NOT BETWEEN 0 AND 6 OR coalesce((p_config->'scoringConfig'->>'decimalPlaces')::numeric,2)<>trunc(coalesce((p_config->'scoringConfig'->>'decimalPlaces')::numeric,2)) THEN RAISE EXCEPTION 'INVALID_PRECISION'; END IF;
 IF method='manual' AND p_complete AND length(btrim(coalesce(p_config->'scoringConfig'->>'manualBasis','')))=0 THEN RAISE EXCEPTION 'MANUAL_BASIS_REQUIRED'; END IF;
 IF p_config->'scoringConfig' ? 'manualBasis' AND jsonb_typeof(p_config->'scoringConfig'->'manualBasis') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'INVALID_MANUAL_BASIS'; END IF;
 IF coalesce((p_config->'scoringConfig'->>'dropHighest')::numeric,0)<0 OR coalesce((p_config->'scoringConfig'->>'dropLowest')::numeric,0)<0 OR coalesce((p_config->'scoringConfig'->>'dropHighest')::numeric,0)<>trunc(coalesce((p_config->'scoringConfig'->>'dropHighest')::numeric,0)) OR coalesce((p_config->'scoringConfig'->>'dropLowest')::numeric,0)<>trunc(coalesce((p_config->'scoringConfig'->>'dropLowest')::numeric,0)) THEN RAISE EXCEPTION 'INVALID_REMOVAL_COUNTS'; END IF;
 IF p_config->>'structure'='single' AND jsonb_array_length(p_config->'rounds')<>0 OR p_config->>'structure'='multiple' AND jsonb_array_length(p_config->'rounds')<2 THEN RAISE EXCEPTION 'INVALID_SCORING_STRUCTURE'; END IF;
 SELECT array_agg((v->>'id')::uuid) INTO round_ids FROM jsonb_array_elements(p_config->'rounds') v;
 IF cardinality(round_ids)<>(SELECT count(DISTINCT x) FROM unnest(round_ids) x) THEN RAISE EXCEPTION 'DUPLICATE_ROUND_ID'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_config->'rounds') LOOP
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(r) k WHERE k NOT IN('id','name','displayOrder','progression','weight','advancementType','advancementValue','nextRoundId','entryIds','calculationMethod')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_ROUND_FIELD'; END IF;
   IF r->>'id' IS NULL OR length(btrim(coalesce(r->>'name','')))=0 OR (r->>'displayOrder')::integer IS DISTINCT FROM ordinal THEN RAISE EXCEPTION 'INVALID_ROUND_ORDER'; END IF;
   IF EXISTS(SELECT 1 FROM competition_child_rounds WHERE id=(r->>'id')::uuid AND competition_id<>p_competition) THEN RAISE EXCEPTION 'CROSS_COMPETITION_ROUND'; END IF;
   IF r->>'progression'='weighted' AND (r->>'weight' IS NULL OR (r->>'weight')::numeric NOT BETWEEN 0.000001 AND 100) THEN RAISE EXCEPTION 'INVALID_ROUND_CONTRIBUTION'; END IF;
   IF r ? 'calculationMethod' AND r->>'calculationMethod'<>method THEN RAISE EXCEPTION 'INCOMPATIBLE_ROUND_METHODS'; END IF;
   IF coalesce(r->>'progression','back_to_zero') NOT IN('back_to_zero','weighted','carry_forward') THEN RAISE EXCEPTION 'UNSUPPORTED_CARRY_POLICY'; END IF;
   IF coalesce(r->>'progression','back_to_zero')<>'back_to_zero' AND method IN('rank_based','manual') THEN RAISE EXCEPTION 'ORDINAL_CARRY_REQUIRES_NUMERIC_BASIS'; END IF;
   IF coalesce(r->>'advancementType','none') NOT IN('none','top_n','top_percent','threshold','manual') THEN RAISE EXCEPTION 'INVALID_ADVANCEMENT'; END IF;
   IF ordinal=jsonb_array_length(p_config->'rounds')-1 AND (coalesce(r->>'advancementType','none')<>'none' OR r->>'nextRoundId' IS NOT NULL) THEN RAISE EXCEPTION 'FINAL_HAS_NO_ADVANCEMENT'; END IF;
   IF r->>'nextRoundId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') n WHERE n->>'id'=r->>'nextRoundId' AND (n->>'displayOrder')::integer>ordinal) THEN RAISE EXCEPTION 'CROSS_COMPETITION_NEXT_ROUND'; END IF;
   IF r->>'advancementType'='top_n' AND (coalesce((r->>'advancementValue')::numeric,0)<1 OR (r->>'advancementValue')::numeric<>trunc((r->>'advancementValue')::numeric)) OR r->>'advancementType'='top_percent' AND coalesce((r->>'advancementValue')::numeric,0) NOT BETWEEN 0.000001 AND 100 THEN RAISE EXCEPTION 'INVALID_ADVANCEMENT_VALUE'; END IF;
   IF r->>'advancementType'='threshold' AND (method IN('rank_based','manual') OR r->>'advancementValue' IS NULL OR (r->>'advancementValue')::numeric<0) THEN RAISE EXCEPTION 'INCOMPATIBLE_THRESHOLD'; END IF;
   IF r ? 'entryIds' THEN
     IF jsonb_typeof(r->'entryIds')<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->'entryIds') e WHERE NOT EXISTS(SELECT 1 FROM competition_entries WHERE id=e::uuid AND event_id=p_event AND competition_id=p_competition)) THEN RAISE EXCEPTION 'CROSS_COMPETITION_ROUND_ENTRY'; END IF;
   END IF;
   ordinal:=ordinal+1;
 END LOOP;
 FOR criterion IN SELECT value FROM jsonb_array_elements(p_config->'criteria') LOOP
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(criterion) k WHERE k NOT IN('id','name','roundId','percentage','minScore','maxScore','minorCriteria')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_CRITERION_FIELD'; END IF;
   IF criterion->>'id' IS NULL OR length(btrim(coalesce(criterion->>'name','')))=0 OR jsonb_typeof(criterion->'percentage') IS DISTINCT FROM 'number' OR (criterion->>'percentage')::numeric NOT BETWEEN 0.000001 AND 100 THEN RAISE EXCEPTION 'INVALID_MAJOR_CRITERION'; END IF;
   IF EXISTS(SELECT 1 FROM competition_child_criteria WHERE id=(criterion->>'id')::uuid AND competition_id<>p_competition) THEN RAISE EXCEPTION 'CROSS_COMPETITION_CRITERION'; END IF;
   scope:=nullif(criterion->>'roundId','')::uuid;
   IF p_config->>'structure'='single' AND scope IS NOT NULL OR p_config->>'structure'='multiple' AND (scope IS NULL OR NOT scope=ANY(round_ids)) THEN RAISE EXCEPTION 'CROSS_COMPETITION_CRITERION_ROUND'; END IF;
   IF criterion ? 'minorCriteria' AND jsonb_typeof(criterion->'minorCriteria')<>'array' THEN RAISE EXCEPTION 'INVALID_MINOR_CRITERIA'; END IF;
   FOR minor IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_array_length(coalesce(criterion->'minorCriteria','[]'))>0 THEN criterion->'minorCriteria' ELSE jsonb_build_array(criterion) END) LOOP
     IF minor<>criterion AND EXISTS(SELECT 1 FROM jsonb_object_keys(minor) k WHERE k NOT IN('id','name','minScore','maxScore')) THEN RAISE EXCEPTION 'MINORS_USE_EXISTING_EQUAL_AVERAGE'; END IF;
     IF jsonb_typeof(minor->'minScore') IS DISTINCT FROM 'number' OR jsonb_typeof(minor->'maxScore') IS DISTINCT FROM 'number' OR (minor->>'maxScore')::numeric<=0 OR (minor->>'minScore')::numeric>=(minor->>'maxScore')::numeric THEN RAISE EXCEPTION 'INVALID_SCORE_RANGE'; END IF;
     IF minor<>criterion AND (minor->>'id' IS NULL OR length(btrim(coalesce(minor->>'name','')))=0 OR minor ? 'weight' OR minor ? 'percentage') THEN RAISE EXCEPTION 'MINORS_USE_EXISTING_EQUAL_AVERAGE'; END IF;
     IF minor<>criterion AND EXISTS(SELECT 1 FROM competition_child_minors WHERE id=(minor->>'id')::uuid AND competition_id<>p_competition) THEN RAISE EXCEPTION 'CROSS_COMPETITION_MINOR'; END IF;
   END LOOP;
 END LOOP;
 SELECT array_agg((v->>'id')::uuid) INTO ids FROM jsonb_array_elements(p_config->'criteria') v;
 IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'DUPLICATE_CRITERION_ID'; END IF;
 FOR scope IN SELECT unnest(round_ids) UNION ALL SELECT NULL::uuid WHERE p_config->>'structure'='single' LOOP
   SELECT coalesce(sum((v->>'percentage')::numeric),0) INTO total FROM jsonb_array_elements(p_config->'criteria') v WHERE nullif(v->>'roundId','')::uuid IS NOT DISTINCT FROM scope;
   IF total>100.001 OR p_complete AND abs(total-100)>0.001 THEN RAISE EXCEPTION 'SCOPE_WEIGHT_MUST_TOTAL_100'; END IF;
 END LOOP;
 FOR penalty IN SELECT value FROM jsonb_array_elements(coalesce(p_config->'scoringConfig'->'deductionRules','[]')) LOOP
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(penalty) k WHERE k NOT IN('id','description','amount','units','roundId','criteriaId')) THEN RAISE EXCEPTION 'UNSUPPORTED_NATIVE_DEDUCTION_FIELD'; END IF;
   IF method='manual' OR jsonb_typeof(penalty->'amount') IS DISTINCT FROM 'number' OR (penalty->>'amount')::numeric<=0 OR length(btrim(coalesce(penalty->>'id','')))=0 OR length(btrim(coalesce(penalty->>'description','')))=0 OR penalty->>'units' IS DISTINCT FROM (CASE WHEN method='rank_based' THEN 'placements' ELSE 'points' END) THEN RAISE EXCEPTION 'INVALID_DEDUCTION_RULE'; END IF;
   IF penalty->>'roundId' IS NOT NULL AND NOT (penalty->>'roundId')::uuid=ANY(coalesce(round_ids,'{}')) THEN RAISE EXCEPTION 'CROSS_COMPETITION_DEDUCTION_ROUND'; END IF;
   IF penalty->>'criteriaId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'criteria') v WHERE v->>'id'=penalty->>'criteriaId' AND (penalty->>'roundId' IS NULL OR v->>'roundId'=penalty->>'roundId')) THEN RAISE EXCEPTION 'CROSS_COMPETITION_DEDUCTION_CRITERION'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_array_elements(coalesce(p_config->'scoringConfig'->'deductionRules','[]')))<>(SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(coalesce(p_config->'scoringConfig'->'deductionRules','[]')) v) THEN RAISE EXCEPTION 'DUPLICATE_DEDUCTION_RULE_ID'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') rd WHERE rd->>'progression'='weighted') AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') rd WHERE coalesce(rd->>'progression','back_to_zero')<>'weighted') THEN RAISE EXCEPTION 'INCOMPATIBLE_ROUND_CONTRIBUTIONS'; END IF;
 -- Numeric contributions retain the existing percentage interpretation; rank
 -- aggregates must never be multiplied as percentage scores.
 IF p_complete AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') rd WHERE rd->>'progression'='weighted') AND (SELECT coalesce(sum((rd->>'weight')::numeric),0) FROM jsonb_array_elements(p_config->'rounds') rd WHERE rd->>'progression'='weighted')<>100 THEN RAISE EXCEPTION 'ROUND_CONTRIBUTIONS_MUST_TOTAL_100'; END IF;
END $$;

CREATE OR REPLACE FUNCTION competition_save_native_configuration(p_event uuid,p_competition uuid,p_actor uuid,p_revision bigint,p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; r jsonb; criterion jsonb; minor jsonb;
BEGIN
 c:=competition_native_authority(p_event,p_competition,p_actor,true);
 IF p_revision IS DISTINCT FROM c.setup_revision THEN RAISE EXCEPTION 'CHILD_SETUP_REVISION_CONFLICT'; END IF;
 PERFORM competition_validate_native_configuration(p_event,p_competition,p_config,false);
 IF EXISTS(SELECT 1 FROM competition_child_configurations WHERE competition_id=c.id AND configuration=p_config) THEN RETURN jsonb_build_object('setupRevision',c.setup_revision,'inputRevision',c.input_revision); END IF;
 -- Removing a round with assignments is rejected by its FK. Replacement is
 -- draft-only, transactional, and never touches scores or historical tables.
 DELETE FROM competition_child_minors WHERE competition_id=c.id;
 DELETE FROM competition_child_criteria WHERE competition_id=c.id;
 DELETE FROM competition_child_rounds WHERE competition_id=c.id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') rd WHERE rd->>'id'=competition_child_rounds.id::text);
 FOR r IN SELECT value FROM jsonb_array_elements(p_config->'rounds') LOOP
 INSERT INTO competition_child_rounds(id,competition_id,event_id,definition,display_order) VALUES((r->>'id')::uuid,c.id,p_event,r,(r->>'displayOrder')::integer) ON CONFLICT(id) DO UPDATE SET definition=EXCLUDED.definition,display_order=EXCLUDED.display_order;
 END LOOP;
 FOR criterion IN SELECT value FROM jsonb_array_elements(p_config->'criteria') LOOP
 INSERT INTO competition_child_criteria(id,competition_id,event_id,round_id,definition) VALUES((criterion->>'id')::uuid,c.id,p_event,nullif(criterion->>'roundId','')::uuid,criterion);
 FOR minor IN SELECT value FROM jsonb_array_elements(coalesce(criterion->'minorCriteria','[]')) LOOP
 INSERT INTO competition_child_minors(id,competition_id,event_id,criterion_id,definition) VALUES((minor->>'id')::uuid,c.id,p_event,(criterion->>'id')::uuid,minor);
 END LOOP; END LOOP;
 INSERT INTO competition_child_configurations(competition_id,event_id,configuration) VALUES(c.id,p_event,p_config) ON CONFLICT(competition_id) DO UPDATE SET configuration=EXCLUDED.configuration;
 SELECT * INTO c FROM competitions WHERE id=c.id;
 RETURN jsonb_build_object('setupRevision',c.setup_revision,'inputRevision',c.input_revision);
END $$;

CREATE OR REPLACE FUNCTION competition_assign_native_judge(p_event uuid,p_competition uuid,p_actor uuid,p_participant uuid,p_round uuid,p_remove boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; a competition_child_judge_assignments;
BEGIN
 c:=competition_native_authority(p_event,p_competition,p_actor,true);
 IF p_remove THEN DELETE FROM competition_child_judge_assignments WHERE competition_id=c.id AND participant_id=p_participant AND round_id IS NOT DISTINCT FROM p_round RETURNING * INTO a;
 ELSE SELECT * INTO a FROM competition_child_judge_assignments WHERE competition_id=c.id AND participant_id=p_participant AND round_id IS NOT DISTINCT FROM p_round;
 IF a.id IS NULL THEN INSERT INTO competition_child_judge_assignments(competition_id,event_id,participant_id,round_id) VALUES(c.id,p_event,p_participant,p_round) RETURNING * INTO a; END IF;
 END IF;
 RETURN coalesce(to_jsonb(a),'{}');
END $$;

CREATE OR REPLACE FUNCTION competition_native_judge_context(p_event uuid,p_competition uuid,p_judge uuid,p_round uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; config jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM events WHERE id=p_event AND event_type::text IN('competition_scoring','pageant')) THEN RAISE EXCEPTION 'SCORING_CONTEXT_FORBIDDEN'; END IF;
 SELECT * INTO c FROM competitions WHERE id=p_competition AND event_id=p_event AND origin='native';
 SELECT configuration INTO config FROM competition_child_configurations WHERE competition_id=c.id;
 IF c.id IS NULL OR config IS NULL OR (config->>'structure'='multiple' AND NOT EXISTS(SELECT 1 FROM competition_child_rounds WHERE id=p_round AND competition_id=c.id)) OR (config->>'structure'='single' AND p_round IS NOT NULL) THEN RAISE EXCEPTION 'SCORING_CONTEXT_FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id JOIN users u ON u.id=ep.user_id WHERE a.competition_id=c.id AND (a.round_id IS NULL OR a.round_id=p_round) AND ep.event_id=p_event AND ep.user_id=p_judge AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.is_active AND ep.judge_role::text IN('judge','head_judge') AND u.account_status::text='active' AND u.role::text IN('participant','voter')) THEN RAISE EXCEPTION 'JUDGE_CONTEXT_FORBIDDEN'; END IF;
 RETURN jsonb_build_object('eventId',p_event,'competitionId',c.id,'roundId',p_round,'setupRevision',c.setup_revision,'inputRevision',c.input_revision,'rulesVersion',c.official_child_rules_id,'rulesCurrent',EXISTS(SELECT 1 FROM competition_child_rule_versions v WHERE v.id=c.official_child_rules_id AND v.setup_revision=c.setup_revision AND v.input_revision=c.input_revision),'scoringAvailable',false);
END $$;

CREATE OR REPLACE FUNCTION competition_freeze_native_rules(p_event uuid,p_competition uuid,p_actor uuid,p_setup bigint,p_input bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; config jsonb; rule competition_child_rule_versions; scope uuid; panel integer;
BEGIN
 c:=competition_native_authority(p_event,p_competition,p_actor,true);
 IF p_setup IS DISTINCT FROM c.setup_revision OR p_input IS DISTINCT FROM c.input_revision THEN RAISE EXCEPTION 'CHILD_REVISION_CONFLICT'; END IF;
 SELECT configuration INTO config FROM competition_child_configurations WHERE competition_id=c.id;
 PERFORM competition_validate_native_configuration(p_event,c.id,config,true);
 IF NOT EXISTS(SELECT 1 FROM competition_entries WHERE competition_id=c.id) THEN RAISE EXCEPTION 'CHILD_ENTRIES_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id JOIN users u ON u.id=ep.user_id WHERE a.competition_id=c.id AND (ep.event_id IS DISTINCT FROM p_event OR ep.participant_type::text IS DISTINCT FROM 'COMPETITION_JUDGE' OR ep.is_active IS DISTINCT FROM true OR coalesce(ep.judge_role::text,'') NOT IN('judge','head_judge') OR u.account_status::text IS DISTINCT FROM 'active' OR u.role::text NOT IN('participant','voter'))) THEN RAISE EXCEPTION 'INACTIVE_CHILD_JUDGE_REQUIRES_REVIEW'; END IF;
 FOR scope IN SELECT id FROM competition_child_rounds WHERE competition_id=c.id UNION ALL SELECT NULL::uuid WHERE config->>'structure'='single' LOOP
 SELECT count(DISTINCT ep.user_id) INTO panel FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id JOIN users u ON u.id=ep.user_id WHERE a.competition_id=c.id AND (a.round_id IS NULL OR a.round_id=scope) AND ep.event_id=p_event AND ep.participant_type::text='COMPETITION_JUDGE' AND ep.is_active AND ep.judge_role::text IN('judge','head_judge') AND u.account_status::text='active' AND u.role::text IN('participant','voter');
 IF panel=0 THEN RAISE EXCEPTION 'EXPLICIT_CHILD_JUDGES_REQUIRED'; END IF;
 IF config->'scoringConfig'->>'calculationMethod'='lowest_removal' AND panel<=coalesce((config->'scoringConfig'->>'dropLowest')::integer,0)+coalesce((config->'scoringConfig'->>'dropHighest')::integer,0) THEN RAISE EXCEPTION 'REMOVAL_EXHAUSTS_CHILD_PANEL'; END IF;
 END LOOP;
 -- Sum/carry arithmetic is only compatible when the explicit judge panels
 -- match across rounds. Different panels require a future normalization rule.
 IF config->'scoringConfig'->>'calculationMethod'='sum' AND EXISTS(SELECT 1 FROM jsonb_array_elements(config->'rounds') r WHERE coalesce(r->>'progression','back_to_zero')<>'back_to_zero') AND
 (SELECT count(DISTINCT panels.panel) FROM (SELECT r.id,coalesce(string_agg(DISTINCT a.participant_id::text,',' ORDER BY a.participant_id::text),'') AS panel FROM competition_child_rounds r LEFT JOIN competition_child_judge_assignments a ON a.competition_id=c.id AND (a.round_id IS NULL OR a.round_id=r.id) WHERE r.competition_id=c.id GROUP BY r.id) panels)>1 THEN RAISE EXCEPTION 'SUM_CARRY_REQUIRES_COMPATIBLE_PANELS'; END IF;
 INSERT INTO competition_child_rule_versions(competition_id,event_id,version,setup_revision,input_revision,configuration_snapshot,assignment_snapshot,participation_snapshot,frozen_by)
 VALUES(c.id,p_event,coalesce((SELECT max(version)+1 FROM competition_child_rule_versions WHERE competition_id=c.id),1),c.setup_revision,c.input_revision,config,
 (SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('judgeId',ep.user_id,'judgeRole',ep.judge_role) ORDER BY a.id) FROM competition_child_judge_assignments a JOIN event_participants ep ON ep.id=a.participant_id WHERE a.competition_id=c.id),
 (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM competition_entries e WHERE competition_id=c.id),p_actor) RETURNING * INTO rule;
 UPDATE competitions SET official_child_rules_id=rule.id WHERE id=c.id;
 RETURN to_jsonb(rule);
END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='competition_child_rule_versions'::regclass AND tgname='competition_child_rules_immutable') THEN CREATE TRIGGER competition_child_rules_immutable BEFORE UPDATE OR DELETE ON competition_child_rule_versions FOR EACH ROW EXECUTE FUNCTION competition_immutable_rules(); END IF; END $$;

CREATE OR REPLACE FUNCTION competition_native_foundation(p_event uuid,p_competition uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; config jsonb; rule competition_child_rule_versions;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM events WHERE id=p_event AND event_type::text IN('competition_scoring','pageant')) THEN RAISE EXCEPTION 'NATIVE_COMPETITION_REQUIRED'; END IF;
 IF NOT competition_owns_event(p_event,p_actor) OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND account_status::text='active' AND role::text='organizer') THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
 SELECT * INTO c FROM competitions WHERE id=p_competition AND event_id=p_event AND origin='native';
 IF c.id IS NULL THEN RAISE EXCEPTION 'NATIVE_COMPETITION_REQUIRED'; END IF;
 SELECT configuration INTO config FROM competition_child_configurations WHERE competition_id=c.id;
 SELECT * INTO rule FROM competition_child_rule_versions WHERE id=c.official_child_rules_id;
 RETURN jsonb_build_object('competition',to_jsonb(c),'configuration',config,'assignments',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM competition_child_judge_assignments a WHERE competition_id=c.id),'[]'),'rules',CASE WHEN rule.id IS NULL THEN NULL ELSE to_jsonb(rule) END,'rulesCurrent',rule.id IS NOT NULL AND rule.setup_revision=c.setup_revision AND rule.input_revision=c.input_revision,'scoringAvailable',false);
END $$;

CREATE OR REPLACE FUNCTION competition_native_identity_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.origin='native' THEN
 IF OLD.official_child_rules_id IS NOT NULL AND (NEW.official_child_rules_id IS DISTINCT FROM OLD.official_child_rules_id OR NEW.name IS DISTINCT FROM OLD.name OR NEW.competition_type IS DISTINCT FROM OLD.competition_type) THEN RAISE EXCEPTION 'CHILD_RULES_FROZEN'; END IF;
 IF NEW.name IS DISTINCT FROM OLD.name OR NEW.competition_type IS DISTINCT FROM OLD.competition_type THEN NEW.setup_revision:=OLD.setup_revision+1;NEW.input_revision:=OLD.input_revision+1; END IF;
 IF NEW.setup_revision<OLD.setup_revision OR NEW.input_revision<OLD.input_revision THEN RAISE EXCEPTION 'CHILD_REVISION_MUST_NOT_REWIND'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='competitions'::regclass AND tgname='competition_native_identity_guard') THEN CREATE TRIGGER competition_native_identity_guard BEFORE UPDATE ON competitions FOR EACH ROW EXECUTE FUNCTION competition_native_identity_guard(); END IF; END $$;

-- Supersede only the native participation branch. Legacy entry behavior stays
-- parent-revision-based; native insertion is tracked by its scoped trigger.
CREATE OR REPLACE FUNCTION competition_add_entry(p_event uuid,p_actor uuid,p_competition uuid,p_entry uuid,p_number integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c competitions; e competition_entries; assigned integer;
BEGIN
 PERFORM competition_child_authority(p_event,p_actor,true);
 SELECT * INTO c FROM competitions WHERE id=p_competition AND event_id=p_event FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'CHILD_COMPETITION_FORBIDDEN'; END IF;
 IF c.origin='native' AND c.official_child_rules_id IS NOT NULL THEN RAISE EXCEPTION 'CHILD_RULES_FROZEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM competition_contestants WHERE id=p_entry AND event_id=p_event) THEN RAISE EXCEPTION 'CROSS_EVENT_PARTICIPATION_FORBIDDEN'; END IF;
 IF p_number<=0 THEN RAISE EXCEPTION 'INVALID_ENTRY_NUMBER'; END IF;
 SELECT * INTO e FROM competition_entries WHERE competition_id=c.id AND contestant_id=p_entry;
 IF e.id IS NOT NULL THEN IF p_number IS NOT NULL AND p_number<>e.entry_number THEN RAISE EXCEPTION 'PARTICIPATION_REQUEST_CONFLICT'; END IF; RETURN to_jsonb(e); END IF;
 SELECT coalesce(p_number,coalesce(max(entry_number),0)+1) INTO assigned FROM competition_entries WHERE competition_id=c.id;
 INSERT INTO competition_entries(event_id,competition_id,contestant_id,entry_number) VALUES(p_event,c.id,p_entry,assigned) RETURNING * INTO e;
 IF c.origin='legacy' THEN UPDATE events SET competition_setup_revision=competition_setup_revision+1,competition_input_revision=competition_input_revision+1 WHERE id=p_event; END IF;
 RETURN to_jsonb(e);
END $$;

DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['competition_child_configurations','competition_child_rounds','competition_child_criteria','competition_child_minors','competition_child_judge_assignments','competition_child_rule_versions'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
 EXECUTE format('GRANT SELECT ON public.%I TO service_role',tab);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION competition_native_authority(uuid,uuid,uuid,boolean),competition_validate_native_configuration(uuid,uuid,jsonb,boolean),competition_save_native_configuration(uuid,uuid,uuid,bigint,jsonb),competition_assign_native_judge(uuid,uuid,uuid,uuid,uuid,boolean),competition_native_judge_context(uuid,uuid,uuid,uuid),competition_freeze_native_rules(uuid,uuid,uuid,bigint,bigint),competition_native_foundation(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_save_native_configuration(uuid,uuid,uuid,bigint,jsonb),competition_assign_native_judge(uuid,uuid,uuid,uuid,uuid,boolean),competition_native_judge_context(uuid,uuid,uuid,uuid),competition_freeze_native_rules(uuid,uuid,uuid,bigint,bigint),competition_native_foundation(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
