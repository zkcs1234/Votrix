# Fix Migration 136 Error

## What Happened

You got this error:
```
ERROR: 23514: new row for relation "user_participant_types" violates check constraint "user_participant_types_participant_type_check"
```

**Cause:** The `user_participant_types` table has a CHECK constraint that only allows `ELECTION_VOTER`, `COMPETITION_JUDGE`, and `POLLING_RESPONDENT`. It doesn't know about `STUDENT` yet!

**Solution:** I've updated migration 136 to first update the CHECK constraint, THEN insert the STUDENT types.

---

## Steps to Fix

### Step 1: Rollback the Partial Migration

Run this to clean up any partial changes:

```bash
psql -U postgres -d votrix -f backend/src/database/migrations/136_rollback_partial.sql
```

**What it does:**
- Removes any STUDENT entries that might have been partially added
- Restores the CHECK constraint to its original state

---

### Step 2: Run the Fixed Migration 136

Now run the corrected migration:

```bash
psql -U postgres -d votrix -f backend/src/database/migrations/136_migrate_to_student_type.sql
```

**What's different now:**
1. ✅ **First** updates the CHECK constraint to allow 'STUDENT'
2. ✅ **Then** inserts the STUDENT types
3. ✅ Removes old types
4. ✅ Updates triggers

**Expected output:**
```
========================================
Migration 136: STUDENT Type Migration
========================================
Total students (role=voter/participant): XX
Students with STUDENT type: XX
Old student types remaining: 0
Judges (unchanged): XX

✓✓✓ SUCCESS: All students migrated to STUDENT type
========================================
```

---

### Step 3: Verify It Worked

```sql
-- Should show all students with STUDENT type
SELECT 
  u.email,
  upt.participant_type
FROM users u
JOIN user_participant_types upt ON upt.user_id = u.id
WHERE u.role IN ('voter', 'participant')
ORDER BY u.email
LIMIT 10;
```

**Expected:** All show `participant_type = 'STUDENT'`

```sql
-- Should return 0
SELECT COUNT(*)
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE u.role IN ('voter', 'participant')
  AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT');
```

**Expected:** `0`

---

### Step 4: Continue with Backend Restart

After successful migration:

```bash
# Restart your backend server
npm run dev
```

Then test as described in `NEXT_STEPS_FOR_YOU.md`

---

## What Was Fixed

### Original migration 136 (broken):
```sql
BEGIN;
-- 1. Insert STUDENT types immediately ❌ FAILS! Constraint doesn't allow it
INSERT INTO user_participant_types (participant_type)
VALUES ('STUDENT');  -- ERROR: violates check constraint
```

### Fixed migration 136:
```sql
BEGIN;
-- 1. Update CHECK constraint FIRST ✅
ALTER TABLE user_participant_types
DROP CONSTRAINT user_participant_types_participant_type_check;

ALTER TABLE user_participant_types
ADD CONSTRAINT user_participant_types_participant_type_check
CHECK (participant_type IN (
  'ELECTION_VOTER',
  'COMPETITION_JUDGE',
  'POLLING_RESPONDENT',
  'STUDENT'  -- Now allowed!
));

-- 2. NOW insert STUDENT types ✅ Works!
INSERT INTO user_participant_types (participant_type)
VALUES ('STUDENT');  -- SUCCESS
```

---

## Technical Explanation

The `user_participant_types` table was created in migration 084 with a CHECK constraint:

```sql
CREATE TABLE user_participant_types (
  participant_type VARCHAR(32) NOT NULL CHECK (
    participant_type IN (
      'ELECTION_VOTER',
      'COMPETITION_JUDGE',
      'POLLING_RESPONDENT'
    )
  ),
  -- ... other columns
);
```

This CHECK constraint validates every INSERT/UPDATE. Even though we added 'STUDENT' to the `participant_type` ENUM in migration 135, the CHECK constraint on the TABLE still only allows the original 3 values.

**The fix:** Update the CHECK constraint to include 'STUDENT' before trying to insert it.

---

## Summary

1. Run: `136_rollback_partial.sql` (clean up)
2. Run: `136_migrate_to_student_type.sql` (fixed version)
3. Verify: All students have STUDENT type
4. Restart backend server
5. Test: Students can vote AND respond

---

**Questions?** Check `IMPLEMENTATION_STATUS.md` for troubleshooting.
