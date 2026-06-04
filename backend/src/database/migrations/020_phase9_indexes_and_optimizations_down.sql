-- Phase 9 — Indexes / optimizations DOWN
-- Reverse of 019_phase9_indexes_and_optimizations.sql.
-- Each DROP uses IF EXISTS so partial / failed runs of 019 are safe to roll
-- back here.

BEGIN;

DROP VIEW IF EXISTS v_audit_log_with_user;

DROP INDEX IF EXISTS idx_events_created_at_desc;
DROP INDEX IF EXISTS idx_events_org_type_status;
DROP INDEX IF EXISTS idx_events_scoring_config_gin;

DROP INDEX IF EXISTS idx_event_voters_event_voted;
DROP INDEX IF EXISTS idx_event_voters_event_judge;

DROP INDEX IF EXISTS idx_election_votes_event_candidate;
DROP INDEX IF EXISTS idx_election_votes_created_at_desc;

DROP INDEX IF EXISTS idx_competition_scores_criteria_round;
DROP INDEX IF EXISTS idx_competition_scores_created_at_desc;

DROP INDEX IF EXISTS idx_competition_contestants_event_number;

DROP INDEX IF EXISTS idx_poll_questions_event_order;
DROP INDEX IF EXISTS idx_poll_answers_submission_question;
DROP INDEX IF EXISTS idx_poll_submissions_event_created;

DROP INDEX IF EXISTS idx_notifications_user_unread_created;
DROP INDEX IF EXISTS idx_notifications_entity;

DROP INDEX IF EXISTS idx_audit_logs_entity_created;
DROP INDEX IF EXISTS idx_audit_logs_user_created;

DROP INDEX IF EXISTS idx_organizations_organizer_type;

COMMIT;
