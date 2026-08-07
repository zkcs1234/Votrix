-- Migration 035: user_sessions
-- Enables per-session tracking and revocation for admin session management.

CREATE TABLE IF NOT EXISTS user_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_version     INTEGER NOT NULL DEFAULT 0,
  ip_address        INET,
  user_agent        TEXT,
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON user_sessions (user_id, last_activity_at DESC);
