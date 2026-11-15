# Student Participant Type Implementation Status

## ✅ Completed

### Backend Code Changes
- [x] **Updated `backend/src/utils/constants.js`**
  - Added `STUDENT: 'STUDENT'` to `PARTICIPANT_TYPES`
  - Added label for STUDENT type in `PARTICIPANT_TYPE_LABELS`
  - Kept legacy types for backward compatibility

- [x] **Updated `backend/src/services/participant.service.js`**
  - Modified `resolveParticipantType()` to return `STUDENT` for elections and polling
  - Modified `enrichEventWithParticipantType()` to use `STUDENT` for elections and polling
  - Judges remain as `COMPETITION_JUDGE` (unchanged)

## 🔄 Next Steps (You Need To Do)

### Step 1: Run Database Migrations

#### 1a. Add STUDENT Enum Value
```bash
psql -U your_username -d votrix -f backend/src/database/migrations/135_add_student_participant_type.sql
```

**Expected output:**
```
✓ STUDENT participant type added successfully
```

⚠️ **CRITICAL:** You MUST commit this transaction before running step 1b!

---

#### 1b. Migrate Student Data
```bash
# After committing step 1a, run:
psql -U your_username -d votrix -f backend/src/database/migrations/136_migrate_to_student_type.sql
```

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

### Step 2: Verify Database Changes

Run this query to confirm all students have STUDENT type:

```sql
-- Should show all students with STUDENT type
SELECT 
  u.email,
  upt.participant_type
FROM users u
JOIN user_participant_types upt ON upt.user_id = u.id
WHERE u.role IN ('voter', 'participant')
ORDER BY u.email;
```

**Expected:** Every row shows `participant_type = 'STUDENT'`

And verify no old types remain:

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

### Step 3: Restart Backend Server

The code changes I made will take effect when you restart:

```bash
# Stop your backend server
# Then start it again
npm run dev
# or
node backend/src/server.js
```

---

### Step 4: Test Everything

#### Test Existing Students
1. Log in as a student account
2. Check their dashboard:
   - [ ] Can see election events
   - [ ] Can see polling events
3. Try participating:
   - [ ] Can vote in an election
   - [ ] Can respond to a poll

#### Test New Student Creation (via Admin UI)
1. Go to Admin → User Management → Participants → Students
2. Click "Add Student"
3. Create a new test student
4. Verify in database:

```sql
SELECT upt.participant_type
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE u.email = 'your-test-student@example.com';
```

**Expected:** `STUDENT`

#### Test CSV Import
1. Import students via CSV in admin UI
2. Check they all have STUDENT type:

```sql
SELECT u.email, upt.participant_type
FROM users u
JOIN user_participant_types upt ON upt.user_id = u.id
WHERE u.email IN ('csv-student-1@example.com', 'csv-student-2@example.com');
```

**Expected:** All show `participant_type = 'STUDENT'`

---

## 📊 What Changed

### Before (Broken):
```
Database (user_participant_types):
user_id    | participant_type    
-----------|--------------------
student-1  | ELECTION_VOTER       ← Can only vote
```

```javascript
// Backend code:
resolveParticipantType('election') → 'ELECTION_VOTER'
resolveParticipantType('polling') → 'POLLING_RESPONDENT'
```

### After (Fixed):
```
Database (user_participant_types):
user_id    | participant_type    
-----------|--------------------
student-1  | STUDENT              ← Can vote AND respond!
```

```javascript
// Backend code:
resolveParticipantType('election') → 'STUDENT'
resolveParticipantType('polling') → 'STUDENT'
resolveParticipantType('competition_scoring') → 'COMPETITION_JUDGE' (unchanged)
```

---

## 🎯 Expected Behavior

### When Student Enrolls in Election Event:
```sql
INSERT INTO event_participants (event_id, user_id, participant_type)
VALUES ('election-123', 'student-1', 'STUDENT');
```

The `resolveParticipantType()` function now returns `'STUDENT'` for election events.

### When Student Enrolls in Polling Event:
```sql
INSERT INTO event_participants (event_id, user_id, participant_type)
VALUES ('poll-456', 'student-1', 'STUDENT');
```

The `resolveParticipantType()` function now returns `'STUDENT'` for polling events.

### Validation (from migration 136):
The trigger `fn_validate_participant_event_type` allows `STUDENT` type in BOTH election and polling events.

---

## 🔍 How to Check if Everything is Working

### 1. Check Constants
```bash
# Should show STUDENT type
grep -A 5 "PARTICIPANT_TYPES" backend/src/utils/constants.js
```

### 2. Check Service Functions
```bash
# Should return STUDENT for elections
grep -A 3 "resolveParticipantType" backend/src/services/participant.service.js
```

### 3. Check Database
```sql
-- All students should have STUDENT type
SELECT COUNT(*) as students_with_student_type
FROM user_participant_types
WHERE participant_type = 'STUDENT';

-- No students should have old types
SELECT COUNT(*) as old_types
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE u.role IN ('voter', 'participant')
  AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT');
-- Should return 0
```

### 4. Check Event Enrollment
```sql
-- After a student joins events, check their participant_type
SELECT 
  e.title,
  e.event_type,
  ep.participant_type
FROM event_participants ep
JOIN events e ON e.id = ep.event_id
JOIN users u ON u.id = ep.user_id
WHERE u.email = 'test-student@example.com';
-- Should show participant_type = 'STUDENT' for both election and polling events
```

---

## ✅ Success Criteria

- [ ] Database migrations 135 and 136 completed successfully
- [ ] All students have `STUDENT` type in `user_participant_types`
- [ ] No students have `ELECTION_VOTER` or `POLLING_RESPONDENT` types
- [ ] Backend server restarted
- [ ] Existing students can vote AND respond to polls
- [ ] New students automatically get `STUDENT` type
- [ ] CSV import creates students with `STUDENT` type
- [ ] Judges still have `COMPETITION_JUDGE` type (unchanged)
- [ ] No database constraint errors
- [ ] No application errors in logs

---

## 🆘 Troubleshooting

### Problem: Migration 136 fails with "enum value not found"
**Cause:** Migration 135 wasn't committed before running 136  
**Solution:** Commit migration 135, start a new transaction, then run 136

### Problem: Students still can't access both modules
**Check:** Do they have STUDENT type?
```sql
SELECT upt.participant_type 
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE u.email = 'problem-student@example.com';
```
**Solution:** Should return `STUDENT`. If not, re-run migration 136.

### Problem: New students get old types
**Cause:** Backend code didn't reload  
**Solution:** Restart the backend server

### Problem: Event enrollment fails
**Check backend logs for errors**  
**Common issue:** Validation trigger not updated
**Solution:** Re-run migration 136

---

## 📝 Notes

- **Legacy types preserved:** `ELECTION_VOTER` and `POLLING_RESPONDENT` remain in the enum for backward compatibility, but new code uses `STUDENT`
- **Judges unchanged:** Competition judges still use `COMPETITION_JUDGE` type
- **event_participants table:** Uses `STUDENT` for both election and polling events now
- **Auto-assignment trigger:** Created by migration 136, automatically assigns STUDENT type when students enroll

---

**Last Updated:** After backend code implementation  
**Status:** ✅ Backend code complete, awaiting database migrations
