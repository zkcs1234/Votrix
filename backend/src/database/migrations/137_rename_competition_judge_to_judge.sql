-- Migration 137: Rename COMPETITION_JUDGE to JUDGE in user_participant_types
-- 
-- Purpose: Clarify distinction between eligibility pool and event-specific roles
-- - user_participant_types.participant_type = 'JUDGE' (can judge competitions - eligibility)
-- - event_participants.participant_type = 'COMPETITION_JUDGE' (judging specific event - enrollment)
--
-- This follows the same pattern as STUDENT:
-- - user_participant_types = 'STUDENT' (can vote/respond - eligibility)
-- - event_participants = 'ELECTION_VOTER' or 'POLLING_RESPONDENT' (specific event role)

BEGIN;

-- Step 1: Add new JUDGE enum value to participant_type
ALTER TYPE participant_type ADD VALUE IF NOT EXISTS 'JUDGE';

-- Step 2: Drop CHECK constraint BEFORE updating data
-- (Otherwise the UPDATE will fail because JUDGE isn't allowed yet)
ALTER TABLE user_participant_types
DROP CONSTRAINT IF EXISTS user_participant_types_participant_type_check;

-- Step 3: Migrate existing COMPETITION_JUDGE records to JUDGE in user_participant_types
-- Note: event_participants table keeps COMPETITION_JUDGE (specific event role)
UPDATE user_participant_types
SET participant_type = 'JUDGE'
WHERE participant_type = 'COMPETITION_JUDGE';

-- Step 4: Recreate CHECK constraint to allow JUDGE (and remove COMPETITION_JUDGE from eligibility)
ALTER TABLE user_participant_types
ADD CONSTRAINT user_participant_types_participant_type_check
CHECK (participant_type IN ('STUDENT', 'JUDGE', 'ORGANIZER'));

-- Verification queries (commented out - for manual testing):
-- SELECT participant_type, COUNT(*) FROM user_participant_types GROUP BY participant_type;
-- SELECT DISTINCT participant_type FROM event_participants WHERE participant_type LIKE '%JUDGE%';

COMMIT;

-- Rollback script (if needed):
-- BEGIN;
-- ALTER TYPE participant_type ADD VALUE IF NOT EXISTS 'COMPETITION_JUDGE';
-- UPDATE user_participant_types SET participant_type = 'COMPETITION_JUDGE' WHERE participant_type = 'JUDGE';
-- ALTER TABLE user_participant_types DROP CONSTRAINT IF EXISTS user_participant_types_participant_type_check;
-- ALTER TABLE user_participant_types ADD CONSTRAINT user_participant_types_participant_type_check 
--   CHECK (participant_type IN ('STUDENT', 'COMPETITION_JUDGE', 'ORGANIZER', 'ELECTION_VOTER', 'POLLING_RESPONDENT'));
-- COMMIT;
