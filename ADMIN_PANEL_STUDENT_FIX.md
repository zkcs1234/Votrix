# Admin Panel Student Table Fix

## Problem
Admin panel's Students table was showing nothing because backend was querying for OLD participant types (`ELECTION_VOTER`, `POLLING_RESPONDENT`), but students now have the NEW `STUDENT` type after migration 136.

## Root Cause
All admin participant service functions were hardcoded to query/create/update the old types:
- `listVoters()` → queried `ELECTION_VOTER`
- `listRespondents()` → queried `POLLING_RESPONDENT`
- `createVoter()` → created `ELECTION_VOTER`
- `createRespondent()` → created `POLLING_RESPONDENT`
- And all update/remove/import functions used the old types

## Solution
Updated all functions in `backend/src/services/admin-participant.service.js` to use `PARTICIPANT_TYPES.STUDENT`:

### Changed Functions (11 total)

#### List/Query Functions
```javascript
// BEFORE
listVoters() → listSchoolParticipantType(PARTICIPANT_TYPES.ELECTION_VOTER)
listRespondents() → listSchoolParticipantType(PARTICIPANT_TYPES.POLLING_RESPONDENT)

// AFTER
listVoters() → listSchoolParticipantType(PARTICIPANT_TYPES.STUDENT)
listRespondents() → listSchoolParticipantType(PARTICIPANT_TYPES.STUDENT)
```

#### Create Functions
```javascript
// BEFORE
createVoter() → createSchoolParticipant(..., PARTICIPANT_TYPES.ELECTION_VOTER)
createRespondent() → createSchoolParticipant(..., PARTICIPANT_TYPES.POLLING_RESPONDENT)

// AFTER
createVoter() → createSchoolParticipant(..., PARTICIPANT_TYPES.STUDENT)
createRespondent() → createSchoolParticipant(..., PARTICIPANT_TYPES.STUDENT)
```

#### Update Functions
```javascript
// BEFORE
updateVoter() → updateSchoolParticipant(..., PARTICIPANT_TYPES.ELECTION_VOTER)
updateRespondent() → updateSchoolParticipant(..., PARTICIPANT_TYPES.POLLING_RESPONDENT)
updateVoterStatus() → updateSchoolParticipantStatus(..., PARTICIPANT_TYPES.ELECTION_VOTER)
updateRespondentStatus() → updateSchoolParticipantStatus(..., PARTICIPANT_TYPES.POLLING_RESPONDENT)

// AFTER
updateVoter() → updateSchoolParticipant(..., PARTICIPANT_TYPES.STUDENT)
updateRespondent() → updateSchoolParticipant(..., PARTICIPANT_TYPES.STUDENT)
updateVoterStatus() → updateSchoolParticipantStatus(..., PARTICIPANT_TYPES.STUDENT)
updateRespondentStatus() → updateSchoolParticipantStatus(..., PARTICIPANT_TYPES.STUDENT)
```

#### Remove Functions
```javascript
// BEFORE
removeVoterMembership() → assertSchoolParticipant(..., ELECTION_VOTER) + setParticipantTypeMembership(..., ELECTION_VOTER, false)
removeRespondentMembership() → assertSchoolParticipant(..., POLLING_RESPONDENT) + setParticipantTypeMembership(..., POLLING_RESPONDENT, false)

// AFTER
removeVoterMembership() → assertSchoolParticipant(..., STUDENT) + setParticipantTypeMembership(..., STUDENT, false)
removeRespondentMembership() → assertSchoolParticipant(..., STUDENT) + setParticipantTypeMembership(..., STUDENT, false)
```

#### CSV Import Functions
```javascript
// BEFORE
registerVoterImport() → registerSchoolParticipantImport(..., PARTICIPANT_TYPES.ELECTION_VOTER)
registerRespondentImport() → registerSchoolParticipantImport(..., PARTICIPANT_TYPES.POLLING_RESPONDENT)

// AFTER
registerVoterImport() → registerSchoolParticipantImport(..., PARTICIPANT_TYPES.STUDENT)
registerRespondentImport() → registerSchoolParticipantImport(..., PARTICIPANT_TYPES.STUDENT)
```

## Files Modified
- ✅ `backend/src/services/admin-participant.service.js` (11 functions updated)

## Impact
- ✅ Admin panel Students table will now show all users with `STUDENT` type
- ✅ Creating new students via admin panel will assign `STUDENT` type
- ✅ Importing students via CSV will assign `STUDENT` type
- ✅ Updating/removing students will work with `STUDENT` type
- ✅ Export CSV will work (uses same `listVoters`/`listRespondents` functions)

## Why Both getVoters and getRespondents?
The frontend's `StudentsPanel.jsx` calls **both** endpoints and merges them:
```javascript
const [votersRes, respondentsRes] = await Promise.all([
  adminService.getVoters(),
  adminService.getRespondents(),
])
```

**Before fix:** Both returned empty arrays (no `ELECTION_VOTER` or `POLLING_RESPONDENT` users exist)  
**After fix:** Both return the **same** students (all have `STUDENT` type), frontend merges them without duplicates

## Testing Checklist
- [ ] Open admin panel → Participant Management → Students tab
- [ ] Verify students are now visible
- [ ] Try adding a new student → verify it gets `STUDENT` type
- [ ] Try importing students via CSV → verify they get `STUDENT` type
- [ ] Try editing a student → verify update works
- [ ] Try exporting students → verify CSV download works
- [ ] Check database: `SELECT * FROM user_participant_types WHERE participant_type = 'STUDENT'`

## Related Files
- Migration 135: Added `STUDENT` enum to database
- Migration 136: Migrated `ELECTION_VOTER` + `POLLING_RESPONDENT` → `STUDENT`
- `backend/src/utils/constants.js`: Added `STUDENT` constant
- `backend/src/services/participant.service.js`: Updated `resolveParticipantType()`
- `frontend/src/services/voter.service.js`: Added `STUDENT` label
- `frontend/src/pages/voter/VoterDashboardPage.jsx`: Added `STUDENT` role phrase

## Next Steps
1. Restart backend to apply changes
2. Test admin panel Students table
3. Verify new student creation assigns `STUDENT` type
4. Update documentation if needed
