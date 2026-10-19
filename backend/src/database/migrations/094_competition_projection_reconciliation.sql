BEGIN;
-- Explicit projection repair preserves locked JSON sources, submission versions,
-- and all calculated/finalized/published snapshots. No historical completion is inferred.
CREATE FUNCTION competition_reconcile_projection(p_event uuid,p_actor uuid,p_session uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source competition_session_judge_scores; parent uuid; target record; enrollment uuid;
 previous jsonb; changed integer:=0;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 IF NOT competition_owns_event(p_event,p_actor) THEN RAISE EXCEPTION 'ORGANIZER_FORBIDDEN'; END IF;
 IF length(trim(coalesce(p_reason,'')))=0 THEN RAISE EXCEPTION 'RECONCILIATION_REASON_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM competition_sessions WHERE id=p_session AND event_id=p_event) THEN RAISE EXCEPTION 'SESSION_FORBIDDEN'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO previous FROM competition_scores s JOIN competition_contestants c ON c.id=s.contestant_id WHERE c.event_id=p_event;
 FOR source IN SELECT * FROM competition_session_judge_scores WHERE session_id=p_session AND event_id=p_event FOR UPDATE LOOP
   SELECT id INTO enrollment FROM event_participants WHERE event_id=p_event AND user_id=source.judge_id AND participant_type='COMPETITION_JUDGE';
   IF enrollment IS NULL THEN RAISE EXCEPTION 'HISTORICAL_ENROLLMENT_MISSING'; END IF;
   FOR parent IN SELECT value::uuid FROM jsonb_array_elements_text(coalesce(source.locked_criteria,'[]')) value LOOP
     IF NOT EXISTS(SELECT 1 FROM competition_criteria WHERE id=parent AND event_id=p_event) THEN RAISE EXCEPTION 'HISTORICAL_CRITERION_MISSING'; END IF;
     IF NOT EXISTS(SELECT 1 FROM jsonb_object_keys(source.scores) key WHERE key=parent::text OR EXISTS(SELECT 1 FROM competition_minor_criteria WHERE id=key::uuid AND criteria_id=parent)) THEN RAISE EXCEPTION 'HISTORICAL_LOCK_VALUES_MISSING'; END IF;
     DELETE FROM competition_scores WHERE judge_id=source.judge_id AND contestant_id=source.contestant_id AND criteria_id=parent AND round_id IS NOT DISTINCT FROM source.round_id;
     FOR target IN SELECT key,value FROM jsonb_each_text(source.scores) WHERE key=parent::text OR EXISTS(SELECT 1 FROM competition_minor_criteria WHERE id=key::uuid AND criteria_id=parent) LOOP
       IF target.value IS NULL OR target.value::numeric::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'INVALID_HISTORICAL_SCORE'; END IF;
       INSERT INTO competition_scores(judge_id,participant_id,contestant_id,criteria_id,minor_criteria_id,round_id,division_id,score)
       SELECT source.judge_id,enrollment,source.contestant_id,parent,CASE WHEN target.key=parent::text THEN NULL ELSE target.key::uuid END,source.round_id,c.division_id,target.value::numeric FROM competition_contestants c WHERE c.id=source.contestant_id AND c.event_id=p_event;
       changed:=changed+1;
     END LOOP;
   END LOOP;
 END LOOP;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.projection.reconcile','competition_sessions',p_session,jsonb_build_object('reason',p_reason,'previousProjection',previous,'mirroredCells',changed,'submissionsCreated',0));
 RETURN jsonb_build_object('mirroredCells',changed,'submissionsCreated',0,'snapshotsChanged',0);
END; $$;
REVOKE ALL ON FUNCTION competition_reconcile_projection(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_reconcile_projection(uuid,uuid,uuid,text) TO service_role;
GRANT SELECT ON competition_rule_versions,competition_criterion_lock_history,v_competition_active_session TO service_role;
GRANT SELECT,INSERT,UPDATE ON competition_lineups,competition_judge_drafts,competition_round_submissions,competition_eligibility_decisions,competition_advancement_decisions,competition_rule_amendments TO service_role;
COMMIT;
