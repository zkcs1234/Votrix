# Feature: Invite Registered Voter

## Overview

Add a new invitation method for organizers to invite voters who already have an account in the system (registered voters). This is separate from the existing invitation method that creates new voter accounts.

---

## Current State

### Manual Invitation
- **Input:** Email + Temporary Password (both required)
- **Behavior:** Creates new voter account or resets existing voter's password to temp password
- **File:** `frontend/src/pages/organizer/election/ElectionVotersPage.jsx`

### CSV Upload
- **Input:** CSV with columns `email, tempassword`
- **Behavior:** Creates new voter account with temp password
- **File:** Same as above + `backend/src/services/csv-import.service.js`

---

## Requirements

### 1. Manual Invitation - Two Options

| Method | Button Label | Input | Behavior |
|--------|--------------|-------|----------|
| Existing | `Invite Registered` | Email only | Enrolls existing voter (no password change) |
| Current | `Invite New` | Email + Temp Password | Creates new account (existing behavior) |

### 2. CSV Upload - Auto-Detect Format

| CSV Format | Behavior |
|------------|----------|
| `email, tempassword` (both columns) | Creates new voter with temp password |
| `email` (email column only) | Enrolls existing voter only |

---

## Files to Modify

### Frontend

| File | Change |
|------|--------|
| `frontend/src/pages/organizer/election/ElectionVotersPage.jsx` | Add new "Invite Registered" form |
| `frontend/src/services/election.service.js` | Add new API method |
| `frontend/src/pages/organizer/polling/PollingVotersPage.jsx` | Same changes for polling |
| `frontend/src/pages/organizer/pageant/PageantVotersPage.jsx` | Same changes for pageant |
| `frontend/src/services/polling.service.js` | Add new API method |
| `frontend/src/services/pageant.service.js` | Add new API method |

### Backend

| File | Change |
|------|--------|
| `backend/src/services/invitation.service.js` | Add new function for inviting existing voters |
| `backend/src/controllers/election-organizer.controller.js` | Add new endpoint |
| `backend/src/routes/election-organizer.routes.js` | Add new route |
| `backend/src/services/csv-import.service.js` | Auto-detect CSV format |
| Repeat for polling & pageant controllers/routes/services |

---

## Implementation Steps

### Step 1: Backend - Add New Invitation Function

**File:** `backend/src/services/invitation.service.js`

Add new function:

```javascript
/**
 * Invite an already registered voter to an event.
 * Does NOT create new account or reset password.
 * Simply enrolls the voter in the event.
 */
export async function inviteRegisteredVoter({ eventId, email, organizerId }) {
  // 1. Verify organizer owns the event
  await assertOrganizerOwnsEvent(eventId, organizerId)
  const event = await getEventById(eventId)

  // 2. Find voter by email
  const voter = await findUserByEmail(email.toLowerCase().trim())

  if (!voter) {
    throw new ApiError(404, 'Voter not found. Use the "Invite New" method to create a new voter account.')
  }

  if (voter.role !== USER_ROLES.VOTER) {
    throw new ApiError(400, 'This email belongs to a different account type')
  }

  // 3. Check if already enrolled
  const { data: existing } = await getClient()
    .from(DB_TABLES.EVENT_VOTERS)
    .select('id')
    .eq('event_id', eventId)
    .eq('voter_id', voter.id)
    .maybeSingle()

  if (existing) {
    throw new ApiError(409, 'Voter is already enrolled in this event')
  }

  // 4. Enroll voter in event
  await getClient().from(DB_TABLES.EVENT_VOTERS).insert({
    event_id: eventId,
    voter_id: voter.id,
    has_voted: false,
  })

  // 5. Send invitation email (no password)
  await sendVoterInvitationEmailRegistered({
    email: voter.email,
    eventId: event.id,
    eventTitle: event.title,
  })

  return { user: voter, event: { id: event.id, title: event.title } }
}
```

### Step 2: Backend - New Email Template

**File:** `backend/src/services/mailer.service.js`

Add new function for registered voter invitation (no temp password):

```javascript
export async function sendVoterInvitationEmailRegistered({ email, eventId, eventTitle }) {
  // Similar to existing but WITHOUT temp password in email
  // Just tells them they're invited and to login with existing credentials
}
```

### Step 3: Backend - Add New Endpoint

**File:** `backend/src/controllers/election-organizer.controller.js`

```javascript
export const inviteExistingVoter = asyncHandler(async (req, res) => {
  const { eventId } = req.params
  const { email } = req.body

  if (!email) {
    throw new ApiError(400, 'Email is required')
  }

  const result = await invitationService.inviteRegisteredVoter({
    eventId,
    email,
    organizerId: req.user.id,
  })

  res.json({
    success: true,
    message: 'Voter invited successfully',
    voter: result.user,
  })
})
```

**File:** `backend/src/routes/election-organizer.routes.js`

```javascript
router.post('/events/:eventId/voters/invite-existing', ctrl.inviteExistingVoter)
```

### Step 4: Backend - CSV Import Auto-Detect

**File:** `backend/src/services/csv-import.service.js`

Modify the import logic:

```javascript
async function processVoterRow(row, eventId, organizerId) {
  const { email, tempassword } = row

  // Auto-detect: if tempassword exists, create new. If not, enroll existing.
  if (tempassword && tempassword.trim() !== '') {
    // NEW VOTER: Create account with temp password
    return await invitationService.inviteVoterToEvent({
      eventId,
      email,
      organizerId,
      temporaryPassword: tempassword,
    })
  } else {
    // REGISTERED VOTER: Just enroll
    return await invitationService.inviteRegisteredVoter({
      eventId,
      email,
      organizerId,
    })
  }
}
```

### Step 5: Frontend - Add New API Method

**File:** `frontend/src/services/election.service.js`

```javascript
inviteExistingVoter(eventId, email) {
  return api.post(`${base}/events/${eventId}/voters/invite-existing`, { email })
},
```

### Step 6: Frontend - Add New UI

**File:** `frontend/src/pages/organizer/election/ElectionVotersPage.jsx`

Add second form for "Invite Registered":

```jsx
// State for registered invitation
const [registeredEmail, setRegisteredEmail] = useState('')
const [invitingRegistered, setInvitingRegistered] = useState(false)

// Handler for registered voter invitation
const handleInviteRegistered = async (e) => {
  e.preventDefault()
  setError(null)
  setInvitingRegistered(true)

  try {
    await electionService.inviteExistingVoter(eventId, registeredEmail)
    setRegisteredEmail('')
    load()
    success('Registered voter invited successfully')
  } catch (err) {
    setError(err.response?.data?.message || 'Invite failed')
    showError(err.response?.data?.message || 'Invite failed')
  } finally {
    setInvitingRegistered(false)
  }
}

// Add new form in the JSX
<form onSubmit={handleInviteRegistered} className="flex flex-wrap gap-3">
  <input
    type="email"
    placeholder="voter@email.com"
    className="v-input flex-1 min-w-[200px]"
    value={registeredEmail}
    onChange={(e) => setRegisteredEmail(e.target.value)}
    required
  />
  <Button type="submit" loading={invitingRegistered} variant="secondary">
    Invite Registered
  </Button>
</form>
```

### Step 7: Frontend - Update CSV Helper Text

**File:** Same `ElectionVotersPage.jsx`

Update the helper text around line 202-204:

```jsx
<p className="v-helper-text mb-3">
  Columns: email (required), tempassword (optional).
  <br/>
  - If tempassword provided: Creates new voter with that password.
  <br/>
  - If tempassword empty: Enrolls existing voter only.
</p>
```

### Step 8: Repeat for Polling & Pageant

Apply the same changes to:
- `PollingVotersPage.jsx` + `polling.service.js`
- `PageantVotersPage.jsx` + `pageant.service.js`
- Corresponding backend controllers/routes

---

## API Summary

| Method | Endpoint | Payload | Description |
|--------|----------|---------|-------------|
| POST | `/events/:id/voters/invite` | `{ email, temporaryPassword }` | Invite NEW voter (existing) |
| POST | `/events/:id/voters/invite-existing` | `{ email }` | Invite REGISTERED voter (NEW) |
| POST | `/events/:id/voters/import` | CSV (multipart) | Auto-detect format |

---

## Testing Scenarios

### Test 1: Invite Registered Voter (Manual)
1. Create a voter account manually in database
2. As organizer, use "Invite Registered" with that voter's email
3. Voter should receive email (no temp password)
4. Voter should see event in their dashboard

### Test 2: Invite New Voter (Manual)
1. Use existing "Invite New" with new email + temp password
2. Voter should receive email WITH temp password
3. Voter can login and vote

### Test 3: CSV with tempassword (New Voter)
1. Upload CSV with columns: `email, tempassword`
2. Should create new voter accounts

### Test 4: CSV email only (Registered Voter)
1. Upload CSV with column: `email` only
2. Should enroll existing voters

### Test 5: Error Cases
- Invite registered voter with non-existent email → Error "Voter not found"
- Invite registered voter already enrolled → Error "Already enrolled"
- Invite new voter with existing voter email → Should work (existing behavior)

---

## Rollback Plan

If issues occur:
1. Frontend: Revert to previous version (only has one form)
2. Backend: Remove new endpoint/routes
3. Keep the new function in invitation.service.js but unused - can enable later

---

## Status

- [x] Backend: Add `inviteRegisteredVoter` function
- [x] Backend: Add new email template
- [x] Backend: Add new endpoint for election
- [x] Backend: Add new endpoint for polling
- [x] Backend: Add new endpoint for pageant (N/A - pageant uses judges, not voters)
- [x] Backend: Update CSV import auto-detect
- [x] Frontend: Add API method for election
- [x] Frontend: Add API method for polling
- [x] Frontend: Add API method for pageant (N/A - pageant uses judges, not voters)
- [x] Frontend: Add "Invite Registered" UI for election
- [x] Frontend: Add "Invite Registered" UI for polling
- [x] Frontend: Add "Invite Registered" UI for pageant (N/A - pageant uses judges, not voters)
- [x] Frontend: Update CSV helper text
- [ ] Test all scenarios

---

## Notes

- Created: 2026-06-23
- Related to: Multi-event support for same user
- This feature allows organizers to invite existing voters to new events without resetting their password