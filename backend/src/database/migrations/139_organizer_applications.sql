-- Migration 139 — Organizer applications
--
-- Phase A of docs/plans/organizer-invitation-and-student-officers-plan.md.
-- Additive and NON-BEHAVIORAL.
--
-- What an invitee submits through their invitation link. Nothing is created in
-- `users` until an admin approves; approval calls the existing
-- createOrganizerAccount() path, so the profile columns below deliberately
-- mirror the users columns they will be copied to:
--
--   organizer_name            -> users.organizer_name
--   position                  -> users.position
--   organization_name         -> users.organization_name
--   organization_type_display -> users.organization_type_display
--   requested_scope           -> users.scope  (same JSONB shape as migration 076:
--                                { scopeType: all|scoped, programs: [], sections: [] })
--
-- One application per invitation (UNIQUE invitation_id).
--
-- certificates: JSONB array of private-storage references, e.g.
--   [{ "publicId": "...", "resourceType": "image|raw", "format": "pdf",
--      "name": "cert.pdf", "mime": "application/pdf", "size": 12345 }]
--
-- Idempotent (IF NOT EXISTS), safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS organizer_applications (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id              UUID NOT NULL REFERENCES organizer_invitations (id) ON DELETE CASCADE,
  email                      VARCHAR(255) NOT NULL,
  organizer_name             VARCHAR(255) NOT NULL,
  position                   VARCHAR(255) NOT NULL,
  organization_name          VARCHAR(255) NOT NULL,
  organization_type_display  VARCHAR(255) NOT NULL,
  requested_scope            JSONB NOT NULL DEFAULT '{"scopeType":"all","programs":[],"sections":[]}'::jsonb,
  certificates               JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                     VARCHAR(16) NOT NULL DEFAULT 'pending',
  decline_reason             TEXT,
  reviewed_by                UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at                TIMESTAMPTZ,
  organizer_user_id          UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_organizer_applications_status
    CHECK (status IN ('pending', 'approved', 'declined')),
  CONSTRAINT chk_organizer_applications_email_lower
    CHECK (email = lower(email))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizer_applications_invitation
  ON organizer_applications (invitation_id);

CREATE INDEX IF NOT EXISTS idx_organizer_applications_status_created
  ON organizer_applications (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organizer_applications_email
  ON organizer_applications (email);

COMMENT ON TABLE organizer_applications IS 'Organizer applications submitted via an invitation link; reviewed by an admin. Approval creates the organizer through createOrganizerAccount().';

-- Deny-all for Supabase's public API roles (see 138). This table holds applicant
-- emails, names and references to private certificate files.
ALTER TABLE organizer_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE organizer_applications FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.organizer_applications FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

ANALYZE organizer_applications;

COMMIT;
