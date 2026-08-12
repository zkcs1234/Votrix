# Solution: Voter Dashboard Shows 0 Assigned Events

## Problem Diagnosis

The voter dashboard was showing **0 assigned events** even though the voter was registered to 1 polling event.

## Root Cause

The backend server was **running the old code** that queried the deprecated `v_event_voters` view instead of the `event_participants` table.

## Database State (Verified)

✅ **Data is correct:**
- Voter `zarkenneth95@gmail.com` (ID: `806297d2-c758-42bd-9171-26fd2911ae7b`)
- **IS enrolled** in `event_participants` table
- **Enrollment:** 1 event (T-SHIRT DESIGN POLL as `POLLING_RESPONDENT`)
- **Test queries work correctly** when run directly

## Code State (Fixed)

✅ **All code has been migrated:**
- `election.service.js` - queries `event_participants` ✅
- `polling.service.js` - queries `event_participants` ✅  
- `dashboard.service.js` - queries `event_participants` ✅
- `event.service.js` - queries `event_participants` ✅

## Solution: Restart Backend Server

**The backend server needs to be restarted to load the new code.**

### Steps to Fix:

#### Windows (PowerShell):
```powershell
# 1. Stop the backend process
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*Votrix*backend*" } | Stop-Process -Force

# 2. Navigate to backend folder
cd backend

# 3. Start the server
npm run dev
# OR
npm start
```

#### Alternative (if using PM2):
```bash
pm2 restart votrix-backend
```

#### Alternative (if using other process manager):
Stop and restart your Node.js backend process using your deployment method.

---

## Verification After Restart

### 1. Check Backend is Running
```bash
curl http://localhost:YOUR_PORT/health
```

### 2. Test Voter Dashboard Endpoint
Login as the voter and check:
```
GET /voter/dashboard
```

**Expected Response:**
```json
{
  "stats": {
    "total": 1,
    "assigned": 0 or 1,  // depends on poll status
    "active": 0 or 1,     // depends on poll status
    "completed": 0
  },
  "events": [
    {
      "id": "b39e0cf2-53bb-47a9-b464-f1946ded050d",
      "title": "T-SHIRT DESIGN POLL",
      "eventType": "polling",
      "bucket": "active" or "assigned",
      ...
    }
  ]
}
```

### 3. Check Frontend
- Login as voter `zarkenneth95@gmail.com`
- Dashboard should show **1 event** (not 0)
- Event should appear in either "Assigned" or "Active" section depending on poll status

---

## Why It Was Showing 0

**Before restart:**
- Backend was running old code that queried `v_event_voters` view
- View showed the data, but the old code wasn't filtering properly
- Result: 0 events returned

**After restart:**
- Backend loads new code that queries `event_participants` directly
- Proper filtering by `participant_type = 'POLLING_RESPONDENT'`
- Result: 1 event returned correctly

---

## Additional Notes

### If Dashboard Still Shows 0 After Restart

1. **Check backend logs for errors:**
   ```bash
   # View logs
   tail -f backend/logs/app.log
   # OR check console where backend is running
   ```

2. **Verify backend loaded new code:**
   - Check file timestamps
   - Add a `console.log` to `listVoterPollEvents` function
   - Restart again if needed

3. **Clear browser cache:**
   - Frontend might be caching old API responses
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

4. **Check if voter needs to be enrolled in other events:**
   - Currently only enrolled in 1 polling event
   - "Department Election" (election) - voter is NOT enrolled
   - "Department Pageant" (competition_scoring) - voter is NOT enrolled
   - If you want the voter to see these events, register them:
     ```javascript
     // Via organizer UI or API:
     POST /organizer/election/events/{eventId}/voters/register
     POST /organizer/competition/events/{eventId}/judges/register
     ```

---

## Database Verification Scripts

Created helpful scripts in `backend/` folder:

1. **`check_participants.mjs`** - Shows overall participant counts
2. **`debug_voter.mjs`** - Shows detailed voter enrollment info
3. **`direct_query_test.mjs`** - Tests exact queries service functions use
4. **`migrate_existing_voters.mjs`** - Migrates old `event_voters` data (not needed, already done)

Run any of these to verify database state:
```bash
cd backend
node debug_voter.mjs
```

---

## Summary

- ✅ Code is fixed and migrated
- ✅ Database has correct data
- ✅ Queries return correct results
- ⚠️ **Backend server needs restart** to load new code
- 📊 After restart: Dashboard should show 1 event (T-SHIRT DESIGN POLL)

**Action Required:** Restart your backend server!
