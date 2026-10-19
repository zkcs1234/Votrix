BEGIN;
CREATE TABLE competition_rule_amendments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL REFERENCES events(id),
 previous_rules uuid REFERENCES competition_rule_versions(id), proposed_config jsonb NOT NULL,
 reason text NOT NULL, requested_by uuid NOT NULL REFERENCES users(id), requested_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, resulting_rules uuid REFERENCES competition_rule_versions(id)
);
ALTER TABLE competition_rule_amendments ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION competition_approve_amendment(p_id uuid,p_actor uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a competition_rule_amendments; old competition_rule_versions; new_id uuid:=gen_random_uuid(); snap jsonb; v integer;
BEGIN
 SELECT * INTO a FROM competition_rule_amendments WHERE id=p_id FOR UPDATE;
 PERFORM 1 FROM events WHERE id=a.event_id FOR UPDATE;
 SELECT * INTO old FROM competition_rule_versions WHERE id=a.previous_rules;
 IF a.id IS NULL OR old.id IS NULL OR a.status<>'pending' OR a.requested_by=p_actor OR length(trim(p_reason))=0 THEN RAISE EXCEPTION 'AMENDMENT_APPROVAL_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor AND role::text='admin' AND account_status='active') AND NOT EXISTS(SELECT 1 FROM event_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.event_id=a.event_id AND ep.user_id=p_actor AND ep.is_active AND ep.judge_role::text='score_reviewer' AND u.account_status='active' AND old.snapshot->'scoringConfig'->>'verifierId'=p_actor::text) THEN RAISE EXCEPTION 'AMENDMENT_APPROVER_FORBIDDEN'; END IF;
 IF (SELECT official_rules_id FROM events WHERE id=a.event_id) IS DISTINCT FROM old.id THEN RAISE EXCEPTION 'STALE_AMENDMENT'; END IF;
 IF NOT coalesce((a.proposed_config->>'confirmed')::boolean,false) OR a.proposed_config->>'calculationMethod'='undecided' THEN RAISE EXCEPTION 'RULES_NOT_CONFIRMED'; END IF;
 snap:=jsonb_set(jsonb_set(old.snapshot,'{scoringConfig}',a.proposed_config),'{id}',to_jsonb(new_id::text));
 IF a.proposed_config ? 'scoringJudgeIds' THEN
   snap:=jsonb_set(snap,'{judges}',(SELECT jsonb_agg(j) FROM jsonb_array_elements(old.snapshot->'judges') j WHERE j->>'role'='score_reviewer' OR a.proposed_config->'scoringJudgeIds' ? (j->>'judgeId')));
 END IF;
 SELECT max(version)+1 INTO v FROM competition_rule_versions WHERE event_id=a.event_id;
 INSERT INTO competition_rule_versions(id,event_id,version,snapshot,acknowledged_by,reason) VALUES(new_id,a.event_id,v,snap,a.requested_by,a.reason);
 UPDATE competition_sessions SET status='completed',completed_at=coalesce(completed_at,now()),submission_window=false WHERE event_id=a.event_id AND status IN('active','paused');
 UPDATE competition_round_submissions SET status='invalidated',invalidated_at=now(),reason='Approved rules amendment: '||a.reason WHERE event_id=a.event_id AND rules_version=old.id AND status='submitted';
 -- Old sources and published snapshots remain unchanged and readable.
 UPDATE events SET official_rules_id=new_id,status='scheduled',scoring_enabled=false,competition_lifecycle='amended_rules_require_rejudging' WHERE id=a.event_id;
 UPDATE competition_rule_amendments SET status='approved',reviewed_by=p_actor,reviewed_at=now(),resulting_rules=new_id WHERE id=a.id;
 INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES(p_actor,'competition.rules.amend','competition_rule_amendments',a.id,jsonb_build_object('reason',p_reason,'oldRules',old.id,'newRules',new_id));
 RETURN jsonb_build_object('rulesVersion',new_id,'version',v,'requiresRejudging',true);
END; $$;
REVOKE ALL ON FUNCTION competition_approve_amendment(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION competition_approve_amendment(uuid,uuid,text) TO service_role;
COMMIT;
