-- Rollback partial migration 136 run
-- Run this if migration 136 failed partway through

BEGIN;

-- Remove any STUDENT types that might have been partially added
DELETE FROM user_participant_types 
WHERE participant_type = 'STUDENT';

-- Ensure the CHECK constraint exists (in case it was dropped)
ALTER TABLE user_participant_types
DROP CONSTRAINT IF EXISTS user_participant_types_participant_type_check;

ALTER TABLE user_participant_types
ADD CONSTRAINT user_participant_types_participant_type_check
CHECK (participant_type IN (
  'ELECTION_VOTER',
  'COMPETITION_JUDGE',
  'POLLING_RESPONDENT'
));

COMMIT;

-- Now you can run the fixed migration 136
