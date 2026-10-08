-- Apply only after the deployed application accepts both `voter` and
-- `participant` as participant accounts (including auth/session claims).
-- This changes the existing account role in place; it does not create users
-- or alter event enrollment, ballots, responses, scores, or assignments.

BEGIN;

UPDATE users SET role = 'participant' WHERE role = 'voter';

COMMIT;