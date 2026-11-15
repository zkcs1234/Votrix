# 🚨 Quick Fix - Run These Commands Now

## The Error You Got

```
ERROR: new row violates check constraint "user_participant_types_participant_type_check"
```

**Cause:** The table's CHECK constraint doesn't allow 'STUDENT' yet.  
**Fix:** I've updated migration 136 to fix this.

---

## Run These 2 Commands

### Command 1: Clean Up
```bash
psql -U postgres -d votrix -f backend/src/database/migrations/136_rollback_partial.sql
```

**What it does:** Removes any partial changes from the failed migration

---

### Command 2: Run Fixed Migration
```bash
psql -U postgres -d votrix -f backend/src/database/migrations/136_migrate_to_student_type.sql
```

**What it does:** 
1. ✅ Updates CHECK constraint to allow 'STUDENT'
2. ✅ Migrates all students to STUDENT type
3. ✅ Removes old types
4. ✅ Sets up triggers

**Expected output:**
```
✓✓✓ SUCCESS: All students migrated to STUDENT type
```

---

## Then Verify

```sql
-- Quick check (should return 0):
SELECT COUNT(*) FROM user_participant_types upt 
JOIN users u ON u.id = upt.user_id 
WHERE u.role IN ('voter', 'participant') 
AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT');
```

**Expected:** `0` (no old types remain)

---

## Then Restart Backend

```bash
npm run dev
```

---

## Done! ✅

Students can now vote AND respond to polls.

**Full details:** See `FIX_MIGRATION_136_ERROR.md`
