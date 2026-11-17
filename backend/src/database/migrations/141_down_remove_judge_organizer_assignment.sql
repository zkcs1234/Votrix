-- 141_down_remove_judge_organizer_assignment.sql
--
-- Intentionally a no-op. Migration 141 deleted users.profile_data.organizerIds
-- and the values are not stored anywhere else, so they cannot be restored.
-- Restore them from a backup taken before applying 141 if they are needed.
SELECT 1;
