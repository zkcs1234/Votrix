# 🎯 What You Need To Do Now

## ✅ I've Already Done (Backend Code)

I've updated the following backend files:

1. **`backend/src/utils/constants.js`**
   - Added `STUDENT` participant type
   - Added label for frontend display

2. **`backend/src/services/participant.service.js`**
   - Modified to use `STUDENT` type for elections and polling
   - Judges remain as `COMPETITION_JUDGE`

**These changes are saved** but won't take effect until you restart the backend server (after running migrations).

---

## 🔴 YOU MUST DO (Database Migrations)

### Step 1: Run Migration 135 (Add STUDENT enum)

```bash
psql -U postgres -d votrix -f backend/src/database/migrations/135_add_student_participant_type.sql
```

**Expected output:**
```
✓ STUDENT participant type added successfully
```

⚠️ **CRITICAL: Commit this transaction before continuing!**

---

### Step 2: Run Migration 136 (Migrate data)

**After committing step 1:**

```bash
psql -U postgres -d votrix -f backend/src/database/migrations/136_migrate_to_student_type.sql
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

### Step 3: Verify Database

```sql
-- Check all students have STUDENT type
SELECT 
  u.email,
  upt.participant_type
FROM users u
JOIN user_participant_types upt ON upt.user_id = u.id
WHERE u.role IN ('voter', 'participant')
ORDER BY u.email;
```

**Expected:** All show `participant_type = 'STUDENT'`

```sql
-- Check no old types remain
SELECT COUNT(*)
FROM user_participant_types upt
JOIN users u ON u.id = upt.user_id
WHERE u.role IN ('voter', 'participant')
  AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT');
```

**Expected:** `0`

---

### Step 4: Restart Backend Server

The code changes take effect after restart:

```bash
# Stop your backend server (Ctrl+C)
# Then start again:
npm run dev
```

---

### Step 5: Test

#### Quick Test:
1. Log in as a student
2. Check dashboard - should see BOTH election and polling events
3. Try voting in an election ✅
4. Try responding to a poll ✅

#### Full Test Checklist:
- [ ] Existing students can vote AND respond
- [ ] Create new student via admin UI
- [ ] New student has STUDENT type in database
- [ ] Import students via CSV
- [ ] Imported students have STUDENT type
- [ ] Judges unaffected (still COMPETITION_JUDGE)

---

## 📄 Files I Created For You

### Documentation:
- `START_HERE.md` - Quick start guide
- `STUDENT_PARTICIPANT_FIX_SUMMARY.md` - Executive summary
- `STUDENT_PARTICIPANT_TYPE_FIX_README.md` - Complete implementation guide
- `QUICK_REFERENCE_STUDENT_FIX.md` - Quick reference card
- `IMPLEMENTATION_STATUS.md` - What's done and what's left
- `THIS FILE` - Your next steps

### Database Migrations:
- `backend/src/database/migrations/135_add_student_participant_type.sql` - Add enum
- `backend/src/database/migrations/136_migrate_to_student_type.sql` - Migrate data
- `backend/src/database/migrations/verify-student-participant-types.sql` - Diagnostic tool

### Technical Documentation:
- `docs/plans/student-unified-participant-type-NEW-APPROACH.md` - Full technical spec

---

## 🎬 Quick Command Sequence

Copy and paste this entire sequence (adjust database connection as needed):

```bash
# 1. Add STUDENT enum
psql -U postgres -d votrix -f backend/src/database/migrations/135_add_student_participant_type.sql

# 2. Wait for commit, then migrate data
psql -U postgres -d votrix -f backend/src/database/migrations/136_migrate_to_student_type.sql

# 3. Verify (should return 0)
psql -U postgres -d votrix -c "SELECT COUNT(*) FROM user_participant_types upt JOIN users u ON u.id = upt.user_id WHERE u.role IN ('voter', 'participant') AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT');"

# 4. Restart backend
# (Stop with Ctrl+C, then:)
cd backend
npm run dev
```

---

## ❓ Questions?

- **"Why do I need to commit between step 1 and 2?"**  
  PostgreSQL doesn't allow using a new enum value in the same transaction it was created. Step 1 must be committed first.

- **"What if migration 136 fails?"**  
  Check the error message. Most likely cause: step 1 wasn't committed. Solution: commit step 1 and retry.

- **"Will this break existing data?"**  
  No! Migration 136 only ADDS the STUDENT type and removes old types. All student accounts remain intact.

- **"What about judges?"**  
  Judges are completely unaffected. They keep the COMPETITION_JUDGE type.

---

## ✅ Success!

When everything works, you should see:

**Database:**
```sql
-- All students:
user_id | participant_type
--------|----------------
student | STUDENT

-- All judges (unchanged):
user_id | participant_type
--------|------------------
judge   | COMPETITION_JUDGE
```

**Frontend:**
- Students see BOTH election and polling events
- Students can vote AND respond
- Admin adds students once, they get full access

**Backend logs:**
- No constraint violations
- No enrollment errors
- Clean startup

---

**Ready? Start with Step 1 above!** 🚀

Need help? Check `IMPLEMENTATION_STATUS.md` for troubleshooting.
