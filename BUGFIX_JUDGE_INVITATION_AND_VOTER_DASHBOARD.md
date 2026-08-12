# Bug Fixes: Judge Invitation Error & Voter Dashboard 0 Assigned Events

## Issues Fixed

### Issue 1: Competition Judge Invitation Error (Frontend)
**Problem:** When clicking "Send Invitation" on the Competition Judges page, an error message appeared even though the email was sent successfully.

**Root Cause:** The `load()` function was being called after the success/error check, which meant that if there was an error in the API call, it would still try to reload the data and could cause UI inconsistencies. The timing of the reload should only happen after a successful invitation send.

**Fix:** Moved `load()` inside the success condition so it only reloads the judge list after a successful invitation send.

**File Changed:**
- `frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx` (line 198)

---

### Issue 2: Voter Dashboard Shows 0 Assigned Events (Backend)
**Problem:** The voter dashboard showed 0 assigned events even when voters were registered to events. After sign-in and filling the information form, voters were redirected to the dashboard instead of their assigned event because the system couldn't find any assigned events.

**Root Cause:** The backend services were querying the **old `event_voters` view** (`v_event_voters`) instead of directly querying the **new `event_participants` table**. While the view does wrap `event_participants`, it uses `voter_id` instead of `user_id` and only provides backward compatibility for legacy code.

The three list functions had inconsistent behavior:
- ✅ `listJudgeCompetitionEvents()` - correctly queried `event_participants` with `user_id` and `participant_type`
- ❌ `listVoterElectionEvents()` - queried the view with `voter_id`
- ❌ `listVoterPollEvents()` - queried the view with `voter_id` 

Additionally, `listVoterPollEvents()` was mapping `has_voted` to `hasResponded`, but the new table uses `has_responded`.

**Fix:** Updated both election and polling services to:
1. Query `event_participants` table directly instead of the view
2. Use `user_id` instead of `voter_id`
3. Filter by appropriate `participant_type`:
   - Election: `PARTICIPANT_TYPES.ELECTION_VOTER`
   - Polling: `PARTICIPANT_TYPES.POLLING_RESPONDENT`
4. Fixed polling mapping to use `has_responded` instead of `has_voted`

**Files Changed:**
- `backend/src/services/election.service.js` (lines 964-985)
- `backend/src/services/polling.service.js` (lines 1253-1281)

---

## Technical Details

### Migration Context
Migration 029 (`backend/src/database/migrations/029_event_participant_roles.sql`) introduced:
- New `event_participants` table with `participant_type`, `has_voted`, `has_scored`, `has_responded`, `metadata`
- Backward-compatibility view `v_event_voters` wrapping `event_participants`
- `DB_TABLES.EVENT_VOTERS` now points to the view: `'v_event_voters'`

However, for consistency and to avoid view-related issues, all module services should query `event_participants` directly with the appropriate `participant_type` filter.

### Participant Type Constants
From `backend/src/utils/constants.js`:
```javascript
export const PARTICIPANT_TYPES = {
  ELECTION_VOTER: 'ELECTION_VOTER',
  COMPETITION_JUDGE: 'COMPETITION_JUDGE',
  POLLING_RESPONDENT: 'POLLING_RESPONDENT',
}
```

### Query Pattern
**Before (using view):**
```javascript
.from(DB_TABLES.EVENT_VOTERS)
.eq('voter_id', voterId)
```

**After (using table):**
```javascript
.from(DB_TABLES.EVENT_PARTICIPANTS)
.eq('user_id', voterId)
.eq('participant_type', PARTICIPANT_TYPES.ELECTION_VOTER) // or appropriate type
```

---

## Testing Checklist

### Issue 1: Judge Invitation
- [x] Register a judge via email
- [ ] Click "Send Invitation" button
- [ ] Verify no error toast appears
- [ ] Verify success toast shows "Invitation sent successfully"
- [ ] Verify judge list reloads and shows invitation sent status

### Issue 2: Voter Dashboard
#### Election Module
- [ ] Register a voter to an election event
- [ ] Sign in as that voter
- [ ] Verify dashboard shows 1 assigned event (not 0)
- [ ] Fill information form (if enabled)
- [ ] Verify redirect to the assigned election event (not dashboard)

#### Competition Module
- [ ] Register a judge to a competition event
- [ ] Sign in as that judge
- [ ] Verify dashboard shows 1 assigned event
- [ ] Fill information form (if enabled)
- [ ] Verify redirect to the scoring page

#### Polling Module
- [ ] Register a respondent to a polling event
- [ ] Sign in as that respondent
- [ ] Verify dashboard shows 1 assigned event (not 0)
- [ ] Fill information form (if enabled)
- [ ] Verify redirect to the assigned polling event (not dashboard)

---

## Related Documentation
- `docs/plans/voter-registration-invitation-table-mixup-fix.md` - Original analysis of the table migration issue
- `backend/src/database/migrations/029_event_participant_roles.sql` - Migration introducing `event_participants`

---

## Notes

### Why Not Use the View?
While `v_event_voters` provides backward compatibility, using it has several issues:
1. **Column name confusion**: Uses `voter_id` instead of `user_id`
2. **Field mapping bugs**: Required manual mapping like `has_voted → hasResponded`
3. **Inconsistency**: Competition already used the table directly
4. **Future-proofing**: The view is a temporary bridge; direct table access is cleaner

### Why Three Separate Functions?
Each module has its own list function because they:
1. Select different event-specific fields (e.g., `voting_enabled` vs `scoring_enabled`)
2. Apply different filters (e.g., competition filters by `COMPETITION_SCORING_EVENT_TYPES`)
3. Map to different participant statuses (`has_voted` vs `has_scored` vs `has_responded`)

The unified dashboard function (`getVoterDashboard` in `voter.service.js`) aggregates all three.
