# ALTERNATIVE PLAN: Add "STUDENT" Participant Type (Cleaner Approach)

> **Frontend status (Phase 3):** aligned. The admin Students panel loads one list, **Add Student** makes one `createVoter` request (the backend assigns `STUDENT`), CSV import registers once, and status changes make one call. The earlier "also add a respondent membership" step was removed; it called `POST /admin/respondents/:id/membership`, which never existed, so every Add Student showed a misleading "created as Voter only" warning. The student *View* modal no longer lists participant types. Still open from this plan: run migrations 135–137 on the database.

## The Better Solution

Instead of giving students BOTH `ELECTION_VOTER` and `POLLING_RESPONDENT` types (which is messy), we should add a **NEW participant type called `STUDENT`** that can participate in BOTH elections and polling events.

---

## Current Problem

**Current participant_type enum:**
```sql
CREATE TYPE participant_type AS ENUM (
  'ELECTION_VOTER',        -- Can only vote in elections
  'COMPETITION_JUDGE',     -- Can only judge competitions
  'POLLING_RESPONDENT'     -- Can only respond to polls
);
```

**Issue:** Students need to access BOTH elections and polls, but the types are module-specific.

---

## NEW Approach: Add "STUDENT" Type

### Phase 1: Database Schema Changes

#### Step 1: Add "STUDENT" to participant_type enum

**File:** `backend/src/database/migrations/135_add_student_participant_type.sql`

```sql
-- Migration 135: Add STUDENT participant type
--
-- This adds a unified STUDENT type that can participate in both
-- elections and polling events, replacing the need for students
-- to have multiple participant types.

BEGIN;

-- ===========================================================================
-- 1. Add STUDENT to the participant_type enum
-- ===========================================================================

ALTER TYPE participant_type ADD VALUE IF NOT EXISTS 'STUDENT';

-- Note: Must commit before using the new enum value in same transaction
COMMIT;
```

#### Step 2: Migrate existing students to STUDENT type

**File:** `backend/src/database/migrations/136_migrate_to_student_type.sql`

```sql
-- Migration 136: Migrate students to unified STUDENT type
--
-- Converts existing ELECTION_VOTER and POLLING_RESPONDENT entries
-- for student accounts to the new STUDENT type.

BEGIN;

-- ===========================================================================
-- 1. Convert user_participant_types to STUDENT
-- ===========================================================================

-- For students with ELECTION_VOTER or POLLING_RESPONDENT, replace with STUDENT
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

-- Remove old ELECTION_VOTER and POLLING_RESPONDENT types for students
DELETE FROM user_participant_types
WHERE participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT')
  AND user_id IN (
    SELECT id FROM users WHERE role IN ('voter', 'participant')
  );

-- ===========================================================================
-- 2. Update event_participants validation trigger
-- ===========================================================================

DROP TRIGGER IF EXISTS trg_event_participants_validate_type ON event_participants;
DROP FUNCTION IF EXISTS fn_validate_participant_event_type();

CREATE OR REPLACE FUNCTION fn_validate_participant_event_type()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type TEXT;
  v_user_role TEXT;
BEGIN
  -- Get event type and user role
  SELECT e.event_type, u.role 
  INTO v_event_type, v_user_role
  FROM events e
  JOIN users u ON u.id = NEW.user_id
  WHERE e.id = NEW.event_id;
  
  -- STUDENT can participate in both election and polling events
  IF NEW.participant_type = 'STUDENT' THEN
    IF v_event_type NOT IN ('election', 'polling') THEN
      RAISE EXCEPTION 'STUDENT can only participate in election or polling events';
    END IF;
    
  -- ELECTION_VOTER restricted to elections (legacy support)
  ELSIF NEW.participant_type = 'ELECTION_VOTER' THEN
    IF v_event_type != 'election' THEN
      RAISE EXCEPTION 'ELECTION_VOTER can only be assigned to election events';
    END IF;
    
  -- POLLING_RESPONDENT restricted to polling (legacy support)
  ELSIF NEW.participant_type = 'POLLING_RESPONDENT' THEN
    IF v_event_type != 'polling' THEN
      RAISE EXCEPTION 'POLLING_RESPONDENT can only be assigned to polling events';
    END IF;
    
  -- COMPETITION_JUDGE restricted to competitions
  ELSIF NEW.participant_type = 'COMPETITION_JUDGE' THEN
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
-- 3. Update event enrollment logic to use STUDENT type
-- ===========================================================================

-- When a STUDENT user enrolls in an event, use STUDENT type (not the old specific types)
CREATE OR REPLACE FUNCTION fn_assign_student_participant_type()
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
  
  -- If user has STUDENT type and event is election/polling, force STUDENT type
  IF v_user_has_student_type AND v_event_type IN ('election', 'polling') THEN
    NEW.participant_type := 'STUDENT';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_student_participant_type ON event_participants;

CREATE TRIGGER trg_assign_student_participant_type
  BEFORE INSERT ON event_participants
  FOR EACH ROW
  EXECUTE FUNCTION fn_assign_student_participant_type();

-- ===========================================================================
-- 4. Comments
-- ===========================================================================

COMMENT ON TYPE participant_type IS 
  'STUDENT (elections + polls) | COMPETITION_JUDGE (competitions) | ELECTION_VOTER (legacy) | POLLING_RESPONDENT (legacy)';

-- ===========================================================================
-- 5. Verification Report
-- ===========================================================================

DO $$
DECLARE
  v_students_migrated INTEGER;
  v_old_types_remaining INTEGER;
BEGIN
  -- Count students now using STUDENT type
  SELECT COUNT(DISTINCT user_id)
  INTO v_students_migrated
  FROM user_participant_types
  WHERE participant_type = 'STUDENT';
  
  -- Count old voter/respondent types still in use for students
  SELECT COUNT(*)
  INTO v_old_types_remaining
  FROM user_participant_types upt
  JOIN users u ON u.id = upt.user_id
  WHERE u.role IN ('voter', 'participant')
    AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT');
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 136: Student Type Migration';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Students migrated to STUDENT type: %', v_students_migrated;
  RAISE NOTICE 'Old student types remaining: %', v_old_types_remaining;
  
  IF v_old_types_remaining = 0 THEN
    RAISE NOTICE '✓ All students successfully migrated to STUDENT type';
  ELSE
    RAISE WARNING '⚠ Some old student types remain - check migration logic';
  END IF;
  
  RAISE NOTICE '========================================';
END $$;

COMMIT;
```

---

### Phase 2: Backend Service Updates

**File:** `backend/src/services/admin.service.js`

Update student creation to use STUDENT type:

```javascript
// In createVoterAccount function
export async function createVoterAccount(input) {
  // ... existing validation code ...
  
  // Create the user account
  const user = await db.query(/* ... existing user creation ... */)
  
  // Add STUDENT participant type (replaces old ELECTION_VOTER)
  await db.query(
    `INSERT INTO user_participant_types (user_id, participant_type, is_active)
     VALUES ($1, 'STUDENT', true)
     ON CONFLICT (user_id, participant_type) DO NOTHING`,
    [user.id]
  )
  
  // ... rest of existing code ...
}

// In createRespondentAccount function
export async function createRespondentAccount(input) {
  // ... existing validation code ...
  
  // Create the user account
  const user = await db.query(/* ... existing user creation ... */)
  
  // Add STUDENT participant type (replaces old POLLING_RESPONDENT)
  await db.query(
    `INSERT INTO user_participant_types (user_id, participant_type, is_active)
     VALUES ($1, 'STUDENT', true)
     ON CONFLICT (user_id, participant_type) DO NOTHING`,
    [user.id]
  )
  
  // ... rest of existing code ...
}
```

---

### Phase 3: Frontend Updates (Minimal Changes)

The frontend already treats "students" as a unified category, so minimal changes needed. Just ensure the admin service calls work with the new type.

---

## Database Schema Comparison

### BEFORE (Current - Messy)
```
user_participant_types:
user_id    | participant_type    
-----------|--------------------
student-1  | ELECTION_VOTER       ← needs 2 rows
student-1  | POLLING_RESPONDENT   ← messy!
judge-1    | COMPETITION_JUDGE
```

### AFTER (NEW - Clean!)
```
user_participant_types:
user_id    | participant_type    
-----------|--------------------
student-1  | STUDENT              ← single row, cleaner!
judge-1    | COMPETITION_JUDGE
```

---

## How Event Enrollment Works

### When Student Enrolls in Election
```sql
INSERT INTO event_participants (event_id, user_id, participant_type)
VALUES ('election-123', 'student-1', 'STUDENT');  -- Uses STUDENT type!
```

### When Student Enrolls in Poll
```sql
INSERT INTO event_participants (event_id, user_id, participant_type)
VALUES ('poll-456', 'student-1', 'STUDENT');  -- Same STUDENT type!
```

The validation trigger allows STUDENT type in BOTH election and polling events.

---

## Advantages of This Approach

### ✅ Cleaner Database
- Students have **1 row** in user_participant_types instead of 2
- More intuitive: "STUDENT" type = student behavior

### ✅ Better Semantics
- `STUDENT` clearly represents the user role
- No confusion about needing multiple types

### ✅ Easier Backend Logic
- Single type to check: `WHERE participant_type = 'STUDENT'`
- No need to check multiple types

### ✅ Matches Frontend Concept
- Frontend shows "Students" as one category
- Database now mirrors this concept

### ✅ Future-Proof
- Easy to add more student capabilities later
- Just update the validation trigger

---

## Migration Path

### Option A: Clean Migration (Recommended)

```
1. Run migration 135 (add STUDENT enum value)
2. Run migration 136 (migrate data + update validation)
3. Update backend services to use STUDENT type
4. Test thoroughly
5. Deploy
```

### Option B: Gradual Migration

```
1. Run migration 135 (add STUDENT enum value)
2. Run migration 136 (keeps old types, adds STUDENT as additional)
3. Update backend to create new students with STUDENT type
4. Gradually migrate old accounts
5. Eventually deprecate ELECTION_VOTER/POLLING_RESPONDENT
```

---

## SQL to Run RIGHT NOW (Immediate Fix)

Since you can't add enum values in the same transaction they're used, here's the immediate fix:

**File:** `backend/src/database/migrations/immediate-student-type-fix.sql`

```sql
-- IMMEDIATE FIX: Add STUDENT type and migrate
-- Run this in TWO separate transactions

-- TRANSACTION 1: Add the enum value
ALTER TYPE participant_type ADD VALUE IF NOT EXISTS 'STUDENT';

-- Wait for commit, then run TRANSACTION 2:
-- (Run this as a separate psql command or in a new transaction)

BEGIN;

-- Add STUDENT type for all students
INSERT INTO user_participant_types (user_id, participant_type, is_active)
SELECT DISTINCT u.id, 'STUDENT', TRUE
FROM users u
WHERE u.role IN ('voter', 'participant')
ON CONFLICT (user_id, participant_type) DO NOTHING;

-- Verify
SELECT 
  'Students with STUDENT type' as metric,
  COUNT(DISTINCT user_id) as count
FROM user_participant_types
WHERE participant_type = 'STUDENT';

COMMIT;
```

---

## Rollback Plan

```sql
-- Rollback: Remove STUDENT type and restore old types

BEGIN;

-- Re-add ELECTION_VOTER for students
INSERT INTO user_participant_types (user_id, participant_type, is_active)
SELECT user_id, 'ELECTION_VOTER', is_active
FROM user_participant_types
WHERE participant_type = 'STUDENT'
ON CONFLICT DO NOTHING;

-- Re-add POLLING_RESPONDENT for students
INSERT INTO user_participant_types (user_id, participant_type, is_active)
SELECT user_id, 'POLLING_RESPONDENT', is_active
FROM user_participant_types
WHERE participant_type = 'STUDENT'
ON CONFLICT DO NOTHING;

-- Remove STUDENT type
DELETE FROM user_participant_types WHERE participant_type = 'STUDENT';

-- Note: Cannot remove enum value, but it won't be used

COMMIT;
```

---

## Summary

| Approach | user_participant_types rows per student | Pros | Cons |
|----------|----------------------------------------|------|------|
| **Original Plan** (give students 2 types) | 2 rows (ELECTION_VOTER + POLLING_RESPONDENT) | No enum change needed, works immediately | Messy, counterintuitive |
| **NEW Plan** (add STUDENT type) | 1 row (STUDENT) | Clean, intuitive, matches frontend | Requires enum change, more code changes |

**Recommendation:** Use the NEW approach with STUDENT type - it's cleaner and more maintainable long-term.

---

## Which Should You Choose?

### Use Original Plan (2 types) if:
- You want a quick fix with minimal code changes
- You don't want to modify enums
- You need it working TODAY

### Use NEW Plan (STUDENT type) if:
- You want a clean, maintainable solution
- You can afford 1-2 days for proper testing
- You want the database to match your conceptual model

**My recommendation:** Go with the **NEW STUDENT type approach** - it's the right architectural decision.
