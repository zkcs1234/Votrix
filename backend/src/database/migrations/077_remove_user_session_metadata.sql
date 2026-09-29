-- Remove stored client network and device metadata from user sessions.
BEGIN;

ALTER TABLE user_sessions
DROP COLUMN IF EXISTS ip_address,
DROP COLUMN IF EXISTS user_agent;

UPDATE audit_logs
SET
    details = details - 'ip' - 'userAgent'
WHERE (
        action = 'LOGIN_FAILED'
        OR action LIKE '%_LOGIN_SUCCESS'
    )
    AND details IS NOT NULL
    AND (
        details ? 'ip'
        OR details ? 'userAgent'
    );

COMMIT;