-- Migration 140 — Organization officers (student officers)
--
-- Phase A of docs/plans/organizer-invitation-and-student-officers-plan.md.
-- Additive and NON-BEHAVIORAL: nothing reads this table until the officer
-- middleware (Phase E) is deployed.
--
-- An organizer assigns a student (a participant account) as an "officer". An
-- active officer works inside the existing organizer workspace AS the owner
-- organizer; the student's own role stays `participant`.
--
-- Keyed by organizer_id (the owner's users.id), not organizations.id: the
-- organizations row is created lazily and is already 1:1 with the organizer
-- (migration 028).
--
-- Rules enforced here:
--   - UNIQUE (organizer_id, student_id): one row per pairing; re-activation
--     flips status instead of inserting a duplicate.
--   - One ACTIVE officership per student (plan decision P8), via a partial
--     unique index. Multi-organization officers can be allowed later by
--     dropping that index.
--   - A user cannot be their own officer.
-- Application-level rules (student must be role participant + profile_type
-- 'student' and inside the owner's scope) live in the service, not here.
--
-- Idempotent (IF NOT EXISTS), safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS organization_officers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id   UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  position       VARCHAR(255) NOT NULL,
  status         VARCHAR(16) NOT NULL DEFAULT 'active',
  assigned_by    UUID REFERENCES users (id) ON DELETE SET NULL,
  assigned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_by UUID REFERENCES users (id) ON DELETE SET NULL,
  deactivated_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_organization_officers_status
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT chk_organization_officers_not_self
    CHECK (organizer_id <> student_id),
  CONSTRAINT uq_organization_officers_pair
    UNIQUE (organizer_id, student_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_officers_one_active_per_student
  ON organization_officers (student_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_organization_officers_organizer_status
  ON organization_officers (organizer_id, status);

COMMENT ON TABLE organization_officers IS 'Students assigned by an organizer to act inside the organizer workspace as that organizer. Membership is re-read from this table on every request (no caching) so deactivation is immediate.';

-- Deny-all for Supabase's public API roles (see 138). This table grants access to
-- the organizer workspace, so it must never be writable through the public API.
ALTER TABLE organization_officers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE organization_officers FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.organization_officers FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

ANALYZE organization_officers;

COMMIT;
