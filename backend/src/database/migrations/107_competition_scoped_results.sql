-- Phase 6 only. Immutable publication ledger and privacy-gated reporting.
-- No public grant to source tables, recalculation or historical backfill.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN IF to_regprocedure('competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean)') IS NULL THEN RAISE EXCEPTION 'MIGRATION_106_REQUIRED'; END IF; END $$;
CREATE TABLE IF NOT EXISTS competition_child_publications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL,competition_id uuid NOT NULL,round_id uuid,
 version integer NOT NULL,previous_id uuid REFERENCES competition_child_publications(id),
 action text NOT NULL CHECK(action IN('publish','replace','withdraw')),calculation_id uuid REFERENCES competition_child_calculations(id),
 public_snapshot jsonb,actor_id uuid NOT NULL REFERENCES users(id),reason text NOT NULL,request_id uuid NOT NULL,
 request_payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(competition_id,event_id) REFERENCES competitions(id,event_id),
 FOREIGN KEY(round_id,competition_id,event_id) REFERENCES competition_child_rounds(id,competition_id,event_id),
 UNIQUE(competition_id,actor_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS competition_child_publication_version ON competition_child_publications(competition_id,coalesce(round_id,'00000000-0000-0000-0000-000000000000'),version);
ALTER TABLE competition_child_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON competition_child_publications FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION competition_child_public_projection(p_calculation uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE calc competition_child_calculations; event_name text; child_name text; round_name text; standings jsonb;
BEGIN
 SELECT * INTO calc FROM competition_child_calculations WHERE id=p_calculation;
 SELECT title INTO event_name FROM events WHERE id=calc.event_id;SELECT name INTO child_name FROM competitions WHERE id=calc.competition_id;
 SELECT definition->>'name' INTO round_name FROM competition_child_rounds WHERE id=calc.round_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('participationId',r->>'contestantId','entryNumber',r->'contestantNumber','name',coalesce(r->>'contestantName',r->>'name'),'rank',r->'rank','score',CASE WHEN r->'manual'='true'::jsonb THEN 'null'::jsonb ELSE r->'finalScore' END,'manual',coalesce(r->'manual','false'::jsonb),'deductionTotal',r->'deductionTotal','deductionUnits',CASE WHEN calc.input_snapshot->'rules'->'scoringConfig'->>'calculationMethod'='rank_based' THEN 'placements' ELSE 'points' END,'tied',(SELECT count(*)>1 FROM jsonb_array_elements(calc.output_snapshot->'results') peer WHERE peer->'rank'=r->'rank')) ORDER BY (r->>'rank')::integer,r->>'contestantId'),'[]') INTO standings FROM jsonb_array_elements(calc.output_snapshot->'results') r;
 RETURN jsonb_build_object('eventId',calc.event_id,'eventName',event_name,'competitionId',calc.competition_id,'competitionName',child_name,'roundId',calc.round_id,'roundName',coalesce(round_name,'Single phase'),'calculationVersion',calc.version,'method',calc.input_snapshot->'rules'->'scoringConfig'->>'calculationMethod','tiePolicy',calc.input_snapshot->'rules'->'scoringConfig'->>'tiePolicy','precision',coalesce(calc.input_snapshot->'rules'->'scoringConfig'->'decimalPlaces','2'::jsonb),'finalizedAt',(SELECT created_at FROM competition_child_calculation_transitions WHERE calculation_id=calc.id AND action='finalize'),'standings',standings);
END $$;
CREATE OR REPLACE FUNCTION competition_child_publication_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE calc competition_child_calculations; prev competition_child_publications;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM competitions WHERE id=NEW.competition_id AND event_id=NEW.event_id AND origin='native') THEN RAISE EXCEPTION 'PUBLICATION_CONTEXT_FORBIDDEN'; END IF;
 IF NEW.previous_id IS NOT NULL THEN SELECT * INTO prev FROM competition_child_publications WHERE id=NEW.previous_id;IF prev.competition_id IS DISTINCT FROM NEW.competition_id OR prev.event_id IS DISTINCT FROM NEW.event_id OR prev.round_id IS DISTINCT FROM NEW.round_id OR prev.version+1<>NEW.version THEN RAISE EXCEPTION 'PUBLICATION_LINEAGE_FORBIDDEN'; END IF;
 ELSIF NEW.version<>1 THEN RAISE EXCEPTION 'INITIAL_PUBLICATION_VERSION_REQUIRED'; END IF;
 IF NEW.action='withdraw' THEN IF NEW.public_snapshot IS NOT NULL THEN RAISE EXCEPTION 'WITHDRAWAL_HAS_NO_PUBLIC_PAYLOAD'; END IF;
 ELSE
  SELECT * INTO calc FROM competition_child_calculations WHERE id=NEW.calculation_id;
  IF calc.competition_id IS DISTINCT FROM NEW.competition_id OR calc.event_id IS DISTINCT FROM NEW.event_id OR calc.round_id IS DISTINCT FROM NEW.round_id OR NOT EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calc.id AND action='finalize') OR NEW.public_snapshot IS DISTINCT FROM competition_child_public_projection(calc.id) THEN RAISE EXCEPTION 'PUBLICATION_CALCULATION_FORBIDDEN'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='competition_child_publications'::regclass AND tgname='competition_child_publications_immutable') THEN CREATE TRIGGER competition_child_publications_immutable BEFORE UPDATE OR DELETE ON competition_child_publications FOR EACH ROW EXECUTE FUNCTION competition_immutable_rules(); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='competition_child_publications'::regclass AND tgname='competition_child_publication_guard') THEN CREATE TRIGGER competition_child_publication_guard BEFORE INSERT ON competition_child_publications FOR EACH ROW EXECUTE FUNCTION competition_child_publication_guard(); END IF;
END $$;
CREATE OR REPLACE FUNCTION competition_child_publication_action(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_action text,p_body jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE last_version competition_child_publications; prior_request competition_child_publications; state jsonb; publication competition_child_publications; payload jsonb; request uuid;
BEGIN
 PERFORM competition_native_authority(p_event,p_competition,p_actor,false);
 IF EXISTS(SELECT 1 FROM events WHERE id=p_event AND status::text IN('archived','cancelled')) THEN RAISE EXCEPTION 'PUBLICATION_EVENT_CLOSED'; END IF;
 IF p_action NOT IN('publish','replace','withdraw') OR p_body->'acknowledged' IS DISTINCT FROM 'true'::jsonb OR length(btrim(coalesce(p_body->>'reason','')))<5 THEN RAISE EXCEPTION 'EXPLICIT_PUBLICATION_ACTION_REASON_REQUIRED'; END IF;
 request:=(p_body->>'requestId')::uuid;IF request IS NULL THEN RAISE EXCEPTION 'PUBLICATION_REQUEST_REQUIRED'; END IF;
 SELECT * INTO prior_request FROM competition_child_publications WHERE competition_id=p_competition AND actor_id=p_actor AND request_id=request;
 IF prior_request.id IS NOT NULL THEN IF prior_request.request_payload IS DISTINCT FROM p_body OR prior_request.action<>p_action OR prior_request.round_id IS DISTINCT FROM p_round THEN RAISE EXCEPTION 'PUBLICATION_REQUEST_CONFLICT'; END IF;RETURN jsonb_build_object('publicationId',prior_request.id,'publicationVersion',prior_request.version,'action',prior_request.action); END IF;
 SELECT * INTO last_version FROM competition_child_publications WHERE competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round ORDER BY version DESC LIMIT 1;
 IF (p_body->>'expectedPublicationVersion')::integer IS DISTINCT FROM coalesce(last_version.version,0) THEN RAISE EXCEPTION 'PUBLICATION_VERSION_CONFLICT'; END IF;
 IF p_action='withdraw' THEN
  IF last_version.id IS NULL OR last_version.action='withdraw' THEN RAISE EXCEPTION 'NO_ACTIVE_PUBLICATION'; END IF;
 ELSE
  IF p_action='replace' AND (last_version.id IS NULL OR last_version.action='withdraw') OR p_action='publish' AND last_version.action IN('publish','replace') THEN RAISE EXCEPTION 'INVALID_PUBLICATION_TRANSITION'; END IF;
  state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,p_round,false);
  IF state->'complete' IS DISTINCT FROM 'true'::jsonb OR state->'calculation'->'finalized' IS DISTINCT FROM 'true'::jsonb OR state->'calculation'->'verified' IS DISTINCT FROM 'true'::jsonb OR state->'calculation'->>'id' IS DISTINCT FROM p_body->>'calculationId' OR state->>'sourceDigest' IS DISTINCT FROM p_body->>'sourceDigest' THEN RAISE EXCEPTION 'CURRENT_COMPLETE_FINALIZED_PUBLICATION_REQUIRED'; END IF;
  payload:=competition_child_public_projection((p_body->>'calculationId')::uuid);
 END IF;
 INSERT INTO competition_child_publications(event_id,competition_id,round_id,version,previous_id,action,calculation_id,public_snapshot,actor_id,reason,request_id,request_payload)
 VALUES(p_event,p_competition,p_round,coalesce(last_version.version,0)+1,last_version.id,p_action,CASE WHEN p_action='withdraw' THEN last_version.calculation_id ELSE (p_body->>'calculationId')::uuid END,payload,p_actor,p_body->>'reason',request,p_body) RETURNING * INTO publication;
 RETURN jsonb_build_object('publicationId',publication.id,'publicationVersion',publication.version,'action',publication.action);
END $$;
CREATE OR REPLACE FUNCTION competition_child_public_results(p_event uuid,p_competition uuid,p_round uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE publication competition_child_publications;
BEGIN
 SELECT * INTO publication FROM competition_child_publications WHERE event_id=p_event AND competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round ORDER BY version DESC LIMIT 1;
 IF publication.id IS NULL THEN RETURN NULL; END IF;
 IF publication.action='withdraw' THEN RETURN jsonb_build_object('publicationVersion',publication.version,'withdrawn',true); END IF;
 RETURN jsonb_build_object('publicationId',publication.id,'publicationVersion',publication.version,'publishedAt',publication.created_at,'results',publication.public_snapshot);
END $$;
CREATE OR REPLACE FUNCTION competition_child_owned_results(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; history jsonb; publication competition_child_publications; foundation jsonb;
BEGIN
 foundation:=competition_native_foundation(p_event,p_competition,p_actor);
 IF foundation->'configuration'->>'structure'='multiple' AND p_round IS NULL OR p_round IS NOT NULL AND NOT EXISTS(SELECT 1 FROM competition_child_rounds WHERE id=p_round AND competition_id=p_competition) THEN RAISE EXCEPTION 'RESULTS_SCOPE_FORBIDDEN'; END IF;
 BEGIN state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,p_round,false);EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CURRENT_FROZEN_RULES_REQUIRED' THEN RAISE; END IF;state:=jsonb_build_object('complete',false,'progress','[]'::jsonb,'calculation',NULL,'sourceDigest',NULL); END;
 SELECT coalesce(jsonb_agg(jsonb_build_object('calculationId',c.id,'version',c.version,'createdAt',c.created_at,'finalizedAt',finalized.created_at,'current',state->'calculation'->>'id'=c.id::text,'results',CASE WHEN state->'complete'='true'::jsonb THEN competition_child_public_projection(c.id) ELSE NULL END) ORDER BY c.version DESC),'[]') INTO history FROM competition_child_calculations c JOIN competition_child_calculation_transitions finalized ON finalized.calculation_id=c.id AND finalized.action='finalize' WHERE c.competition_id=p_competition AND c.round_id IS NOT DISTINCT FROM p_round;
 SELECT * INTO publication FROM competition_child_publications WHERE competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round ORDER BY version DESC LIMIT 1;
 RETURN jsonb_build_object('eventId',p_event,'competitionId',p_competition,'roundId',p_round,'viewerId',p_actor,'complete',state->'complete','progress',state->'progress','sourceDigest',state->>'sourceDigest','calculation',CASE WHEN state->'calculation'->'finalized'='true'::jsonb THEN state->'calculation' ELSE NULL END,'official',CASE WHEN state->'calculation'->'finalized'='true'::jsonb THEN competition_child_public_projection((state->'calculation'->>'id')::uuid) ELSE NULL END,'history',history,
 'publication',CASE WHEN publication.id IS NULL THEN NULL ELSE jsonb_build_object('id',publication.id,'version',publication.version,'action',publication.action,'calculationId',publication.calculation_id,'publishedAt',publication.created_at,'current',publication.action<>'withdraw' AND state->'calculation'->>'id'=publication.calculation_id::text) END,
 'statistics',jsonb_build_object('source','frozen_participation_and_current_submission_heads','participants',(SELECT count(*) FROM competition_entries WHERE competition_id=p_competition),'eligibleParticipants',coalesce(jsonb_array_length(state->'session'->'entry_ids'),0),'requiredJudges',coalesce(jsonb_array_length(state->'progress'),0),'submittedJudges',(SELECT count(*) FROM jsonb_array_elements(coalesce(state->'progress','[]')) j WHERE j->'submitted'='true'::jsonb),'finalized',state->'calculation'->'finalized'='true'::jsonb));
END $$;
CREATE OR REPLACE FUNCTION competition_child_export_sources(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_kind text,p_digest text,p_calculation uuid,p_judge uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; raw_rows jsonb; event_name text; child_name text; round_name text;
BEGIN
 state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,p_round,false);
 IF state->'complete' IS DISTINCT FROM 'true'::jsonb OR state->>'sourceDigest' IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'INCOMPLETE_OR_STALE_EXPORT'; END IF;
 IF p_kind NOT IN('judge','worksheets','tabulation','final') THEN RAISE EXCEPTION 'UNSUPPORTED_EXPORT_KIND'; END IF;
 IF p_kind IN('tabulation','final') AND (state->'calculation'->'finalized' IS DISTINCT FROM 'true'::jsonb OR state->'calculation'->>'id' IS DISTINCT FROM p_calculation::text) THEN RAISE EXCEPTION 'CURRENT_FINALIZED_EXPORT_REQUIRED'; END IF;
 IF p_calculation IS NOT NULL AND state->'calculation'->>'id' IS DISTINCT FROM p_calculation::text THEN RAISE EXCEPTION 'STALE_CALCULATION_EXPORT'; END IF;
 IF p_kind='judge' AND (p_judge IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state->'submissions') s WHERE s->>'judge_id'=p_judge::text)) THEN RAISE EXCEPTION 'JUDGE_EXPORT_FORBIDDEN'; END IF;
 SELECT title INTO event_name FROM events WHERE id=p_event;SELECT name INTO child_name FROM competitions WHERE id=p_competition;SELECT definition->>'name' INTO round_name FROM competition_child_rounds WHERE id=p_round;
 SELECT coalesce(jsonb_agg(jsonb_build_object('judgeId',s->>'judge_id','judgeName',coalesce(nullif(btrim(concat_ws(' ',to_jsonb(u)->>'first_name',to_jsonb(u)->>'last_name')),''),to_jsonb(u)->>'email',s->>'judge_id'),'submissionId',s->>'id','submittedAt',s->>'submitted_at','participationId',source->>'entry_id','criterionId',source->>'criterion_id','targetId',score.key,'rawText',score.value::text,'minimumText',target->>'minScore','maximumText',target->>'maxScore','majorWeightText',major->>'percentage','rowRevision',source->>'revision') ORDER BY s->>'judge_id',source->>'entry_id',source->>'criterion_id',score.key),'[]') INTO raw_rows
 FROM jsonb_array_elements(state->'submissions') s CROSS JOIN jsonb_array_elements(s->'sources') source CROSS JOIN LATERAL jsonb_each(source->'scores') score
 CROSS JOIN jsonb_array_elements(state->'rules'->'configuration_snapshot'->'criteria') major CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_array_length(coalesce(major->'minorCriteria','[]'))>0 THEN major->'minorCriteria' ELSE jsonb_build_array(major) END) target JOIN users u ON u.id=(s->>'judge_id')::uuid WHERE major->>'id'=source->>'criterion_id' AND target->>'id'=score.key AND (p_kind<>'judge' OR s->>'judge_id'=p_judge::text);
 RETURN jsonb_build_object('eventId',p_event,'eventName',event_name,'competitionId',p_competition,'competitionName',child_name,'roundId',p_round,'roundName',coalesce(round_name,'Single phase'),'kind',p_kind,'source',state,'rawRows',raw_rows,'finalizedAt',(SELECT created_at FROM competition_child_calculation_transitions WHERE calculation_id=(state->'calculation'->>'id')::uuid AND action='finalize'),'publication',(SELECT jsonb_build_object('version',pub.version,'action',pub.action,'calculationId',pub.calculation_id) FROM competition_child_publications pub WHERE pub.competition_id=p_competition AND pub.round_id IS NOT DISTINCT FROM p_round ORDER BY pub.version DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION competition_child_public_projection(uuid),competition_child_publication_guard(),competition_child_publication_action(uuid,uuid,uuid,uuid,text,jsonb),competition_child_public_results(uuid,uuid,uuid),competition_child_owned_results(uuid,uuid,uuid,uuid),competition_child_export_sources(uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION competition_child_publication_action(uuid,uuid,uuid,uuid,text,jsonb),competition_child_public_results(uuid,uuid,uuid),competition_child_owned_results(uuid,uuid,uuid,uuid),competition_child_export_sources(uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO service_role;
COMMIT;
