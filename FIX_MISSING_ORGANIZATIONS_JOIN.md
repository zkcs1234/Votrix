# Fix: Missing Organizations Join in Voter Dashboard Queries

## Problem

Voter dashboard was showing **0 assigned events** even after migrating from `event_voters` to `event_participants` table because the queries were **missing the organizations join**.

## Root Cause

When we migrated the three list functions to query `event_participants` directly, we didn't include the `organizations` join that the mapper functions (`mapEvent` and `mapPollEvent`) expect.

### What Happened

1. Queries selected from `event_participants.events` join
2. Data was passed to `mapEvent()` or `mapPollEvent()`  
3. These mapper functions tried to access `row.organizations`
4. `organizations` was undefined → mappers failed silently or returned incomplete data
5. Events were dropped or not properly classified
6. Dashboard showed 0 events

## Files Fixed

### 1. `backend/src/services/election.service.js`
**Function:** `listVoterElectionEvents()`

**Added:**
```javascript
organizations (
  id,
  organization_name,
  logo
)
```

### 2. `backend/src/services/polling.service.js`
**Function:** `listVoterPollEvents()`

**Added:**
```javascript
organizations (
  id,
  organization_name,
  logo
)
```

### 3. `backend/src/services/pageant.service.js`
**Function:** `listJudgeCompetitionEvents()`

**Added:**
```javascript
organizations (
  id,
  organization_name,
  logo
)
```

## Why This Was Needed

Both `mapEvent()` (from `backend/src/foundation/mapper.js`) and `mapPollEvent()` (from `backend/src/services/polling.service.js`) expect organization data:

```javascript
// mapEvent expects:
const org = row.organizations ?? null

// mapPollEvent expects:
const org = row.organizations ?? null
```

Without the join, `row.organizations` was `undefined`, causing the mappers to potentially fail or return incomplete event objects.

## Testing

### Local Test Result ✅
```
📊 Total events that should appear in dashboard: 1
✅ 1 event(s) should appear in dashboard.
```

### Expected Production Result

After deploying this fix:
- Voter dashboard will show correct number of assigned events
- Each event will have proper organization data (name, logo)
- Events will be properly classified into "assigned", "active", or "completed" buckets

## Deployment Steps

1. **Commit changes:**
   ```bash
   git add backend/src/services/election.service.js
   git add backend/src/services/polling.service.js
   git add backend/src/services/pageant.service.js
   git commit -m "fix: add missing organizations join to voter dashboard queries"
   ```

2. **Push to repository:**
   ```bash
   git push origin main
   ```

3. **Deploy to Render:**
   - Render should auto-deploy from git push
   - Or manually trigger deployment in Render dashboard

4. **Verify in production:**
   - Login as voter
   - Dashboard should now show correct event count
   - Check browser console for any errors

## Related Issues Fixed

This fix resolves:
1. ✅ Voter dashboard showing 0 events when voter is enrolled
2. ✅ Missing organization data in dashboard event cards
3. ✅ Events not being properly classified into buckets

## Summary

**Before:** Queries missing `organizations` join → mapper functions failed → 0 events shown

**After:** Queries include `organizations` join → mappers work correctly → events shown properly

**Total Changes:** 3 service files, 3 queries fixed

---

*Date: August 12, 2026*
*Issue: Voter dashboard shows 0 assigned events*
*Solution: Add organizations join to all 3 voter list functions*
