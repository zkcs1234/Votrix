-- 072_session_active_criteria.sql
-- Live control: per-round "active criteria" gate.
--
-- During a live session the organizer chooses which criteria of the CURRENT
-- round are open for scoring. Judges only see (and can only submit) scores for
-- criteria whose id is in this set. Opening a criterion exposes all of its minor
-- criteria; minors are never gated individually.
--
-- Session-scoped and resets each session. The application initializes this to
-- ALL of a round's criteria when the round is opened/switched, then the
-- organizer can close individual ones live.
--
-- Additive and reversible. Default '{}' means "no explicit gate yet" — the
-- application treats an empty set on the active round as "all criteria open" so
-- pre-existing sessions and flat events keep working until the organizer toggles.
--
-- Apply in the Supabase SQL Editor in numeric order (see database/README.md).

BEGIN;

ALTER TABLE competition_sessions
    ADD COLUMN IF NOT EXISTS active_criteria_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN competition_sessions.active_criteria_ids IS
    'Live control: criteria of the current round that are open for scoring. '
    'Judges see only these (and their minor criteria). Empty = application treats '
    'as all-open. Reset when the round changes.';

COMMIT;
