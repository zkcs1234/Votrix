-- VOTRIX Phase 2 — Initial relational schema
-- Run in Supabase SQL Editor or via psql against your PostgreSQL database.
-- Requires: PostgreSQL 15+ (Supabase). Uses gen_random_uuid().

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('admin', 'organizer', 'voter');

CREATE TYPE organization_type AS ENUM ('election', 'pageant', 'polling');

CREATE TYPE organization_status AS ENUM (
  'draft',
  'active',
  'inactive',
  'archived'
);

CREATE TYPE event_status AS ENUM (
  'draft',
  'scheduled',
  'active',
  'completed',
  'cancelled'
);

CREATE TYPE event_type AS ENUM ('election', 'pageant', 'polling');

CREATE TYPE poll_question_type AS ENUM (
  'single_choice',
  'multiple_choice',
  'text',
  'rating'
);

-- ---------------------------------------------------------------------------
-- Utility: updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users
-- Admin: username + password (manual insert). Organizer/Voter: email + password.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username            VARCHAR(64),
  email               VARCHAR(255),
  password            TEXT NOT NULL,
  role                user_role NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_username_unique UNIQUE (username),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_admin_has_username CHECK (
    role <> 'admin' OR username IS NOT NULL
  ),
  CONSTRAINT users_non_admin_has_email CHECK (
    role = 'admin' OR email IS NOT NULL
  ),
  CONSTRAINT users_admin_email_optional CHECK (
    role = 'admin' OR username IS NULL
  )
);

CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_email ON users (email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_username ON users (username) WHERE username IS NOT NULL;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name   VARCHAR(255) NOT NULL,
  organization_type   organization_type NOT NULL,
  organizer_id        UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status              organization_status NOT NULL DEFAULT 'draft',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_organizer_id ON organizations (organizer_id);
CREATE INDEX idx_organizations_type ON organizations (organization_type);
CREATE INDEX idx_organizations_status ON organizations (status);

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
CREATE TABLE events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  title               VARCHAR(255) NOT NULL,
  description         TEXT,
  banner              TEXT,
  start_date          TIMESTAMPTZ,
  end_date            TIMESTAMPTZ,
  status              event_status NOT NULL DEFAULT 'draft',
  event_type          event_type NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT events_dates_valid CHECK (
    start_date IS NULL
    OR end_date IS NULL
    OR end_date >= start_date
  )
);

CREATE INDEX idx_events_organization_id ON events (organization_id);
CREATE INDEX idx_events_status ON events (status);
CREATE INDEX idx_events_event_type ON events (event_type);
CREATE INDEX idx_events_dates ON events (start_date, end_date);

CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- event_voters
-- ---------------------------------------------------------------------------
CREATE TABLE event_voters (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  voter_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  has_voted           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT event_voters_unique UNIQUE (event_id, voter_id)
);

CREATE INDEX idx_event_voters_event_id ON event_voters (event_id);
CREATE INDEX idx_event_voters_voter_id ON event_voters (voter_id);
CREATE INDEX idx_event_voters_has_voted ON event_voters (event_id, has_voted);

CREATE TRIGGER trg_event_voters_updated_at
  BEFORE UPDATE ON event_voters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- invitations
-- ---------------------------------------------------------------------------
CREATE TABLE invitations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  voter_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  temp_password       TEXT,
  invitation_sent     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT invitations_unique UNIQUE (event_id, voter_id)
);

CREATE INDEX idx_invitations_event_id ON invitations (event_id);
CREATE INDEX idx_invitations_voter_id ON invitations (voter_id);
CREATE INDEX idx_invitations_sent ON invitations (event_id, invitation_sent);

CREATE TRIGGER trg_invitations_updated_at
  BEFORE UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- positions (election)
-- ---------------------------------------------------------------------------
CREATE TABLE positions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  min_vote            INTEGER NOT NULL DEFAULT 1,
  max_vote            INTEGER NOT NULL DEFAULT 1,
  allow_skip          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT positions_vote_range_valid CHECK (
    min_vote >= 0 AND max_vote >= min_vote
  )
);

CREATE INDEX idx_positions_event_id ON positions (event_id);

CREATE TRIGGER trg_positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- candidates (election)
-- ---------------------------------------------------------------------------
CREATE TABLE candidates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id         UUID NOT NULL REFERENCES positions (id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  photo               TEXT,
  description         TEXT,
  partylist           VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidates_position_id ON candidates (position_id);

CREATE TRIGGER trg_candidates_updated_at
  BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- contestants (pageant)
-- ---------------------------------------------------------------------------
CREATE TABLE contestants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  photo               TEXT,
  contestant_number   INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT contestants_number_unique UNIQUE (event_id, contestant_number),
  CONSTRAINT contestants_number_positive CHECK (contestant_number > 0)
);

CREATE INDEX idx_contestants_event_id ON contestants (event_id);

CREATE TRIGGER trg_contestants_updated_at
  BEFORE UPDATE ON contestants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- criteria (pageant scoring)
-- ---------------------------------------------------------------------------
CREATE TABLE criteria (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  percentage          NUMERIC(5, 2) NOT NULL DEFAULT 0,
  min_score           NUMERIC(10, 2) NOT NULL DEFAULT 0,
  max_score           NUMERIC(10, 2) NOT NULL DEFAULT 100,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT criteria_percentage_range CHECK (
    percentage >= 0 AND percentage <= 100
  ),
  CONSTRAINT criteria_score_range_valid CHECK (max_score >= min_score)
);

CREATE INDEX idx_criteria_event_id ON criteria (event_id);

CREATE TRIGGER trg_criteria_updated_at
  BEFORE UPDATE ON criteria
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- judge_scores (pageant)
-- judge_id references users (organizer-assigned judges in application layer)
-- ---------------------------------------------------------------------------
CREATE TABLE judge_scores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  contestant_id       UUID NOT NULL REFERENCES contestants (id) ON DELETE CASCADE,
  criteria_id         UUID NOT NULL REFERENCES criteria (id) ON DELETE CASCADE,
  score               NUMERIC(10, 2) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT judge_scores_unique UNIQUE (judge_id, contestant_id, criteria_id)
);

CREATE INDEX idx_judge_scores_judge_id ON judge_scores (judge_id);
CREATE INDEX idx_judge_scores_contestant_id ON judge_scores (contestant_id);
CREATE INDEX idx_judge_scores_criteria_id ON judge_scores (criteria_id);

CREATE TRIGGER trg_judge_scores_updated_at
  BEFORE UPDATE ON judge_scores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- poll_questions (polling)
-- ---------------------------------------------------------------------------
CREATE TABLE poll_questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  question            TEXT NOT NULL,
  type                poll_question_type NOT NULL DEFAULT 'single_choice',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_poll_questions_event_id ON poll_questions (event_id);

CREATE TRIGGER trg_poll_questions_updated_at
  BEFORE UPDATE ON poll_questions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- poll_answers (polling)
-- ---------------------------------------------------------------------------
CREATE TABLE poll_answers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id         UUID NOT NULL REFERENCES poll_questions (id) ON DELETE CASCADE,
  voter_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  answer              TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_poll_answers_question_id ON poll_answers (question_id);
CREATE INDEX idx_poll_answers_voter_id ON poll_answers (voter_id);
CREATE UNIQUE INDEX idx_poll_answers_one_per_voter
  ON poll_answers (question_id, voter_id);

CREATE TRIGGER trg_poll_answers_updated_at
  BEFORE UPDATE ON poll_answers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Comments (documentation in DB)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE users IS 'All accounts. Admin uses username; organizer/voter use email. password stores bcrypt hash.';
COMMENT ON COLUMN users.password IS 'Bcrypt password hash — never store plaintext.';
COMMENT ON TABLE organizations IS 'Tenant container owned by an organizer.';
COMMENT ON TABLE events IS 'Voting/polling/pageant instance under an organization.';
COMMENT ON TABLE event_voters IS 'Voters enrolled in an event and vote completion flag.';
COMMENT ON TABLE invitations IS 'Voter invite with optional temporary password.';
COMMENT ON TABLE positions IS 'Election ballot positions.';
COMMENT ON TABLE candidates IS 'Election candidates per position.';
COMMENT ON TABLE contestants IS 'Pageant contestants.';
COMMENT ON TABLE criteria IS 'Pageant scoring rubric per event.';
COMMENT ON TABLE judge_scores IS 'Per-judge scores per contestant per criterion.';
COMMENT ON TABLE poll_questions IS 'Polling questions for an event.';
COMMENT ON TABLE poll_answers IS 'Voter responses to poll questions.';
