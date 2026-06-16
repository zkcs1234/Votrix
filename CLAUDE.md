# Plan: Remove Voter Dashboard - Direct Login Redirect

## Problem
After voter login, they're taken to a dashboard showing all their events (elections, competitions, polls). This creates friction - voters should go directly to the event they're assigned to.

## Goal
When a voter logs in, they should be redirected directly to the event they're assigned to:
- If assigned to an election → go to election voting page
- If assigned to competition scoring → go to competition scoring page
- If assigned to polling → go to poll page

## Implementation Steps

### Step 1: Modify Backend - Add Login Redirect Endpoint
**File:** `backend/src/services/voter.service.js`

Add a new function `getVoterLoginRedirect(voterId)` that:
1. Fetches all events the voter is assigned to
2. Filters for **active** events (where voting/scoring/poll is open)
3. Returns the first active event's redirect path and type
4. Returns `null` if no active events

```javascript
export async function getVoterLoginRedirect(voterId) {
  const dashboard = await getVoterDashboard(voterId)
  
  // Priority: active events first
  if (dashboard.active.length > 0) {
    const event = dashboard.active[0]
    return {
      path: event.actionPath,
      type: event.eventType,
      title: event.title
    }
  }
  
  // If no active events, go to first assigned event
  if (dashboard.assigned.length > 0) {
    const event = dashboard.assigned[0]
    return {
      path: event.actionPath,
      type: event.eventType,
      title: event.title
    }
  }
  
  // No events at all
  return null
}
```

### Step 2: Add Backend Controller Route
**File:** `backend/src/controllers/voter.controller.js`

```javascript
export const getVoterLoginRedirect = asyncHandler(async (req, res) => {
  const redirect = await voterService.getVoterLoginRedirect(req.user.id)
  res.json({ success: true, redirect })
})
```

**File:** `backend/src/routes/voter.routes.js`

Add route:
```javascript
router.get('/login-redirect', authenticate, getVoterLoginRedirect)
```

### Step 3: Update Frontend Service
**File:** `frontend/src/services/voter.service.js`

```javascript
export const voterService = {
  // ... existing methods
  getLoginRedirect() {
    return api.get('/voter/login-redirect')
  }
}
```

### Step 4: Modify Frontend Login Hook
**File:** `frontend/src/hooks/useLogin.js`

Change voter login redirect logic:

```javascript
// After successful login
if (data.user.mustChangePassword) {
  navigate('/change-password', { replace: true })
} else if (data.user.role === USER_ROLES.VOTER) {
  // Get redirect path from server
  voterService.getLoginRedirect()
    .then(({ data }) => {
      if (data.redirect?.path) {
        navigate(data.redirect.path, { replace: true })
      } else {
        // No events - show message or go to simple page
        navigate('/voter/no-events', { replace: true })
      }
    })
    .catch(() => {
      // Fallback to dashboard on error
      navigate('/voter', { replace: true })
    })
} else {
  navigate(getRoleDashboardPath(data.user.role), { replace: true })
}
```

### Step 5: Create Simple "No Events" Page (if needed)
**File:** `frontend/src/pages/voter/NoEventsPage.jsx`

Simple page showing:
- "You have no events assigned yet"
- Contact organizer message

Add route in `frontend/src/routes/index.jsx`.

### Step 6: Test the Flow
Test scenarios:
1. ✅ Voter with active election → redirects to election
2. ✅ Voter with active competition → redirects to competition scoring
3. ✅ Voter with active poll → redirects to poll
4. ✅ Voter with only assigned events → redirects to first assigned
5. ✅ Voter with no events → shows no events page
6. ✅ Voter must change password → goes to change password first

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Multiple active events | Go to first one (priority: election → competition → poll) |
| No active events, has assigned | Go to first assigned event |
| No events at all | Show "No events" page |
| API error | Fallback to dashboard (safe fallback) |

## Backward Compatibility
- The dashboard page still exists for users who directly navigate to `/voter`
- Can be removed later if not used