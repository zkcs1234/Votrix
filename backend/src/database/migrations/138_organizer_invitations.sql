-- Migration 138 — Organizer invitations
--
-- Phase A of docs/plans/organizer-invitation-and-student-officers-plan.md.
-- Additive and NON-BEHAVIORAL: nothing reads this table until the Phase B
-- services are deployed.
--
-- An admin invites an email address; the invitee receives a single-use,
-- expiring link and submits an application (migration 139). Only the SHA-256
-- hash of the token is stored (same approach as password_reset_tokens, 003) —
-- the raw token exists only in the emailed link.
--
-- "Expired" is derived (expires_at < now()) rather than stored, so an
-- invitation can never get stuck in a stale status.
--
-- Named organizer_invitations on purpose: `invitations` is the existing voter /
-- judge event-invitation table.
--
-- Idempotent (IF NOT EXISTS), safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS organizer_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) NOT NULL,
  token_hash  TEXT NOT NULL,
  note        TEXT,
  status      VARCHAR(16) NOT NULL DEFAULT 'pending',
  expires_at  TIMESTAMPTZ NOT NULL,
  created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
  used_at     TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_organizer_invitations_status
    CHECK (status IN ('pending', 'used', 'revoked')),
  CONSTRAINT chk_organizer_invitations_email_lower
    CHECK (email = lower(email))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizer_invitations_token_hash
  ON organizer_invitations (token_hash);

CREATE INDEX IF NOT EXISTS idx_organizer_invitations_email
  ON organizer_invitations (email);

CREATE INDEX IF NOT EXISTS idx_organizer_invitations_status_created
  ON organizer_invitations (status, created_at DESC);

COMMENT ON TABLE organizer_invitations IS 'Single-use, expiring organizer invitation links (store SHA-256 token hash only). status: pending | used | revoked; expiry is derived from expires_at.';

-- Deny-all for Supabase's public API roles, same convention as the other private
-- tables (e.g. 101): RLS on, no policies, no grants to PUBLIC/anon/authenticated.
-- The backend uses the service-role key, which bypasses RLS. This table holds
-- invitation-token hashes, so it must never be readable through the public API.
ALTER TABLE organizer_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE organizer_invitations FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.organizer_invitations FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

ANALYZE organizer_invitations;

COMMIT;
