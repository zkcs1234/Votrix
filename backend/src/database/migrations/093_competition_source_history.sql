BEGIN;
CREATE TABLE competition_criterion_lock_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), score_row_id uuid NOT NULL REFERENCES competition_session_judge_scores(id),
 rules_version uuid NOT NULL REFERENCES competition_rule_versions(id), criterion_id uuid NOT NULL REFERENCES competition_criteria(id),
 revision bigint NOT NULL, scores jsonb NOT NULL, locked_by uuid NOT NULL REFERENCES users(id), locked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE competition_criterion_lock_history ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION competition_archive_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE criterion text;
BEGIN
 IF NEW.rules_version IS NOT NULL THEN
   FOR criterion IN SELECT v FROM jsonb_array_elements_text(NEW.locked_criteria) v WHERE TG_OP='INSERT' OR NOT coalesce(OLD.locked_criteria,'[]') ? v LOOP
     INSERT INTO competition_criterion_lock_history(score_row_id,rules_version,criterion_id,revision,scores,locked_by) VALUES(NEW.id,NEW.rules_version,criterion::uuid,NEW.revision,NEW.scores,NEW.judge_id);
   END LOOP;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER competition_lock_history AFTER INSERT OR UPDATE ON competition_session_judge_scores FOR EACH ROW EXECUTE FUNCTION competition_archive_lock();
CREATE TRIGGER competition_lock_history_immutable BEFORE UPDATE OR DELETE ON competition_criterion_lock_history FOR EACH ROW EXECUTE FUNCTION competition_immutable_rules();
CREATE FUNCTION competition_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.rules_version IS NOT NULL AND (OLD.result_snapshot IS DISTINCT FROM NEW.result_snapshot OR OLD.configuration_snapshot IS DISTINCT FROM NEW.configuration_snapshot OR OLD.source_versions IS DISTINCT FROM NEW.source_versions OR OLD.rules_version IS DISTINCT FROM NEW.rules_version) THEN RAISE EXCEPTION 'CALCULATION_SNAPSHOT_IMMUTABLE'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER competition_calculation_immutable BEFORE UPDATE ON competition_result_calculations FOR EACH ROW EXECUTE FUNCTION competition_snapshot_immutable();
COMMIT;
