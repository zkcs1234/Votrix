-- Verify why login fails (organizer + admin + voter)
-- Run after executing archive/restore scripts.

-- 1) Admin accounts
SELECT
    id,
    username,
    email,
    role,
    account_status,
    must_change_password
FROM users
WHERE
    role = 'admin'
ORDER BY created_at DESC
LIMIT 50;

-- 2) Organizer accounts
SELECT
    id,
    email,
    role,
    account_status,
    must_change_password,
    created_at
FROM users
WHERE
    role = 'organizer'
ORDER BY created_at DESC
LIMIT 50;

-- 3) Any corrupted organizer emails that still contain '_archived_'
SELECT id, email, account_status
FROM users
WHERE
    role = 'organizer'
    AND email LIKE '%_archived_%'
ORDER BY created_at DESC
LIMIT 50;

-- 4) Emails that are not unique after corruption (may block some flows)
SELECT email, COUNT(*) as cnt
FROM users
GROUP BY
    email
HAVING
    COUNT(*) > 1
ORDER BY cnt DESC, email ASC
LIMIT 50;