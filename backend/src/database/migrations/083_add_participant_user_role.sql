-- Expand the account-role enum before application code starts writing
-- `participant`. Apply this file by itself and commit it before 084/085.
-- PostgreSQL does not permit a newly-added enum value to be used until the
-- transaction that adds it has committed, so this migration intentionally
-- contains no explicit BEGIN/COMMIT block.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'participant';