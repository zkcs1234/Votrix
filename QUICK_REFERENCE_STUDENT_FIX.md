# Student Participant Type Fix - Quick Reference Card

## 🔴 Quick Fix (2 Steps)

```bash
# Step 1: Add STUDENT enum value (MUST commit before step 2!)
psql -U your_user -d your_db -f backend/src/database/migrations/135_add_student_participant_type.sql

# Step 2: Migrate all students to STUDENT type
psql -U your_user -d your_db -f backend/src/database/migrations/136_migrate_to_student_type.sql

# Done! ✅
```

---

## 📋 The Problem (30 Second Version)

| Before Fix | After Fix |
|------------|-----------|
| Student has `ELECTION_VOTER` → can vote, cannot respond ❌ | Student has `STUDENT` → can vote AND respond ✅ |
| Student has `POLLING_RESPONDENT` → can respond, cannot vote ❌ | Single unified type, clean database ✅ |
| 2 rows per student OR missing access | 1 row per student, full access ✅ |

---

## 🗂️ File Quick Reference

| Need to... | Use this file... |
|------------|------------------|
| Add STUDENT enum | `backend/src/database/migrations/135_add_student_participant_type.sql` |
| Migrate student data | `backend/src/database/migrations/136_migrate_to_student_type.sql` |
| Understand solution | `docs/plans/student-unified-participant-type-NEW-APPROACH.md` |
| Follow step-by-step | `STUDENT_PARTICIPANT_TYPE_FIX_README.md` |
| Quick overview | `STUDENT_PARTICIPANT_FIX_SUMMARY.md` |

---

## 🔍 Diagnostic SQL (Copy/Paste Ready)

### Check if students have STUDENT type
```sql
-- Should return count of all students
SELECT COUNT(*) as students_with_student_type
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE u.role IN ('voter', 'participant')
  AND upt.participant_type = 'STUDENT';
```

### Check for old types still in use
```sql
-- Should return 0 after migration
SELECT COUNT(*) as old_types_remaining
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE u.role IN ('voter', 'participant')
  AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT');
```

### Check specific student
```sql
-- Replace email below
SELECT upt.participant_type
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE u.email = 'student@example.com';
-- Should return 1 row: STUDENT
```

---

## 🔧 Backend Code Change

### Update admin.service.js

```javascript
// BEFORE (in createVoterAccount or createRespondentAccount):
VALUES ($1, 'ELECTION_VOTER', true)
// or
VALUES ($1, 'POLLING_RESPONDENT', true)

// AFTER:
VALUES ($1, 'STUDENT', true)
```

**Functions to update:**
- `createVoterAccount`
- `createRespondentAccount`
- `registerVoterImport`
- `registerRespondentImport`

---

## ✅ Verification Checklist

```
After running migrations:

Database:
□ All students have STUDENT type (no ELECTION_VOTER/POLLING_RESPONDENT)
□ No constraint violations in logs
□ Judges unaffected (still have only COMPETITION_JUDGE)

Frontend:
□ Students can see both election and polling events
□ Students can vote in elections
□ Students can respond to polls
□ No access error messages

Admin:
□ New students can be added successfully
□ CSV import works correctly
□ Students get STUDENT type automatically
```

---

## 🆘 Troubleshooting (1 Minute)

| Symptom | Fix |
|---------|-----|
| Student still can't access both | Check they have STUDENT type in user_participant_types |
| New student gets old type | Update backend services (admin.service.js) |
| Migration 136 fails | Ensure migration 135 was committed first |
| "Enum value not found" error | Run step 1, commit, then run step 2 in new transaction |

---

## 📊 Expected Database State

### Before Migration:
```sql
user_id    | participant_type    
-----------|--------------------
student-1  | ELECTION_VOTER       ← or POLLING_RESPONDENT
```

### After Migration:
```sql
user_id    | participant_type    
-----------|--------------------
student-1  | STUDENT              ← Clean!
```

---

## 🔄 Event Enrollment

Both election and polling events use the same STUDENT type:

```sql
-- Election enrollment
INSERT INTO event_participants (event_id, user_id, participant_type)
VALUES ('election-123', 'student-1', 'STUDENT');

-- Polling enrollment
INSERT INTO event_participants (event_id, user_id, participant_type)
VALUES ('poll-456', 'student-1', 'STUDENT');
```

The validation trigger allows STUDENT in both event types!

---

## 📞 Verification Commands

### Get system state
```bash
psql -d your_db -c "SELECT COUNT(DISTINCT user_id) FROM user_participant_types WHERE participant_type = 'STUDENT';"
```

### Count issues
```sql
SELECT 
  'Total students' as metric, 
  COUNT(DISTINCT id) as count 
FROM users WHERE role IN ('voter', 'participant')
UNION ALL
SELECT 
  'Students with STUDENT type', 
  COUNT(DISTINCT user_id)
FROM user_participant_types
WHERE participant_type = 'STUDENT'
UNION ALL
SELECT 
  'Old types remaining', 
  COUNT(*)
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE u.role IN ('voter', 'participant')
  AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT');
```

---

## 🎯 Implementation Order

```
1. ADD ENUM      → 135_add_student_participant_type.sql
2. COMMIT! ⚠️    → PostgreSQL requires this
3. MIGRATE DATA  → 136_migrate_to_student_type.sql  
4. UPDATE BACKEND→ admin.service.js
5. TEST          → Create student, vote, respond
6. DONE          ✅
```

---

## 💡 Key Concepts (10 Second Refresh)

**participant_type enum:** `STUDENT | ELECTION_VOTER | COMPETITION_JUDGE | POLLING_RESPONDENT`

**STUDENT type (NEW!):**
- ✅ Can vote in elections
- ✅ Can respond to polls
- ✅ Single row per student in user_participant_types
- ✅ Replaces the need for ELECTION_VOTER + POLLING_RESPONDENT

**Migration 135:** Adds STUDENT to enum
**Migration 136:** Converts all students to use STUDENT type

---

## 🔗 Related Tables

```
users (account)
  └─→ user_participant_types (eligibility)
        └─→ STUDENT type (NEW! - can access both modules)
              ├─→ event_participants (election enrollment)
              └─→ event_participants (polling enrollment)
```

---

## ⚡ One-Liner Commands

### Check migration status
```bash
psql -d db -c "SELECT 'Students:', COUNT(*) FROM user_participant_types WHERE participant_type='STUDENT';"
```

### Run both migrations
```bash
psql -d db -f backend/src/database/migrations/135_add_student_participant_type.sql && psql -d db -f backend/src/database/migrations/136_migrate_to_student_type.sql
```

---

**Print this page and keep it at your desk! 📄**

**For full details, see:** `STUDENT_PARTICIPANT_TYPE_FIX_README.md`
