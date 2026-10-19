BEGIN;
ALTER TABLE competition_deductions ADD COLUMN offense_key text;
CREATE UNIQUE INDEX competition_one_penalty_per_offense ON competition_deductions(event_id,rules_version,contestant_id,offense_key) WHERE offense_key IS NOT NULL AND decision_status<>'voided';
CREATE FUNCTION competition_approve_decision(p_event uuid,p_actor uuid,p_kind text,p_id uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rv competition_rule_versions; reporter uuid; result jsonb;
BEGIN
 PERFORM 1 FROM events WHERE id=p_event FOR UPDATE;
 SELECT v.* INTO rv FROM competition_rule_versions v JOIN events e ON e.official_rules_id=v.id WHERE e.id=p_event;
 IF rv.snapshot->'scoringConfig'->>'verifierId'<>p_actor::text OR NOT EXISTS(SELECT 1 FROM event_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.event_id=p_event AND ep.user_id=p_actor AND ep.judge_role::text='score_reviewer' AND ep.is_active AND u.account_status='active') THEN RAISE EXCEPTION 'APPROVER_FORBIDDEN'; END IF;
 IF length(trim(coalesce(p_reason,'')))=0 THEN RAISE EXCEPTION 'DECISION_REASON_REQUIRED'; END IF;
 IF p_kind IN ('deduction','deduction-reject') THEN
   SELECT applied_by_user_id INTO reporter FROM competition_deductions WHERE id=p_id AND event_id=p_event AND rules_version=rv.id AND decision_status='pending' FOR UPDATE;
   IF reporter IS NULL OR reporter=p_actor THEN RAISE EXCEPTION 'INDEPENDENT_APPROVAL_REQUIRED'; END IF;
   UPDATE competition_deductions SET decision_status=CASE WHEN p_kind='deduction-reject' THEN 'voided' ELSE 'approved' END,approved_by=p_actor,approved_at=now() WHERE id=p_id RETURNING to_jsonb(competition_deductions) INTO result;
 ELSIF p_kind IN ('eligibility','eligibility-reject') THEN
   SELECT reported_by INTO reporter FROM competition_eligibility_decisions WHERE id=p_id AND event_id=p_event AND rules_version=rv.id AND status='pending' FOR UPDATE;
   IF reporter IS NULL OR reporter=p_actor THEN RAISE EXCEPTION 'INDEPENDENT_APPROVAL_REQUIRED'; END IF;
   UPDATE competition_eligibility_decisions SET status=CASE WHEN p_kind='eligibility-reject' THEN 'voided' ELSE 'approved' END,approved_by=p_actor,approved_at=now() WHERE id=p_id RETURNING to_jsonb(competition_eligibility_decisions) INTO result;
 ELSE RAISE EXCEPTION 'INVALID_DECISION_KIND'; END IF;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.decision.approve',p_kind,p_id,jsonb_build_object('reason',p_reason,'rulesVersion',rv.id));
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION competition_approve_decision(uuid,uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_approve_decision(uuid,uuid,text,uuid,text) TO service_role;
COMMIT;
