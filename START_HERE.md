# Student Participant Type Fix - START HERE

## The Problem (1 Minute Read)

Students can only vote in elections **OR** respond to polls, but not **BOTH**.

**Why?** The system uses module-specific participant types (`ELECTION_VOTER`, `POLLING_RESPONDENT`), but students need access to BOTH modules.

---

## The Solution: STUDENT Participant Type

Add a **NEW unified `STUDENT` type** that can access BOTH elections and polls.

### Why STUDENT type is better:
- ✅ **Clean database:** 1 row per student (not 2)
- ✅ **Intuitive:** "STUDENT" clearly represents student behavior
- ✅ **Matches frontend:** Admin UI shows "Students" as one category
- ✅ **Future-proof:** Easy to extend student capabilities
- ✅ **Maintainable:** Simple to understand for future developers

---

## Quick Implementation (3 Steps)

### Step 1: Add STUDENT Enum (5 min)
```bash
psql -U your_user -d your_db -f backend/src/database/migrations/135_add_student_participant_type.sql
```

✅ Adds `STUDENT` to the participant_type enum

⚠️ **MUST commit before step 2!**

---

### Step 2: Migrate Student Data (15 min)
```bash
# After committing step 1:
psql -U your_user -d your_db -f backend/src/database/migrations/136_migrate_to_student_type.sql
```

✅ Converts all students to STUDENT type  
✅ Removes old ELECTION_VOTER/POLLING_RESPONDENT for students  
✅ Adds validation triggers  

---

### Step 3: Update Backend (1-2 hours)

**File:** `backend/src/services/admin.service.js`

**Change this everywhere:**
```javascript
// OLD (in createVoterAccount, createRespondentAccount, etc.):
VALUES ($1, 'ELECTION_VOTER', true)
// or
VALUES ($1, 'POLLING_RESPONDENT', true)

// NEW:
VALUES ($1, 'STUDENT', true)
```

**Functions to update:**
- `createVoterAccount`
- `createRespondentAccount`
- `registerVoterImport`
- `registerRespondentImport`

---

## Verification (2 minutes)

### Check all students have STUDENT type:
```sql
SELECT 
  u.email,
  upt.participant_type
FROM users u
JOIN user_participant_types upt ON upt.user_id = u.id
WHERE u.role IN ('voter', 'participant');
```

**Expected:** All show `participant_type = 'STUDENT'`

### Check no old types remain:
```sql
SELECT COUNT(*)
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE u.role IN ('voter', 'participant')
  AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT');
```

**Expected:** 0

---

## Testing (15 minutes)

1. **Existing students:**
   - [ ] Log in as a student
   - [ ] Can see both election and polling events
   - [ ] Can vote in an election
   - [ ] Can respond to a poll

2. **New students:**
   - [ ] Create a new student via admin UI
   - [ ] Check they have STUDENT type
   - [ ] Test voting and responding

3. **CSV import:**
   - [ ] Import students via CSV
   - [ ] Check all have STUDENT type

---

## Documentation

| Document | Purpose |
|----------|---------|
| [`STUDENT_PARTICIPANT_FIX_SUMMARY.md`](STUDENT_PARTICIPANT_FIX_SUMMARY.md) | Executive summary (2 min) |
| [`STUDENT_PARTICIPANT_TYPE_FIX_README.md`](STUDENT_PARTICIPANT_TYPE_FIX_README.md) | Complete implementation guide (10 min) |
| [`QUICK_REFERENCE_STUDENT_FIX.md`](QUICK_REFERENCE_STUDENT_FIX.md) | Quick reference card (keep at desk) |
| [`docs/plans/student-unified-participant-type-NEW-APPROACH.md`](docs/plans/student-unified-participant-type-NEW-APPROACH.md) | Full technical specification (15 min) |
| [`STUDENT_PARTICIPANT_TYPE_FIX_INDEX.md`](STUDENT_PARTICIPANT_TYPE_FIX_INDEX.md) | Master index of all documents |

---

## Before vs After

### Database (user_participant_types table):

**BEFORE (Broken):**
```
user_id    | participant_type    
-----------|--------------------
student-1  | ELECTION_VOTER       ← Only one type, missing access
```

**AFTER (Fixed):**
```
user_id    | participant_type    
-----------|--------------------
student-1  | STUDENT              ← Unified type, full access!
```

### Student Capabilities:

**BEFORE:**
- Has ELECTION_VOTER → can vote ✅, cannot respond ❌
- Has POLLING_RESPONDENT → can respond ✅, cannot vote ❌

**AFTER:**
- Has STUDENT → can vote ✅, can respond ✅

---

## Timeline

- **Step 1-2 (Migrations):** 30 minutes
- **Step 3 (Backend update):** 1-2 hours
- **Testing:** 30 minutes
- **Total:** 2-3 hours

---

## Success Criteria

✅ All students have STUDENT type  
✅ Students can vote AND respond  
✅ New students auto-get STUDENT type  
✅ CSV import works  
✅ Judges unaffected  
✅ No database errors  

---

## Need Help?

- **Quick reference:** [`QUICK_REFERENCE_STUDENT_FIX.md`](QUICK_REFERENCE_STUDENT_FIX.md)
- **Step-by-step guide:** [`STUDENT_PARTICIPANT_TYPE_FIX_README.md`](STUDENT_PARTICIPANT_TYPE_FIX_README.md)
- **Troubleshooting:** See README troubleshooting section
- **All docs:** [`STUDENT_PARTICIPANT_TYPE_FIX_INDEX.md`](STUDENT_PARTICIPANT_TYPE_FIX_INDEX.md)

---

## What's Changed from Original Plan?

**Original plan:** Give students BOTH `ELECTION_VOTER` + `POLLING_RESPONDENT` types (2 rows)  
**NEW plan (better!):** Give students ONE `STUDENT` type (1 row)  

**Why the change?**
- Cleaner database structure
- Matches frontend conceptual model
- Easier to maintain
- More intuitive for developers

---

**Ready to start? Begin with Step 1 above! 🚀**
