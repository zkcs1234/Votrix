-- Store account-level eligibility for each event participant type.
-- This is separate from event_participants: membership does not enroll a
-- user in an event or grant access to event data.
--
-- Backfill policy:
--   * legacy student profiles enter both election and polling pools;
--   * legacy judge profiles enter the competition judge pool;
--   * existing event enrollment is authoritative evidence for its own type.
-- Existing users and event_participants rows are never duplicated or changed.

BEGIN;

CREATE TABLE IF NOT EXISTS user_participant_types (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    participant_type VARCHAR(32) NOT NULL CHECK (
        participant_type IN (
            'ELECTION_VOTER',
            'COMPETITION_JUDGE',
            'POLLING_RESPONDENT'
        )
    ),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, participant_type)
);

CREATE INDEX IF NOT EXISTS idx_user_participant_types_type_active ON user_participant_types (
    participant_type,
    is_active,
    user_id
);

CREATE INDEX IF NOT EXISTS idx_user_participant_types_user ON user_participant_types (user_id);

DROP TRIGGER IF EXISTS trg_user_participant_types_updated_at ON user_participant_types;

CREATE TRIGGER trg_user_participant_types_updated_at
  BEFORE UPDATE ON user_participant_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO
    user_participant_types (user_id, participant_type)
SELECT id, 'ELECTION_VOTER'
FROM users
WHERE
    role IN ('voter', 'participant')
    AND profile_type = 'student' ON CONFLICT (user_id, participant_type) DO NOTHING;

INSERT INTO
    user_participant_types (user_id, participant_type)
SELECT id, 'POLLING_RESPONDENT'
FROM users
WHERE
    role IN ('voter', 'participant')
    AND profile_type = 'student' ON CONFLICT (user_id, participant_type) DO NOTHING;

INSERT INTO
    user_participant_types (user_id, participant_type)
SELECT id, 'COMPETITION_JUDGE'
FROM users
WHERE
    role IN ('voter', 'participant')
    AND profile_type = 'judge' ON CONFLICT (user_id, participant_type) DO NOTHING;

INSERT INTO user_participant_types (user_id, participant_type)
SELECT DISTINCT ep.user_id, ep.participant_type::text
FROM event_participants ep
JOIN users u ON u.id = ep.user_id
WHERE u.role IN ('voter', 'participant')
  AND ep.participant_type::text IN (
  'ELECTION_VOTER',
  'COMPETITION_JUDGE',
  'POLLING_RESPONDENT'
)
ON CONFLICT (user_id, participant_type) DO NOTHING;

ANALYZE user_participant_types;

COMMIT;