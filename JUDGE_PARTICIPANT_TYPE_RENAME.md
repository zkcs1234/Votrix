# Judge Participant Type Rename: COMPETITION_JUDGE → JUDGE

## Goal
Rename `COMPETITION_JUDGE` to `JUDGE` in `user_participant_types` table to clarify the distinction between eligibility and event-specific roles.

## Problem
The name `COMPETITION_JUDGE` was used in TWO different contexts, creating confusion:

| Table | Column | Value | Current Meaning |
|-------|--------|-------|-----------------|
| `user_participant_types` | `participant_type` | `COMPETITION_JUDGE` | ⚠️ User can judge competitions (eligibility) |
| `event_participants` | `participant_type` | `COMPETITION_JUDGE` | ✅ User is judging THIS competition (enrollment) |

**Confusion:** Same name for both eligibility (what you CAN do) and enrollment (what you ARE doing).

## Solution
Rename to `JUDGE` in eligibility table only:

| Table | Column | Value | New Meaning |
|-------|--------|-------|-------------|
| `user_participant_types` | `participant_type` | `JUDGE` ✅ | User can judge competitions (eligibility) |
| `event_participants` | `participant_type` | `COMPETITION_JUDGE` | User is judging THIS competition (enrollment) |

**Benefits:**
- ✅ Clear distinction: `JUDGE` (generic eligibility) vs `COMPETITION_JUDGE` (specific event role)
- ✅ Consistent with `STUDENT` pattern (generic eligibility)
- ✅ Matches frontend: "Judges" panel manages judge pool

## Pattern Consistency

This follows the same pattern as `STUDENT`:

### Students
- **Eligibility** (`user_participant_types`): `STUDENT` → can vote/respond
- **Enrollment** (`event_participants`): `ELECTION_VOTER` or `POLLING_RESPONDENT` → specific event role

### Judges  
- **Eligibility** (`user_participant_types`): `JUDGE` → can judge
- **Enrollment** (`event_participants`): `COMPETITION_JUDGE` → specific event role

---

## Implementation

### Step 1: Database Migration 137

**File:** `backend/src/database/migrations/137_rename_competition_judge_to_judge.sql`

```sql
BEGIN;

-- Add JUDGE enum value
ALTER TYPE participant_type ADD VALUE IF NOT EXISTS 'JUDGE';

-- Migrate data in user_participant_types only
UPDATE user_participant_types
SET participant_type = 'JUDGE'
WHERE participant_type = 'COMPETITION_JUDGE';

-- Update CHECK constraint
ALTER TABLE user_participant_types
DROP CONSTRAINT IF EXISTS user_participant_types_participant_type_check;

ALTER TABLE user_participant_types
ADD CONSTRAINT user_participant_types_participant_type_check
CHECK (participant_type IN ('STUDENT', 'JUDGE', 'ORGANIZER'));

COMMIT;
```

**What it does:**
- ✅ Adds `JUDGE` enum value
- ✅ Migrates existing `COMPETITION_JUDGE` → `JUDGE` in `user_participant_types`
- ✅ Updates CHECK constraint to allow `JUDGE` (removes `COMPETITION_JUDGE`)
- ✅ `event_participants` table keeps `COMPETITION_JUDGE` unchanged

---

### Step 2: Backend Constants

**File:** `backend/src/utils/constants.js`

```javascript
// BEFORE
export const PARTICIPANT_TYPES = {
  STUDENT: 'STUDENT',
  ELECTION_VOTER: 'ELECTION_VOTER',
  COMPETITION_JUDGE: 'COMPETITION_JUDGE',
  POLLING_RESPONDENT: 'POLLING_RESPONDENT',
}

// AFTER
export const PARTICIPANT_TYPES = {
  // Eligibility types (user_participant_types)
  STUDENT: 'STUDENT',
  JUDGE: 'JUDGE',
  ORGANIZER: 'ORGANIZER',
  
  // Legacy/Event-specific types
  ELECTION_VOTER: 'ELECTION_VOTER',
  COMPETITION_JUDGE: 'COMPETITION_JUDGE',
  POLLING_RESPONDENT: 'POLLING_RESPONDENT',
}
```

**What changed:**
- ✅ Added `JUDGE` constant for eligibility checks
- ✅ Added documentation explaining two contexts
- ✅ Kept `COMPETITION_JUDGE` for event enrollment (backward compatibility)

---

### Step 3: Admin Participant Service

**File:** `backend/src/services/admin-participant.service.js`

Changed **6 functions** to use `JUDGE` instead of `COMPETITION_JUDGE`:

#### List Function
```javascript
// BEFORE
.eq('user_participant_types.participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)

// AFTER
.eq('user_participant_types.participant_type', PARTICIPANT_TYPES.JUDGE)
```

#### Create/Update Functions
```javascript
// BEFORE
await addParticipantTypeMembership(data.id, PARTICIPANT_TYPES.COMPETITION_JUDGE)

// AFTER
await addParticipantTypeMembership(data.id, PARTICIPANT_TYPES.JUDGE)
```

#### Remove Function
```javascript
// BEFORE
await setParticipantTypeMembership(userId, PARTICIPANT_TYPES.COMPETITION_JUDGE, false)

// AFTER
await setParticipantTypeMembership(userId, PARTICIPANT_TYPES.JUDGE, false)
```

**Functions updated:**
1. `listJudges()` - queries for judges in eligibility pool
2. `insertJudge()` - assigns JUDGE eligibility when creating
3. `createJudge()` - assigns JUDGE eligibility when adding
4. `assertJudge()` - checks JUDGE eligibility
5. `removeJudgeMembership()` - removes JUDGE eligibility
6. `registerJudgeImport()` - assigns JUDGE eligibility during CSV import

---

### Step 4: Competition Service

**File:** `backend/src/services/competition.service.js`

**Changed:** Eligibility pool queries (lines 723, 771)

```javascript
// BEFORE
.from(DB_TABLES.USER_PARTICIPANT_TYPES)
.eq('participant_type', PARTICIPANT_TYPES.COMPETITION_JUDGE)

// AFTER
.from(DB_TABLES.USER_PARTICIPANT_TYPES)
.eq('participant_type', PARTICIPANT_TYPES.JUDGE)
```

**Context:** These queries fetch available judges from the eligibility pool when organizers are inviting judges to events.

---

## Files Modified

| File | Change | Lines Changed |
|------|--------|---------------|
| `backend/src/database/migrations/137_rename_competition_judge_to_judge.sql` | ✅ Created | New migration |
| `backend/src/utils/constants.js` | ✅ Updated | Added `JUDGE`, updated comments |
| `backend/src/services/admin-participant.service.js` | ✅ Updated | 6 functions (7 occurrences) |
| `backend/src/services/competition.service.js` | ✅ Updated | 1 function (2 occurrences) |

---

## What Stays UNCHANGED

### Event Participants (Event-Specific Roles)
All these files still use `COMPETITION_JUDGE` for `event_participants` table queries (enrollment):

- ✅ `backend/src/services/competition-native.service.js` (line 61)
- ✅ `backend/src/services/competition-session.service.js` (lines 654, 1906)
- ✅ `backend/src/services/competition.service.js` (lines 665, 732, 792, 849, 875, 899, 929)
- ✅ `backend/src/services/dashboard.service.js` (lines 383, 432, 538, 541)
- ✅ `backend/src/services/pageant.service.js` (many lines)
- ✅ `backend/src/services/reports.service.js` (lines 90, 91)
- ✅ `backend/src/services/voter.service.js` (line 91)

**Why?** These query `event_participants` (enrollment), not `user_participant_types` (eligibility). The event-specific role name stays as `COMPETITION_JUDGE`.

### Participant Service
`backend/src/services/participant.service.js` uses `COMPETITION_JUDGE` for:
- `resolveParticipantType()` - returns event-specific type for enrolling in competitions ✅
- Event enrollment checks ✅

**Why?** These deal with event enrollment, not eligibility pool.

---

## Testing Checklist

### After Running Migration 137

1. **Check database:**
```sql
-- Should show JUDGE (not COMPETITION_JUDGE)
SELECT participant_type, COUNT(*) 
FROM user_participant_types 
GROUP BY participant_type;

-- Should still show COMPETITION_JUDGE
SELECT DISTINCT participant_type 
FROM event_participants 
WHERE participant_type LIKE '%JUDGE%';
```

2. **Test admin panel:**
- [ ] Open admin → Participant Management → Judges tab
- [ ] Verify judges are visible
- [ ] Add a new judge → verify gets `JUDGE` in `user_participant_types`
- [ ] Import judges CSV → verify they get `JUDGE` type
- [ ] Edit a judge → verify update works
- [ ] Export judges CSV → verify download works

3. **Test competition judging:**
- [ ] Create/edit competition event
- [ ] Go to Judges section
- [ ] Click "Invite Judges" → verify list shows judges from pool
- [ ] Invite a judge → verify they get enrolled with `COMPETITION_JUDGE` in `event_participants`
- [ ] Judge can access scoring page
- [ ] Judge submission works

### Expected Results

| Action | Database Check |
|--------|----------------|
| Admin adds judge via panel | `user_participant_types` gets `JUDGE` row |
| Organizer invites judge to event | `event_participants` gets `COMPETITION_JUDGE` row |
| Judge enrolls in event | `event_participants` gets `COMPETITION_JUDGE` row |

---

## Rollback Plan

If migration 137 causes issues:

```sql
BEGIN;

-- Re-add COMPETITION_JUDGE as allowed value
ALTER TABLE user_participant_types
DROP CONSTRAINT IF EXISTS user_participant_types_participant_type_check;

ALTER TABLE user_participant_types
ADD CONSTRAINT user_participant_types_participant_type_check
CHECK (participant_type IN ('STUDENT', 'JUDGE', 'COMPETITION_JUDGE', 'ORGANIZER'));

-- Revert data
UPDATE user_participant_types
SET participant_type = 'COMPETITION_JUDGE'
WHERE participant_type = 'JUDGE';

COMMIT;
```

Then revert backend code changes:
- `git revert <commit-hash>`
- Or manually change `PARTICIPANT_TYPES.JUDGE` back to `PARTICIPANT_TYPES.COMPETITION_JUDGE`

---

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Eligibility** (`user_participant_types`) | `COMPETITION_JUDGE` | `JUDGE` ✅ |
| **Enrollment** (`event_participants`) | `COMPETITION_JUDGE` | `COMPETITION_JUDGE` (unchanged) |
| **Admin Panel Query** | Queries `COMPETITION_JUDGE` | Queries `JUDGE` ✅ |
| **Competition Service** | Queries `COMPETITION_JUDGE` | Queries `JUDGE` ✅ |
| **Event Enrollment** | Uses `COMPETITION_JUDGE` | Uses `COMPETITION_JUDGE` (unchanged) |

---

## Next Steps

1. ✅ Created migration 137
2. ✅ Updated backend constants
3. ✅ Updated admin participant service (6 functions)
4. ✅ Updated competition service (eligibility queries)
5. ⏳ **You need to run migration 137**
6. ⏳ **Restart backend**
7. ⏳ **Test admin Judges panel**

---

## Related Documentation

- Admin Students Table Fix: `ADMIN_PANEL_STUDENT_FIX.md`
- Student Migration: `STUDENT_PARTICIPANT_TYPE_FIX_INDEX.md`
- Original plan: This conversation
