# Logo & Banner Display Implementation Plan

## Overview
This plan covers where to display the **Organization Logo** and **Event Banner** in the Votrix system. Focus is on the **voter side** first (user-facing) to ensure logos don't cover important information.

---

## Current Data Structure

### Backend Data Available
| Field | Location | Currently Returned to Voter? |
|-------|----------|------------------------------|
| `event.banner` | Events table | ✅ Yes (via `mapEvent`) |
| `event.organizationId` | Events table | ✅ Yes |
| `organizations.logo` | Organizations table | ❌ No |
| `organizations.organization_name` | Organizations table | ❌ No |

### What's Missing
1. **Voter Dashboard Events** - No banner or organization data
2. **Voter Event Pages** - Has banner, but no organization logo/name

---

## Implementation Plan

### Phase 1: Voter Dashboard - Event Cards (HIGH PRIORITY)

**Goal:** Show event banner as cover image on voter dashboard event cards

**Files to Modify:**
1. `backend/src/services/election.service.js` - `listVoterElectionEvents()`
2. `backend/src/services/pageant.service.js` - `listJudgeCompetitionEvents()`
3. `backend/src/services/polling.service.js` - `listVoterPollEvents()`
4. `backend/src/services/voter.service.js` - Add banner to classification functions
5. `frontend/src/components/voter/VoterEventCard.jsx` - Display banner as cover image

**UI Design:**
```
┌─────────────────────────────────────────────┐
│  ┌─────────────────────────────────────┐    │
│  │     [EVENT BANNER IMAGE]           │    │ ← Full-width cover, 120px height
│  │     (object-cover, gradient overlay)│   │
│  └─────────────────────────────────────┘    │
│  [TYPE ICON]  Event Title                  │
│  Description text here...                   │
│                              [STATUS BADGE] │
│  Action label →                            │
└─────────────────────────────────────────────┘
```

**Styling Notes:**
- Banner: 100% width, 120px height, `object-cover`
- Add subtle gradient overlay for text readability
- Fallback: If no banner, show default gradient background with event type color
- Don't let banner cover the status badge or action button

---

### Phase 2: Voter Event Page - Header (HIGH PRIORITY)

**Goal:** Show event banner + organization logo in the header when voting/scoring

**Files to Modify:**
1. `backend/src/services/election.service.js` - `getVoterBallot()` - add organization data
2. `backend/src/services/pageant.service.js` - `getScoringSheet()` - add organization data
3. `backend/src/services/polling.service.js` - `getPoll()` - add organization data
4. `frontend/src/pages/voter/VoterEventPage.jsx` - Display banner + org info
5. `frontend/src/pages/voter/VoterPollPage.jsx` - Display banner + org info
6. `frontend/src/pages/voter/JudgeScoringPage.jsx` - Display banner + org info

**UI Design (VoterEventPage):**
```
┌─────────────────────────────────────────────┐
│  ┌─────────────────────────────────────┐    │
│  │     [EVENT BANNER IMAGE]           │    │ ← Full-width, 180px height
│  │     (dark gradient overlay)         │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  EVENT TITLE                                │ ← White text on banner
│  Description text here...                   │
│                                             │
│  ┌──────┐  Organized by Organization Name │
│  │[LOGO]│                                   │ ← 32x32 logo + org name
│  └──────┘                                   │
└─────────────────────────────────────────────┘

[ Positions / Candidates sections below... ]
```

**Styling Notes:**
- Banner: Full width, 180px height, `object-cover`
- Dark gradient overlay (bottom 50%) for text readability
- Organization logo: 32x32 circle, next to "Organized by [Name]"
- If no org logo: Show placeholder avatar icon
- Keep banner in header area, don't let it push down content

---

### Phase 3: Admin - Organizer Management (MEDIUM PRIORITY)

**Goal:** Show organization logo next to organizer accounts

**Files to Modify:**
1. `backend/src/services/admin.service.js` - Include organization logo in organizer data
2. `frontend/src/pages/admin/OrganizerManagementPage.jsx` - Display logo in table

**UI Design:**
```
┌──────────────────────────────────────────────────────┐
│ Avatar/Logo │ Name/Email    │ Status  │ Orgs       │
├──────────────────────────────────────────────────────┤
│ [LOGO]      │ John Doe      │ Active  │ 2 orgs     │
│ [28x28]     │ john@email.com│ ●        │ Org A, Org B│
│             │               │          │            │
│ [LOGO]      │ Jane Smith    │ Pending  │ 1 org      │
│ [28x28]     │ jane@email.com│ ○        │ Org C      │
└──────────────────────────────────────────────────────┘
```

**Styling Notes:**
- Logo: 28x28 rounded square (like avatar)
- Position: First column, before name
- Fallback: Show first letter of organization name in colored circle

---

## Implementation Steps

### Step 1: Add banner to voter event lists (Backend)

**Files:**
- `backend/src/services/election.service.js`
- `backend/src/services/pageant.service.js`
- `backend/src/services/polling.service.js`

**Change:** Include `banner` in the select query for voter events

```javascript
// Example: listVoterElectionEvents
.select(`
  has_voted,
  events (
    id,
    title,
    description,
    banner,           // ADD THIS
    voting_enabled,
    status,
    event_type,
    start_date,
    end_date,
    organization_id   // ADD THIS (for later)
  )
`)
```

### Step 2: Add organization data to voter event endpoints (Backend)

**Files:**
- `backend/src/services/election.service.js` - getVoterBallot()
- `backend/src/services/pageant.service.js` - getScoringSheet()
- `backend/src/services/polling.service.js` - getPoll()

**Change:** Join with organizations table to get logo + name

```javascript
// Example: getVoterBallot - add organization data
const event = await getEventById(eventId)

// Get organization data
const { data: org } = await getClient()
  .from(DB_TABLES.ORGANIZATIONS)
  .select('logo, organization_name')
  .eq('id', event.organization_id)
  .single()

return {
  event: {
    ...mapEvent(event),
    organization: org ? { logo: org.logo, name: org.organization_name } : null
  },
  // ... rest of ballot
}
```

### Step 3: Update VoterEventCard (Frontend)

**File:** `frontend/src/components/voter/VoterEventCard.jsx`

**Changes:**
1. Accept `banner` prop from event data
2. Render banner as cover image with gradient overlay
3. Maintain existing layout - don't let banner push content down
4. Add fallback for no banner

### Step 4: Update Voter Event Pages (Frontend)

**Files:**
- `frontend/src/pages/voter/VoterEventPage.jsx`
- `frontend/src/pages/voter/VoterPollPage.jsx`
- `frontend/src/pages/voter/JudgeScoringPage.jsx`

**Changes:**
1. Display banner at top with dark gradient overlay
2. Show organization logo + name below title
3. Keep content below the header area

### Step 5: Update Admin Organizer Management (Frontend)

**File:** `frontend/src/pages/admin/OrganizerManagementPage.jsx`

**Changes:**
1. Add logo column to organizer table
2. Display organization logo (first org's logo) or fallback avatar

---

## Design Guidelines

### Banner Display Rules
1. **Aspect Ratio:** Use `aspect-video` or fixed height (120px for cards, 180px for event pages)
2. **Object Fit:** Always use `object-cover` to prevent stretching
3. **Gradient Overlay:** Add dark gradient for text readability when text overlays banner
4. **Fallback:** If no banner, use event-type-specific gradient background

### Logo Display Rules
1. **Size:** 
   - Event cards: Don't show logo (too cluttered)
   - Event page: 32x32
   - Admin table: 28x28
2. **Shape:** Rounded square (not circle) for organization logos
3. **Fallback:** Show first 2 letters of organization name in colored background

### Priority Order
1. ✅ Event Banner on Voter Dashboard (event cards)
2. ✅ Event Banner + Org Logo on Voter Event Pages
3. ✅ Org Logo on Admin Organizer Management

---

## Summary

| # | Location | Logo Type | Backend Changes | Frontend Changes |
|---|----------|-----------|----------------|------------------|
| 1 | Voter Dashboard → Event Cards | Event Banner | Add banner to event list queries | Update VoterEventCard component |
| 2 | Voter Event Page Header | Event Banner + Org Logo | Add org data to ballot/scoring/poll | Update event page components |
| 3 | Admin Organizer Management | Org Logo | Add org data to admin service | Update organizer table |

---

## Notes
- Focus first on voter-facing pages (Phase 1 & 2) as requested
- Ensure banners don't cover important UI elements (status badges, buttons)
- Always provide fallback UI when logo/banner is missing
- Organization logo on voter side is secondary - voters care about the event
