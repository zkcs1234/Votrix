-- Restore corrupted organizer emails after a bad archival script.
--
-- Symptom reported:
--   zarkenneth95@gmail.com_archived_1780639142_archived_...
--
-- Assumptions:
--  - The original email is always the prefix before the first '_archived_' token.
--  - We only touch users where role='organizer' and email contains '_archived_'.
--
-- IMPORTANT:
--  - Run inside a transaction.
--  - If you have multiple corrupted suffixes, this keeps the part before the first suffix.
--
-- If your original email format does NOT match this assumption, stop and use a backup-based restore.

BEGIN;

-- Restore email by removing everything after the first '_archived_' substring.
UPDATE users
SET
    email = split_part (email, '_archived_', 1)
WHERE
    role = 'organizer'
    AND email LIKE '%_archived_%'
    AND split_part (email, '_archived_', 1) <> ''
    AND email IS DISTINCT
FROM split_part (email, '_archived_', 1);

COMMIT;