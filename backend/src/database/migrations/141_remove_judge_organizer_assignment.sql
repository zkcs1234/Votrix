-- 141_remove_judge_organizer_assignment.sql
--
-- Judges are now a global pool: every active judge is visible to every
-- organizer, and each organizer picks the judges for their own events. The old
-- admin-side "assign judge to organizer" mapping (users.profile_data.organizerIds)
-- is no longer read by the application, so remove the stale values.
--
-- Data-only and idempotent. The removed mapping CANNOT be restored by the down
-- file: back up (or export judges) first if you may want it later.

UPDATE users
SET profile_data = profile_data - 'organizerIds'
WHERE profile_data IS NOT NULL
  AND profile_data ? 'organizerIds';
