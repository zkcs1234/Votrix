-- Phase 9 — Database optimization
--
-- Goal: add additive indexes and performance improvements to the existing
-- schema. No destructive changes, no data backfills, no constraint
-- tightening that could fail on existing rows.
--
-- Each CREATE INDEX / CREATE UNIQUE INDEX uses IF NOT EXISTS so this
-- migration is safe to re-run.
--
-- Notes:
--  * Hot read paths identified in the service layer (dashboard counts,
--    list-by-event, list-by-user) get composite indexes that match the
--    actual query shape, e.g. (event_id, has_voted) or (user_id, is_read).
--  * Several tables are missing an index on `created_at DESC` which is the
--    default ordering for almost every "recent" list — added below.
--  * We add a GIN index on events.scoring_config to accelerate JSONB
--    lookups (e.g. scoreType filters) without the cost of a full scan.
--  * `audit_logs` and `notifications` get a composite (entity, entity_id)
--    index so the "show audit log for this event" path doesn't fall back
--    to a single-column scan.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. events — speed up "recent events" listings and the admin global list
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_events_created_at_desc
  ON events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_org_type_status
  ON events (organization_id, event_type, status);

-- ---------------------------------------------------------------------------
-- 2. event_voters — composite indexes for the hot "who voted" queries
-- ---------------------------------------------------------------------------
-- The election reports endpoint runs:
--   .eq('event_id', id).eq('has_voted', true)
-- The existing single-column indexes force a bitmap-and. This composite
-- is a direct match.
CREATE INDEX IF NOT EXISTS idx_event_voters_event_voted
  ON event_voters (event_id, has_voted);

-- Judge variant (Phase 4/6 still reads it).
CREATE INDEX IF NOT EXISTS idx_event_voters_event_judge
  ON event_voters (event_id, is_judge);

-- ---------------------------------------------------------------------------
-- 3. election_votes — count votes per candidate / per event / per position
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_election_votes_event_candidate
  ON election_votes (event_id, candidate_id);

CREATE INDEX IF NOT EXISTS idx_election_votes_created_at_desc
  ON election_votes (created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. competition_scores — per-round / per-category / per-criteria hot paths
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_competition_scores_criteria_round
  ON competition_scores (criteria_id, round_id);

CREATE INDEX IF NOT EXISTS idx_competition_scores_created_at_desc
  ON competition_scores (created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. competition_contestants / criteria — display ordering
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_competition_contestants_event_number
  ON competition_contestants (event_id, contestant_number);

-- ---------------------------------------------------------------------------
-- 6. poll_questions — display order inside an event
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_poll_questions_event_order
  ON poll_questions (event_id, sort_order);

-- ---------------------------------------------------------------------------
-- 7. poll_answers — already indexed on (question_id, voter_id) but
--    submission-level analytics is the hot path now (Phase 6 polling).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_poll_answers_submission_question
  ON poll_answers (submission_id, question_id);

-- ---------------------------------------------------------------------------
-- 8. poll_submissions — recent submissions per event
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_poll_submissions_event_created
  ON poll_submissions (event_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 9. notifications — fast unread badge for the sidebar + entity-scoped lists
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
  ON notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_entity
  ON notifications (entity, entity_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 10. audit_logs — entity-scoped audit trails + user activity feed
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created
  ON audit_logs (entity, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON audit_logs (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 11. organizations — fast lookup by organizer + type
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_organizations_organizer_type
  ON organizations (organizer_id, organization_type);

-- ---------------------------------------------------------------------------
-- 12. GIN index on events.scoring_config (Phase 5) — already added in
--     015, but in case a database is on an older version we re-declare
--     IF NOT EXISTS so this migration is safe to re-run.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_events_scoring_config_gin
  ON events USING GIN (scoring_config);

-- ---------------------------------------------------------------------------
-- 13. Helpful "soft"-style read model: an immutable view that joins
--     audit_logs to users for the activity feed endpoint. The query
--     is identical to the one in admin.service.js so it doesn't have
--     to be re-written in every call site.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_audit_log_with_user AS
  SELECT
    a.id,
    a.user_id,
    a.action,
    a.entity,
    a.entity_id,
    a.details,
    a.created_at,
    u.email      AS user_email,
    u.role       AS user_role
  FROM audit_logs a
  LEFT JOIN users u ON u.id = a.user_id;

COMMENT ON VIEW v_audit_log_with_user IS
  'Phase 9: convenience view joining audit_logs to users for the activity feed. Drop-in replacement for the inline join in admin.service.js.';

-- ---------------------------------------------------------------------------
-- 14. ANALYZE — refresh planner statistics so the new indexes are picked up
--     without waiting for autovacuum.
-- ---------------------------------------------------------------------------
ANALYZE events;
ANALYZE event_voters;
ANALYZE election_votes;
ANALYZE competition_scores;
ANALYZE competition_contestants;
ANALYZE poll_questions;
ANALYZE poll_answers;
ANALYZE poll_submissions;
ANALYZE notifications;
ANALYZE audit_logs;
ANALYZE organizations;

COMMIT;
