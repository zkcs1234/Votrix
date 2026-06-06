-- Debug helper: find organizer users and their status.
-- Helps diagnose organizer sign-in errors (403 pending/suspended/archived).

SELECT u.id, u.email, u.username, u.role, u.account_status, u.must_change_password, u.created_at
FROM users u
WHERE
    u.role = 'organizer'
ORDER BY u.created_at DESC;

-- Also show organizations owned by organizer users.
SELECT
    o.id AS organization_id,
    o.organization_name,
    o.organization_type,
    o.status AS organization_status,
    o.organizer_id,
    u.email AS organizer_email
FROM organizations o
    JOIN users u ON u.id = o.organizer_id
WHERE
    u.role = 'organizer'
ORDER BY o.created_at DESC;