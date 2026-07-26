-- Migration 029 — Event Participant Role System
--
-- Introduces a unified event_participants table to replace the mixed-purpose
-- event_voters table. Participants now have an explicit participant_type that
-- defines their role per event, replacing boolean flags.
--
-- Preserves backward compatibility via v_event_voters view.

BEGIN;

-- ===========================================================================
-- 1. Enum: participant_type
-- ===========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participant_type') THEN
    CREATE TYPE participant_type AS ENUM (
      'ELECTION_VOTER',
      'COMPETITION_JUDGE',
      'POLLING_RESPONDENT'
    );
  END IF;
END
$$;

-- ===========================================================================
-- 2. Table: event_participants
-- ===========================================================================

CREATE TABLE IF NOT EXISTS event_participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  participant_type  participant_type NOT NULL,

-- Module-specific completion flags (maintained for backward compat)
has_voted BOOLEAN NOT NULL DEFAULT FALSE,
has_scored BOOLEAN NOT NULL DEFAULT FALSE,
has_responded BOOLEAN NOT NULL DEFAULT FALSE,

-- Participant metadata (name, info form responses, etc.)
first_name VARCHAR(255),
last_name VARCHAR(255),
metadata JSONB NOT NULL DEFAULT '{}',

-- Timestamps
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

-- A user can only be in an event once with a single participant type
CONSTRAINT event_participants_unique UNIQUE (event_id, user_id) );

-- ===========================================================================
-- 3. Indexes
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_event_participants_event_id ON event_participants (event_id);

CREATE INDEX IF NOT EXISTS idx_event_participants_user_id ON event_participants (user_id);

CREATE INDEX IF NOT EXISTS idx_event_participants_type ON event_participants (participant_type);

CREATE INDEX IF NOT EXISTS idx_event_participants_event_user ON event_participants (event_id, user_id);

CREATE INDEX IF NOT EXISTS idx_event_participants_metadata ON event_participants USING GIN (metadata);

-- ===========================================================================
-- 4. Trigger: updated_at
-- ===========================================================================
CREATE TRIGGER trg_event_participants_updated_at
  BEFORE UPDATE ON event_participants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- 5. Backfill: Migrate data from event_voters
-- ===========================================================================
INSERT INTO event_participants (
  event_id,
  user_id,
  participant_type,
  has_voted,
  has_responded,
  has_scored,
  first_name,
  last_name,
  metadata,
  created_at,
  updated_at
)
SELECT
  ev.event_id,
  ev.voter_id,
  CASE
    WHEN ev.is_judge = true THEN 'COMPETITION_JUDGE'::participant_type
    WHEN e.event_type = 'polling' THEN 'POLLING_RESPONDENT'::participant_type
    ELSE 'ELECTION_VOTER'::participant_type
  END,
  CASE
    WHEN e.event_type = 'election' THEN ev.has_voted
    ELSE FALSE
  END,
  CASE
    WHEN e.event_type = 'polling' THEN ev.has_voted
    ELSE FALSE
  END,
  CASE
    WHEN ev.is_judge = true THEN ev.has_scored
    ELSE FALSE
  END,
  ev.first_name,
  ev.last_name,
  '{}'::JSONB,
  ev.created_at,
  ev.updated_at
FROM
  event_voters ev
  JOIN events e ON e.id = ev.event_id
ON CONFLICT (event_id, user_id) DO NOTHING;

-- ===========================================================================
-- 6. Backfill: Migrate competition_judges data into metadata
-- ===========================================================================
UPDATE event_participants ep
SET
    metadata = jsonb_build_object (
        'judgeRole',
        cj.role,
        'isActive',
        cj.is_active,
        'hasSubmitted',
        cj.has_submitted,
        'judgeRowId',
        cj.id
    )
FROM competition_judges cj
WHERE
    cj.event_id = ep.event_id
    AND cj.user_id = ep.user_id
    AND ep.participant_type = 'COMPETITION_JUDGE';

-- ===========================================================================
-- 7. Create view for backward compatibility
-- ===========================================================================
CREATE OR REPLACE VIEW v_event_voters AS
SELECT
    ep.id,
    ep.event_id,
    ep.user_id AS voter_id,
    (
        ep.participant_type = 'ELECTION_VOTER'
        AND ep.has_voted
    )
    OR (
        ep.participant_type = 'POLLING_RESPONDENT'
        AND ep.has_responded
    ) AS has_voted,
    ep.participant_type = 'COMPETITION_JUDGE' AS is_judge,
    CASE
        WHEN ep.participant_type = 'COMPETITION_JUDGE' THEN ep.has_scored
        ELSE FALSE
    END AS has_scored,
    ep.first_name,
    ep.last_name,
    ep.created_at,
    ep.updated_at
FROM event_participants ep;

-- ===========================================================================
-- 8. Constraint: Validate participant_type matches event_type
-- ===========================================================================
CREATE OR REPLACE FUNCTION fn_validate_participant_event_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.participant_type = 'ELECTION_VOTER' AND
     NOT EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND event_type = 'election') THEN
    RAISE EXCEPTION 'ELECTION_VOTER can only be assigned to election events';
  END IF;

  IF NEW.participant_type = 'COMPETITION_JUDGE' AND
     NOT EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND event_type IN ('pageant', 'competition_scoring')) THEN
    RAISE EXCEPTION 'COMPETITION_JUDGE can only be assigned to competition events';
  END IF;

  IF NEW.participant_type = 'POLLING_RESPONDENT' AND
     NOT EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND event_type = 'polling') THEN
    RAISE EXCEPTION 'POLLING_RESPONDENT can only be assigned to polling events';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_participants_validate_type ON event_participants;

CREATE TRIGGER trg_event_participants_validate_type
  BEFORE INSERT OR UPDATE OF participant_type ON event_participants
  FOR EACH ROW EXECUTE FUNCTION fn_validate_participant_event_type();

-- ===========================================================================
-- 9. Comments
-- ===========================================================================
COMMENT ON
TABLE event_participants IS 'Unified participant enrollment. participant_type defines the role per event.';

COMMENT ON COLUMN event_participants.participant_type IS 'ELECTION_VOTER | COMPETITION_JUDGE | POLLING_RESPONDENT';

COMMENT ON COLUMN event_participants.metadata IS 'JSONB storage for event-specific participant information form responses.';

COMMIT;