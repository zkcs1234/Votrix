# Fix: Organizations Logo Column Error

## Problem

After adding the organizations join to voter dashboard queries, the application showed error:
```
column organizations_2.logo does not exist
```

Everything became blank with only this error message visible.

## Root Cause

Migration 028 (`028_single_organization_per_organizer.sql`) **moved the logo field** from the `organizations` table to the `users` table:

- **Before Migration 028:** `organizations.logo` existed
- **After Migration 028:** 
  - `organizations.logo` was **dropped**
  - Logo moved to `users.organization_logo`

Our queries were trying to select `organizations.logo` which no longer exists in the database.

## Solution

### 1. Removed `logo` from SELECT queries

Updated all 3 list functions to NOT select the non-existent `logo` column:

**Files Changed:**
- `backend/src/services/election.service.js` - `listVoterElectionEvents()`
- `backend/src/services/polling.service.js` - `listVoterPollEvents()`
- `backend/src/services/pageant.service.js` - `listJudgeCompetitionEvents()`

**Changed from:**
```javascript
organizations (
  id,
  organization_name,
  logo  // ❌ This column doesn't exist!
)
```

**Changed to:**
```javascript
organizations (
  id,
  organization_name
)
```

### 2. Updated mapper functions

Fixed both mappers to set `logo: null` with explanation comment:

**Files Changed:**
- `backend/src/foundation/mapper.js` - `mapEvent()`
- `backend/src/services/polling.service.js` - `mapPollEvent()`

**Changed from:**
```javascript
organization: org
  ? {
      id: org.id,
      name: org.organization_name,
      logo: org.logo ?? null,  // ❌ org.logo doesn't exist
    }
  : null,
```

**Changed to:**
```javascript
organization: org
  ? {
      id: org.id,
      name: org.organization_name,
      logo: null, // Logo moved to users table in migration 028
    }
  : null,
```

## Why Logo Was Moved

According to migration 028, the logo was moved because:

> "Organization name and logo are moved to the users table so each organizer has exactly one organization profile regardless of which module they use."

This enforces a 1:1 relationship between organizer and organization.

## Impact

- ✅ No more database column errors
- ✅ Voter dashboard will load correctly
- ⚠️ Organization logos won't display in voter dashboard (set to null)

## If Logo Display Is Needed

If you need to show organization logos in the voter dashboard, you would need to:

1. Join through the organizer user:
   ```javascript
   organizations (
     id,
     organization_name,
     organizer_id,
     users!organizations_organizer_id_fkey (
       organization_logo
     )
   )
   ```

2. Update mappers to extract logo from the nested users object

However, for now, setting logo to `null` is the simplest fix that gets the dashboard working.

## Testing

### Local Test Result ✅
```
📊 Total events that should appear in dashboard: 1
✅ 1 event(s) should appear in dashboard.
```

### Expected Production Result

After deploying:
- ✅ No more "column does not exist" errors
- ✅ Voter dashboard loads successfully
- ✅ Events display correctly (without organization logos)
- ✅ All functionality restored

## Files Modified

1. `backend/src/services/election.service.js` - Removed logo from query
2. `backend/src/services/polling.service.js` - Removed logo from query + updated mapper
3. `backend/src/services/pageant.service.js` - Removed logo from query
4. `backend/src/foundation/mapper.js` - Updated mapper to set logo: null

## Deployment

```bash
git add backend/src/services/election.service.js
git add backend/src/services/polling.service.js  
git add backend/src/services/pageant.service.js
git add backend/src/foundation/mapper.js
git commit -m "fix: remove organizations.logo from queries (column no longer exists)"
git push origin main
```

Then redeploy to Render.

---

*Date: August 12, 2026*
*Issue: column organizations_2.logo does not exist*
*Solution: Remove logo from queries and set to null in mappers*
