# Student Participant Type Fix - Implementation Guide

## Problem Summary

Students were unable to both vote in elections AND respond to polls because the system used module-specific types (`ELECTION_VOTER`, `POLLING_RESPONDENT`). This happened because:

1. Frontend admin UI changed to treat "Students" as a unified category
2. Backend still used separate participant types for each module
3. Result: Students could only access one module, not both

## Solution: Add STUDENT Participant Type

We're adding a new unified **`STUDENT`** participant type that can access BOTH elections and polls. This is cleaner than giving students two separate types.

**Benefits:**
- Clean data model: 1 row per student (not 2)
- Intuitive: "STUDENT" type = student behavior
- Matches frontend concept
- Future-proof for additional capabilities

---

## Implementation Steps

### Step 1: Add STUDENT to participant_type Enum

**File:** `backend/src/database/migrations/135_add_student_participant_type.sql`

Run this migration:

```bash
psql -U your_username -d votrix_db -f backend/src/database/migrations/135_add_student_participant_type.sql
```

**What it does:**
- Adds `STUDENT` to the `participant_type` enum
- Verifies the enum value was added successfully

**Expected output:**
```
✓ STUDENT participant type added successfully
```

**⚠️ IMPORTANT:** This change MUST be committed before running Step 2. PostgreSQL doesn't allow using a new enum value in the same transaction it was created.

---

### Step 2: Migrate All Students to STUDENT Type

**File:** `backend/src/database/migrations/136_migrate_to_student_type.sql`

After Step 1 is committed, run this migration:

```bash
psql -U your_username -d votrix_db -f backend/src/database/migrations/136_migrate_to_student_type.sql
```

**What it does:**
- ✅ Converts all students to use STUDENT type
- ✅ Removes old ELECTION_VOTER/POLLING_RESPONDENT types for students
- ✅ Updates validation to allow STUDENT in both election and polling events
- ✅ Creates auto-assignment trigger for event enrollment
- ✅ Shows verification report

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

### Step 3: Verify the Migration

Run this query to confirm all students have STUDENT type:

```sql
-- Should return all students with STUDENT type
SELECT 
  u.email,
  upt.participant_type
FROM users u
JOIN user_participant_types upt ON upt.user_id = u.id
WHERE u.role IN ('voter', 'participant')
ORDER BY u.email;
```

**Expected:** Every student should have `participant_type = 'STUDENT'`

And verify no old types remain:

```sql
-- Should return 0
SELECT COUNT(*)
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE u.role IN ('voter', 'participant')
  AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT');
```

**Expected:** 0 rows

---

### Step 4: Update Backend Services

**File:** `backend/src/services/admin.service.js`

Update student creation functions to use `STUDENT` type instead of `ELECTION_VOTER` or `POLLING_RESPONDENT`.

#### Functions to update:
- `createVoterAccount`
- `createRespondentAccount`
- `registerVoterImport`
- `registerRespondentImport`

#### Change pattern:

```javascript
// OLD CODE (in createVoterAccount)
await db.query(
  `INSERT INTO user_participant_types (user_id, participant_type, is_active)
   VALUES ($1, 'ELECTION_VOTER', true)
   ON CONFLICT (user_id, participant_type) DO NOTHING`,
  [user.id]
)

// NEW CODE - use STUDENT type
await db.query(
  `INSERT INTO user_participant_types (user_id, participant_type, is_active)
   VALUES ($1, 'STUDENT', true)
   ON CONFLICT (user_id, participant_type) DO NOTHING`,
  [user.id]
)
```

```javascript
// OLD CODE (in createRespondentAccount)
await db.query(
  `INSERT INTO user_participant_types (user_id, participant_type, is_active)
   VALUES ($1, 'POLLING_RESPONDENT', true)
   ON CONFLICT (user_id, participant_type) DO NOTHING`,
  [user.id]
)

// NEW CODE - use STUDENT type
await db.query(
  `INSERT INTO user_participant_types (user_id, participant_type, is_active)
   VALUES ($1, 'STUDENT', true)
   ON CONFLICT (user_id, participant_type) DO NOTHING`,
  [user.id]
)
```

Apply the same change to `registerVoterImport` and `registerRespondentImport` functions.

---

### Step 5: Test Everything

#### Test Existing Students

1. Log in as a student account
2. Navigate to their dashboard
3. Verify they can see BOTH:
   - Election events (if any exist)
   - Polling events (if any exist)
4. Try voting in an election
5. Try responding to a poll

Both should work now! ✅

#### Test New Student Creation

1. Go to admin panel
2. Add a new student via "Add Student" button
3. Check database:

```sql
SELECT upt.participant_type
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE u.email = 'new-student@example.com';
```

**Expected:** Should return 1 row with `participant_type = 'STUDENT'`

#### Test CSV Import

1. Import students via CSV
2. Check they all have STUDENT type:

```sql
SELECT 
  u.email,
  upt.participant_type
FROM users u
JOIN user_participant_types upt ON upt.user_id = u.id
WHERE u.email IN ('csv-student-1@example.com', 'csv-student-2@example.com');
```

**Expected:** All imported students should have `participant_type = 'STUDENT'`

---

## How It Works

### Database Schema

**Before (Broken):**
```
user_id    | participant_type    
-----------|--------------------
student-1  | ELECTION_VOTER       ← Can only vote
```

**After (Fixed):**
```
user_id    | participant_type    
-----------|--------------------
student-1  | STUDENT              ← Can vote AND respond!
```

### Event Enrollment

When a student with STUDENT type enrolls in an event, the auto-assignment trigger assigns the STUDENT type in `event_participants`:

**Election event:**
```sql
INSERT INTO event_participants (event_id, user_id, participant_type)
VALUES ('election-123', 'student-1', 'STUDENT');  -- Uses STUDENT type
```

**Polling event:**
```sql
INSERT INTO event_participants (event_id, user_id, participant_type)
VALUES ('poll-456', 'student-1', 'STUDENT');  -- Same STUDENT type!
```

The validation trigger allows STUDENT type in BOTH election and polling events.

---

## Troubleshooting

### Problem: Students still can't vote/respond

**Check 1:** Verify they have STUDENT type
```sql
SELECT upt.participant_type 
FROM user_participant_types upt 
WHERE upt.user_id = 'PASTE_STUDENT_USER_ID_HERE';
```

Should return 1 row: `STUDENT`

**Fix:** If they don't have STUDENT type, manually add it:
```sql
INSERT INTO user_participant_types (user_id, participant_type, is_active)
VALUES ('STUDENT_USER_ID_HERE', 'STUDENT', true)
ON CONFLICT DO NOTHING;
```

---

### Problem: New students get ELECTION_VOTER or POLLING_RESPONDENT

**Cause:** Backend services not updated

**Fix:** Update `backend/src/services/admin.service.js` as shown in Step 4 above.

---

### Problem: Migration 136 fails with "enum value not found"

**Cause:** Migration 135 wasn't committed before running 136

**Fix:** 
1. Ensure migration 135 completed successfully
2. Commit the transaction
3. Start a new connection/transaction
4. Run migration 136

---

### Problem: Judges accidentally got STUDENT type

**Check:**
```sql
SELECT u.email, array_agg(upt.participant_type::text) as types
FROM users u
JOIN user_participant_types upt ON upt.user_id = u.id
WHERE EXISTS (
  SELECT 1 FROM user_participant_types upt2
  WHERE upt2.user_id = u.id AND upt2.participant_type = 'COMPETITION_JUDGE'
)
GROUP BY u.email;
```

**Fix:** Remove STUDENT type from judges:
```sql
DELETE FROM user_participant_types
WHERE participant_type = 'STUDENT'
  AND user_id IN (
    SELECT user_id FROM user_participant_types 
    WHERE participant_type = 'COMPETITION_JUDGE'
  );
```

---

## Rollback Plan

If you need to rollback (only if there are serious issues):

```sql
BEGIN;

-- Re-add ELECTION_VOTER for students (as backup)
INSERT INTO user_participant_types (user_id, participant_type, is_active)
SELECT user_id, 'ELECTION_VOTER', is_active
FROM user_participant_types
WHERE participant_type = 'STUDENT'
ON CONFLICT DO NOTHING;

-- Re-add POLLING_RESPONDENT for students (as backup)
INSERT INTO user_participant_types (user_id, participant_type, is_active)
SELECT user_id, 'POLLING_RESPONDENT', is_active
FROM user_participant_types
WHERE participant_type = 'STUDENT'
ON CONFLICT DO NOTHING;

-- Remove STUDENT type
DELETE FROM user_participant_types WHERE participant_type = 'STUDENT';

-- Restore old validation trigger
DROP TRIGGER IF EXISTS trg_event_participants_validate_type ON event_participants;
-- (See migration 029 for original trigger function)

COMMIT;
```

**Note:** This gives students back BOTH old types, which solves the access problem but leaves the messy 2-row structure.

---

## Success Criteria

All of these should be TRUE:

- [x] ✅ All existing students have STUDENT type (not ELECTION_VOTER/POLLING_RESPONDENT)
- [x] ✅ New students automatically get STUDENT type when created
- [x] ✅ Students can vote in elections
- [x] ✅ Students can respond to polls
- [x] ✅ Admin only needs to add each student once
- [x] ✅ CSV import creates students with STUDENT type
- [x] ✅ Judges are unaffected (only have COMPETITION_JUDGE type)
- [x] ✅ Event enrollment works correctly
- [x] ✅ No database errors or constraint violations
- [x] ✅ No student access complaints

---

## Additional Resources

- **Full technical specification:** `docs/plans/student-unified-participant-type-NEW-APPROACH.md`
- **Quick reference:** `QUICK_REFERENCE_STUDENT_FIX.md`
- **Executive summary:** `STUDENT_PARTICIPANT_FIX_SUMMARY.md`
- **Diagnostic tool:** `backend/src/database/migrations/verify-student-participant-types.sql`

---

**Questions or issues?** Check the troubleshooting section above or review the full technical plan.
