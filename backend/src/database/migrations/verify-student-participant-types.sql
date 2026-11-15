-- Verification Script: Student Participant Types
-- Run this to diagnose the current state of student participant types
-- This does NOT make any changes - it only reports the current state

\echo '========================================'
\echo 'Student Participant Type Verification'
\echo '========================================'
\echo ''

-- ===========================================================================
-- 1. Overview: Count students by type configuration
-- ===========================================================================
\echo '1. OVERVIEW: Student Type Configuration'
\echo '----------------------------------------'

SELECT 
  CASE 
    WHEN type_count = 0 THEN 'No participant types'
    WHEN type_count = 1 AND 'ELECTION_VOTER' = ANY(types) THEN 'Only ELECTION_VOTER'
    WHEN type_count = 1 AND 'POLLING_RESPONDENT' = ANY(types) THEN 'Only POLLING_RESPONDENT'
    WHEN type_count = 2 THEN 'Both types (CORRECT)'
    ELSE 'Other configuration'
  END as configuration,
  COUNT(*) as student_count
FROM (
  SELECT 
    u.id,
    COALESCE(array_agg(upt.participant_type::text) FILTER (WHERE upt.participant_type IS NOT NULL), ARRAY[]::text[]) as types,
    COUNT(upt.participant_type) as type_count
  FROM users u
  LEFT JOIN user_participant_types upt ON upt.user_id = u.id
    AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT')
  WHERE u.role IN ('voter', 'participant')
  GROUP BY u.id
) counts
GROUP BY configuration
ORDER BY student_count DESC;

\echo ''
\echo '✓ Expected: All students should have "Both types (CORRECT)"'
\echo '✗ Problem: Students with only one type cannot access both modules'
\echo ''

-- ===========================================================================
-- 2. Problem Students: List students missing one or both types
-- ===========================================================================
\echo '2. PROBLEM STUDENTS: Missing Participant Types'
\echo '----------------------------------------------'

SELECT 
  u.id,
  u.email,
  u.role,
  u.account_status,
  COALESCE(
    array_agg(upt.participant_type::text ORDER BY upt.participant_type::text) 
    FILTER (WHERE upt.participant_type IS NOT NULL), 
    ARRAY[]::text[]
  ) as current_types,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM user_participant_types upt1 
      WHERE upt1.user_id = u.id AND upt1.participant_type = 'ELECTION_VOTER'
    ) THEN 'NEEDS: ELECTION_VOTER'
    WHEN NOT EXISTS (
      SELECT 1 FROM user_participant_types upt2 
      WHERE upt2.user_id = u.id AND upt2.participant_type = 'POLLING_RESPONDENT'
    ) THEN 'NEEDS: POLLING_RESPONDENT'
    ELSE 'OK'
  END as missing_type
FROM users u
LEFT JOIN user_participant_types upt ON upt.user_id = u.id
  AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT')
WHERE u.role IN ('voter', 'participant')
GROUP BY u.id, u.email, u.role, u.account_status
HAVING COUNT(upt.participant_type) < 2
ORDER BY u.email;

\echo ''
\echo '✓ Expected: 0 rows (no problem students)'
\echo '✗ If rows appear: These students need the immediate-fix script'
\echo ''

-- ===========================================================================
-- 3. Sample of correct students (for comparison)
-- ===========================================================================
\echo '3. SAMPLE: Correctly Configured Students (first 5)'
\echo '--------------------------------------------------'

SELECT 
  u.email,
  array_agg(upt.participant_type::text ORDER BY upt.participant_type::text) as participant_types
FROM users u
JOIN user_participant_types upt ON upt.user_id = u.id
WHERE u.role IN ('voter', 'participant')
  AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT')
GROUP BY u.id, u.email
HAVING COUNT(upt.participant_type) = 2
ORDER BY u.email
LIMIT 5;

\echo ''
\echo '✓ Expected: Each student should have {ELECTION_VOTER,POLLING_RESPONDENT}'
\echo ''

-- ===========================================================================
-- 4. Judge verification (should NOT have student types)
-- ===========================================================================
\echo '4. JUDGE VERIFICATION: Should only have COMPETITION_JUDGE'
\echo '----------------------------------------------------------'

SELECT 
  u.email,
  array_agg(DISTINCT upt.participant_type::text ORDER BY upt.participant_type::text) as types,
  CASE 
    WHEN array_agg(DISTINCT upt.participant_type::text) = ARRAY['COMPETITION_JUDGE']::text[] 
    THEN '✓ CORRECT'
    ELSE '✗ PROBLEM'
  END as status
FROM users u
JOIN user_participant_types upt ON upt.user_id = u.id
WHERE upt.participant_type = 'COMPETITION_JUDGE'
GROUP BY u.id, u.email
ORDER BY status DESC, u.email
LIMIT 10;

\echo ''
\echo '✓ Expected: All judges should have status = "✓ CORRECT"'
\echo '✗ If "✗ PROBLEM": Judge has student types (should not)'
\echo ''

-- ===========================================================================
-- 5. Event participation check
-- ===========================================================================
\echo '5. EVENT PARTICIPATION: Check event enrollments'
\echo '------------------------------------------------'

SELECT 
  e.event_type,
  ep.participant_type,
  COUNT(*) as enrollment_count
FROM event_participants ep
JOIN events e ON e.id = ep.event_id
GROUP BY e.event_type, ep.participant_type
ORDER BY e.event_type, ep.participant_type;

\echo ''
\echo '✓ Expected: ELECTION_VOTER in election events, POLLING_RESPONDENT in polling'
\echo ''

-- ===========================================================================
-- 6. Summary Statistics
-- ===========================================================================
\echo '6. SUMMARY STATISTICS'
\echo '---------------------'

DO $$
DECLARE
  v_total_students INTEGER;
  v_students_correct INTEGER;
  v_students_missing INTEGER;
  v_students_only_voter INTEGER;
  v_students_only_respondent INTEGER;
  v_students_no_type INTEGER;
  v_total_judges INTEGER;
  v_percentage_correct NUMERIC;
BEGIN
  -- Count total students
  SELECT COUNT(DISTINCT u.id)
  INTO v_total_students
  FROM users u
  WHERE u.role IN ('voter', 'participant');
  
  -- Count students with both types (correct)
  SELECT COUNT(DISTINCT u.id)
  INTO v_students_correct
  FROM users u
  WHERE u.role IN ('voter', 'participant')
    AND EXISTS (SELECT 1 FROM user_participant_types WHERE user_id = u.id AND participant_type = 'ELECTION_VOTER')
    AND EXISTS (SELECT 1 FROM user_participant_types WHERE user_id = u.id AND participant_type = 'POLLING_RESPONDENT');
  
  -- Count students with only ELECTION_VOTER
  SELECT COUNT(DISTINCT u.id)
  INTO v_students_only_voter
  FROM users u
  WHERE u.role IN ('voter', 'participant')
    AND EXISTS (SELECT 1 FROM user_participant_types WHERE user_id = u.id AND participant_type = 'ELECTION_VOTER')
    AND NOT EXISTS (SELECT 1 FROM user_participant_types WHERE user_id = u.id AND participant_type = 'POLLING_RESPONDENT');
  
  -- Count students with only POLLING_RESPONDENT
  SELECT COUNT(DISTINCT u.id)
  INTO v_students_only_respondent
  FROM users u
  WHERE u.role IN ('voter', 'participant')
    AND EXISTS (SELECT 1 FROM user_participant_types WHERE user_id = u.id AND participant_type = 'POLLING_RESPONDENT')
    AND NOT EXISTS (SELECT 1 FROM user_participant_types WHERE user_id = u.id AND participant_type = 'ELECTION_VOTER');
  
  -- Count students with no types
  SELECT COUNT(DISTINCT u.id)
  INTO v_students_no_type
  FROM users u
  WHERE u.role IN ('voter', 'participant')
    AND NOT EXISTS (
      SELECT 1 FROM user_participant_types 
      WHERE user_id = u.id 
      AND participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT')
    );
  
  v_students_missing := v_students_only_voter + v_students_only_respondent + v_students_no_type;
  
  -- Calculate percentage
  IF v_total_students > 0 THEN
    v_percentage_correct := (v_students_correct::NUMERIC / v_total_students::NUMERIC) * 100;
  ELSE
    v_percentage_correct := 0;
  END IF;
  
  -- Count judges
  SELECT COUNT(DISTINCT user_id)
  INTO v_total_judges
  FROM user_participant_types
  WHERE participant_type = 'COMPETITION_JUDGE';
  
  RAISE NOTICE 'Total Students: %', v_total_students;
  RAISE NOTICE 'Students with BOTH types (correct): % (%% )', v_students_correct, ROUND(v_percentage_correct, 1);
  RAISE NOTICE '';
  RAISE NOTICE 'PROBLEMS:';
  RAISE NOTICE '  - Only ELECTION_VOTER: %', v_students_only_voter;
  RAISE NOTICE '  - Only POLLING_RESPONDENT: %', v_students_only_respondent;
  RAISE NOTICE '  - No participant types: %', v_students_no_type;
  RAISE NOTICE '  - Total problematic: %', v_students_missing;
  RAISE NOTICE '';
  RAISE NOTICE 'Judges (should be separate): %', v_total_judges;
  RAISE NOTICE '';
  
  IF v_students_missing = 0 THEN
    RAISE NOTICE '✓✓✓ ALL STUDENTS CONFIGURED CORRECTLY ✓✓✓';
  ELSE
    RAISE NOTICE '✗✗✗ % STUDENTS NEED TO BE FIXED ✗✗✗', v_students_missing;
    RAISE NOTICE '';
    RAISE NOTICE 'ACTION REQUIRED:';
    RAISE NOTICE '  Run: backend/src/database/migrations/immediate-fix-student-types.sql';
  END IF;
END $$;

\echo ''
\echo '========================================'
\echo 'End of Verification Report'
\echo '========================================'
