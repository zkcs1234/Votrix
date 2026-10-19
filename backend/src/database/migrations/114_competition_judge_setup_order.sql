-- Judge grants require saved complete scoring rules and registered entries. Removal remains available to repair drafts.
BEGIN;
CREATE OR REPLACE FUNCTION competition_assign_native_judge(p_event uuid,p_competition uuid,p_actor uuid,p_participant uuid,p_round uuid,p_remove boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_configuration jsonb; c competitions; a competition_child_judge_assignments;
BEGIN
 c:=competition_native_authority(p_event,p_competition,p_actor,true);
 IF NOT p_remove THEN
  SELECT configuration INTO v_configuration FROM competition_child_configurations WHERE competition_id=c.id;
  PERFORM competition_validate_native_configuration(p_event,c.id,v_configuration,true);
  IF NOT EXISTS(SELECT 1 FROM competition_entries WHERE competition_id=c.id) THEN RAISE EXCEPTION 'CHILD_ENTRIES_REQUIRED_BEFORE_JUDGES'; END IF;
 END IF;
 IF p_remove THEN DELETE FROM competition_child_judge_assignments WHERE competition_id=c.id AND participant_id=p_participant AND round_id IS NOT DISTINCT FROM p_round RETURNING * INTO a;
 ELSE SELECT * INTO a FROM competition_child_judge_assignments WHERE competition_id=c.id AND participant_id=p_participant AND round_id IS NOT DISTINCT FROM p_round;
 IF a.id IS NULL THEN INSERT INTO competition_child_judge_assignments(competition_id,event_id,participant_id,round_id) VALUES(c.id,p_event,p_participant,p_round) RETURNING * INTO a; END IF;
 END IF;
 RETURN coalesce(to_jsonb(a),'{}');
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
