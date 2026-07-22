-- Track whether a voter was a new account when invited
-- This allows send-invitation to skip password reset for existing accounts

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS is_new_account BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN invitations.is_new_account IS
  'Set to false when inviting an existing account (no password reset needed)';

-- Backfill: set is_new_account = false for invitations where the user
-- was already enrolled in other events (indicated by must_change_password = false)
-- or has been invited before (invitation_sent = true previously)
UPDATE invitations
SET is_new_account = false
WHERE invitation_sent = true
  AND EXISTS (
    SELECT 1 FROM users
    WHERE users.id = invitations.voter_id
    AND users.must_change_password = false
  );

-- Also set to false for users who have been invited to other events
UPDATE invitations
SET is_new_account = false
WHERE is_new_account = true
  AND EXISTS (
    SELECT 1 FROM invitations i2
    WHERE i2.voter_id = invitations.voter_id
    AND i2.id != invitations.id
    AND i2.invitation_sent = true
  );
