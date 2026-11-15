-- Migration 136: Migrate students to unified STUDENT type
--
-- Converts existing ELECTION_VOTER and POLLING_RESPONDENT entries
-- for student accounts to the new STUDENT type. This creates a cleaner
-- data model where students have ONE participant type that grants
-- access to both elections and polls.

BEGIN;

-- ===========================================================================
-- 1. Update CHECK constraint to allow STUDENT type
-- ===========================================================================

-- Drop the old constraint that only allows the 3 original types
ALTER TABLE user_participant_types
DROP CONSTRAINT IF EXISTS user_participant_types_participant_type_check;

-- Add new constraint that includes STUDENT
ALTER TABLE user_participant_types
ADD CONSTRAINT user_participant_types_participant_type_check
CHECK (participant_type IN (
  'ELECTION_VOTER',
  'COMPETITION_JUDGE',
  'POLLING_RESPONDENT',
  'STUDENT'
));

-- ===========================================================================
-- 2. Add STUDENT type to user_participant_types for all students
-- ===========================================================================

INSERT INTO user_participant_types (user_id, participant_type, is_active, created_by, created_at)
SELECT DISTINCT
  upt.user_id,
  'STUDENT'::VARCHAR(32) AS participant_type,
  TRUE AS is_active,
  upt.created_by,
  MIN(upt.created_at) AS created_at
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE 
  u.role IN ('voter', 'participant')
  AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT')
GROUP BY upt.user_id, upt.created_by
ON CONFLICT (user_id, participant_type) DO NOTHING;

-- ===========================================================================
-- 3. Remove old student-specific types (ELECTION_VOTER, POLLING_RESPONDENT)
-- ===========================================================================

DELETE FROM user_participant_types
WHERE participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT')
  AND user_id IN (
    SELECT id FROM users WHERE role IN ('voter', 'participant')
  );

-- ===========================================================================
-- 4. Update event_participants validation to allow STUDENT in both event types
-- ===========================================================================

DROP TRIGGER IF EXISTS trg_event_participants_validate_type ON event_participants;
DROP FUNCTION IF EXISTS fn_validate_participant_event_type();

CREATE OR REPLACE FUNCTION fn_validate_participant_event_type()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type TEXT;
BEGIN
  -- Get event type
  SELECT event_type INTO v_event_type
  FROM events
  WHERE id = NEW.event_id;
  
  -- STUDENT can participate in both election and polling events
  IF NEW.participant_type::text = 'STUDENT' THEN
    IF v_event_type NOT IN ('election', 'polling') THEN
      RAISE EXCEPTION 'STUDENT can only participate in election or polling events';
    END IF;
    
  -- ELECTION_VOTER restricted to elections (legacy support - shouldn't exist for students anymore)
  ELSIF NEW.participant_type::text = 'ELECTION_VOTER' THEN
    IF v_event_type != 'election' THEN
      RAISE EXCEPTION 'ELECTION_VOTER can only be assigned to election events';
    END IF;
    
  -- POLLING_RESPONDENT restricted to polling (legacy support - shouldn't exist for students anymore)
  ELSIF NEW.participant_type::text = 'POLLING_RESPONDENT' THEN
    IF v_event_type != 'polling' THEN
      RAISE EXCEPTION 'POLLING_RESPONDENT can only be assigned to polling events';
    END IF;
    
  -- COMPETITION_JUDGE restricted to competitions
  ELSIF NEW.participant_type::text = 'COMPETITION_JUDGE' THEN
    IF v_event_type NOT IN ('pageant', 'competition_scoring') THEN
      RAISE EXCEPTION 'COMPETITION_JUDGE can only be assigned to competition events';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_participants_validate_type
  BEFORE INSERT OR UPDATE OF participant_type ON event_participants
  FOR EACH ROW 
  EXECUTE FUNCTION fn_validate_participant_event_type();

-- ===========================================================================
-- 5. Create trigger to auto-assign STUDENT type when enrolling in events
-- ===========================================================================

CREATE OR REPLACE FUNCTION fn_auto_assign_student_type()
RETURNS TRIGGER AS $$
DECLARE
  v_user_has_student_type BOOLEAN;
  v_event_type TEXT;
BEGIN
  -- Check if user has STUDENT type in user_participant_types
  SELECT EXISTS (
    SELECT 1 FROM user_participant_types 
    WHERE user_id = NEW.user_id 
    AND participant_type = 'STUDENT'
  ) INTO v_user_has_student_type;
  
  -- Get event type
  SELECT event_type INTO v_event_type FROM events WHERE id = NEW.event_id;
  
  -- If user has STUDENT type and event is election/polling, use STUDENT type
  IF v_user_has_student_type AND v_event_type IN ('election', 'polling') THEN
    NEW.participant_type := 'STUDENT';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_assign_student_type ON event_participants;

CREATE TRIGGER trg_auto_assign_student_type
  BEFORE INSERT ON event_participants
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_assign_student_type();

-- ===========================================================================
-- 6. Update comments
-- ===========================================================================

COMMENT ON TYPE participant_type IS 
  'Participant types: STUDENT (can vote + respond to polls), COMPETITION_JUDGE (can score competitions), ELECTION_VOTER (legacy), POLLING_RESPONDENT (legacy)';

COMMENT ON TABLE user_participant_types IS 
  'Account-level participant type eligibility. Students have STUDENT type which grants access to both elections and polls.';

COMMENT ON FUNCTION fn_auto_assign_student_type() IS
  'Automatically assigns STUDENT participant_type when a user with STUDENT eligibility enrolls in an election or polling event';

-- ===========================================================================
-- 7. Verification Report
-- ===========================================================================

DO $$
DECLARE
  v_students_with_student_type INTEGER;
  v_total_students INTEGER;
  v_old_types_remaining INTEGER;
  v_judges_count INTEGER;
BEGIN
  -- Count total students
  SELECT COUNT(DISTINCT id)
  INTO v_total_students
  FROM users
  WHERE role IN ('voter', 'participant');
  
  -- Count students with STUDENT type
  SELECT COUNT(DISTINCT user_id)
  INTO v_students_with_student_type
  FROM user_participant_types
  WHERE participant_type = 'STUDENT';
  
  -- Count old voter/respondent types still for students
  SELECT COUNT(*)
  INTO v_old_types_remaining
  FROM user_participant_types upt
  JOIN users u ON u.id = upt.user_id
  WHERE u.role IN ('voter', 'participant')
    AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT');
  
  -- Count judges (should be unchanged)
  SELECT COUNT(DISTINCT user_id)
  INTO v_judges_count
  FROM user_participant_types
  WHERE participant_type = 'COMPETITION_JUDGE';
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 136: STUDENT Type Migration';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total students (role=voter/participant): %', v_total_students;
  RAISE NOTICE 'Students with STUDENT type: %', v_students_with_student_type;
  RAISE NOTICE 'Old student types remaining: %', v_old_types_remaining;
  RAISE NOTICE 'Judges (unchanged): %', v_judges_count;
  RAISE NOTICE '';
  
  IF v_old_types_remaining = 0 AND v_students_with_student_type = v_total_students THEN
    RAISE NOTICE '✓✓✓ SUCCESS: All students migrated to STUDENT type';
  ELSIF v_old_types_remaining > 0 THEN
    RAISE WARNING '⚠ Warning: % old student type entries remain', v_old_types_remaining;
  ELSIF v_students_with_student_type < v_total_students THEN
    RAISE WARNING '⚠ Warning: Only % of % students have STUDENT type', v_students_with_student_type, v_total_students;
  END IF;
  
  RAISE NOTICE '========================================';
END $$;

COMMIT;
