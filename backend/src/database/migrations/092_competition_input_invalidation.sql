BEGIN;
CREATE FUNCTION competition_invalidate_provisional() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE competition_result_calculations SET status='provisional',verified_by=NULL,verified_at=NULL
 WHERE event_id=NEW.event_id AND rules_version=NEW.rules_version AND status IN('calculated','ready_for_verification','under_verification');
 RETURN NEW;
END; $$;
CREATE TRIGGER competition_penalty_invalidates AFTER INSERT OR UPDATE ON competition_deductions FOR EACH ROW EXECUTE FUNCTION competition_invalidate_provisional();
CREATE TRIGGER competition_eligibility_invalidates AFTER INSERT OR UPDATE ON competition_eligibility_decisions FOR EACH ROW EXECUTE FUNCTION competition_invalidate_provisional();
CREATE TRIGGER competition_submission_invalidates AFTER INSERT OR UPDATE ON competition_round_submissions FOR EACH ROW EXECUTE FUNCTION competition_invalidate_provisional();
COMMIT;
