-- Read-only verification for migrations 083-086.
-- Run before and after migration 084, then again before 086.

-- Existing account roles and legacy profile values.
SELECT role::text AS user_role, profile_type, COUNT(*) AS account_count
FROM users
GROUP BY role, profile_type
ORDER BY role::text, profile_type;

-- Membership totals and accounts per participant type.
SELECT
    participant_type,
    is_active,
    COUNT(*) AS membership_count,
    COUNT(DISTINCT user_id) AS account_count
FROM user_participant_types
GROUP BY
    participant_type,
    is_active
ORDER BY participant_type, is_active;

-- Existing event participants without an active matching pool membership.
-- Investigate each result before enabling organizer pool selection.
SELECT ep.participant_type::text AS participant_type,
       COUNT(*) AS enrollment_count,
       COUNT(DISTINCT ep.user_id) AS account_count
FROM event_participants ep
LEFT JOIN user_participant_types upt
  ON upt.user_id = ep.user_id
 AND upt.participant_type = ep.participant_type::text
 AND upt.is_active = TRUE
GROUP BY ep.participant_type::text
HAVING COUNT(*) FILTER (WHERE upt.user_id IS NULL) > 0
ORDER BY ep.participant_type::text;

-- Must return zero rows before migration 086 creates the global participant
-- school-ID unique index.
SELECT lower(school_id) AS normalized_school_id,
       ARRAY_AGG(email ORDER BY email) AS emails,
       COUNT(*) AS account_count
FROM users
WHERE role::text IN ('voter', 'participant')
  AND school_id IS NOT NULL
GROUP BY lower(school_id)
HAVING COUNT(*) > 1
ORDER BY normalized_school_id;

-- Run after migration 085; must return zero rows before retiring old role code.
SELECT COUNT(*) AS legacy_voter_accounts
FROM users
WHERE role::text = 'voter';