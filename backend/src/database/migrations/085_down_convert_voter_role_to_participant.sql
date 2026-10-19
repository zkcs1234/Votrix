-- Run only after the old application release is ready to be restored and
-- participant writes are paused.

BEGIN;

UPDATE users SET role = 'voter' WHERE role = 'participant';

COMMIT;