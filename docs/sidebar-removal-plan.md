# Plan: Remove Sidebar from Voter and Organizer Overview Pages

## Objective

Safely remove sidebars from:
1. **All Voter pages** (`/voter`, `/voter/events/:eventId`, `/voter/polling/events/:eventId`, `/voter/competition/events/:eventId/score`) - no sidebar, but add back arrow to navigate to dashboard
2. **Organizer overview page** (`/organizer`) - no sidebar, but modules (election, competition, polling) still work with their sidebars

## Current State Analysis

### How Sidebar Works

1. **`AppShell.jsx`** - Main layout component that renders the sidebar
   - Contains `<aside className="hidden w-64 shrink-0 bg-v-sidebar p-6 md:block">` for desktop sidebar
   - Contains mobile sidebar in a modal
   - Always shows sidebar unless modified

2. **`DashboardLayout.jsx`** - Wrapper around AppShell
   - Sets up navigation items (Overview, admin items)
   - Uses `AppShell` component for all dashboard pages

3. **Routes in `index.jsx`**

   **Voter Routes (ALL use DashboardLayout):**
   - `/voter` → `DashboardLayout title="Voter"` → shows sidebar with "Overview"
   - `/voter/events/:eventId` → `DashboardLayout title="Vote"` → shows sidebar with "Overview"
   - `/voter/polling/events/:eventId` → `DashboardLayout title="Poll"` → shows sidebar with "Overview"
   - `/voter/competition/events/:eventId/score` → `DashboardLayout title="Judge scoring"` → shows sidebar with "Overview"

   **Organizer Routes:**
   - `/organizer` → `DashboardLayout title="Organizer"` → shows sidebar with "Overview"
   - `/organizer/election` → `ElectionLayout` → shows election sidebar
   - `/organizer/competition` → `PageantLayout` → shows competition sidebar
   - `/organizer/polling` → `PollingLayout` → shows polling sidebar

### What Needs to Change

| Route | Page | Current Behavior | Desired Behavior |
|-------|------|-----------------|------------------|
| `/voter` | VoterDashboardPage | Shows sidebar with "Overview" | **Remove sidebar** |
| `/voter/events/:eventId` | VoterEventPage | Shows sidebar with "Overview" | **Remove sidebar + Add back arrow to dashboard** |
| `/voter/polling/events/:eventId` | VoterPollPage | Shows sidebar with "Overview" | **Remove sidebar + Add back arrow to dashboard** |
| `/voter/competition/events/:eventId/score` | JudgeScoringPage | Shows sidebar with "Overview" | **Remove sidebar + Add back arrow to dashboard** |
| `/organizer` | OrganizerDashboardPage | Shows sidebar with "Overview" | **Remove sidebar** |
| `/organizer/election` | ElectionDashboardPage | Shows election sidebar | Keep sidebar (unchanged) |
| `/organizer/competition` | CompetitionDashboardPage | Shows competition sidebar | Keep sidebar (unchanged) |
| `/organizer/polling` | PollingDashboardPage | Shows polling sidebar | Keep sidebar (unchanged) |

---

## Implementation Plan

### Phase 1: Modify AppShell Component

**File:** `frontend/src/layouts/AppShell.jsx`

**Changes:**
1. Add optional `showSidebar` prop (default: `true`)
2. Add optional `showBackButton` prop (default: `false`)
3. Add optional `backButtonPath` prop (default: `/voter`)
4. Conditionally render desktop sidebar based on `showSidebar` prop
5. Conditionally render back button in header when `showBackButton` is true

```jsx
// Add to props
export default function AppShell({
  title,
  moduleLabel,
  homeLink = '/',
  navItems = [],
  eventId,
  footerLink,
  showSidebar = true,         // NEW PROP
  showBackButton = false,     // NEW PROP
  backButtonPath = '/voter', // NEW PROP
  children,
}) {
  // ... existing code ...

  // In the header section, after the title:
  <div className="min-w-0 flex-1">
    {showBackButton && (
      <Link
        to={backButtonPath}
        className="mb-1 inline-flex items-center gap-1 text-sm text-v-text-subtle hover:text-v-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to dashboard
      </Link>
    )}
    <h1 className="truncate text-base font-semibold text-v-text sm:text-lg">
      {title}
    </h1>
    {moduleLabel && (
      <p className="truncate text-xs text-v-text-subtle">{moduleLabel}</p>
    )}
  </div>

  // ... sidebar section:
  {showSidebar && (
    <aside className="hidden w-64 shrink-0 bg-v-sidebar p-6 md:block">
      <div className="h-full flex flex-col">
        {sidebar}
      </div>
    </aside>
  )}
}
```

Need to import `ChevronLeft` from lucide-react and `Link` from react-router-dom if not already imported.

---

### Phase 2: Modify DashboardLayout Component

**File:** `frontend/src/layouts/DashboardLayout.jsx`

**Changes:**
1. Accept `showSidebar` prop and pass it to AppShell
2. Accept `showBackButton` prop and pass it to AppShell
3. Accept `backButtonPath` prop and pass it to AppShell

```jsx
export default function DashboardLayout({ 
  title = 'Dashboard',
  showSidebar = true,         // NEW PROP
  showBackButton = false,     // NEW PROP
  backButtonPath = '/voter',  // NEW PROP
}) {
  // ... existing code

  return (
    <AppShell
      title={title}
      moduleLabel={role}
      homeLink={home}
      navItems={navItems}
      showSidebar={showSidebar}
      showBackButton={showBackButton}
      backButtonPath={backButtonPath}
    />
  )
}
```

---

### Phase 3: Update Routes

**File:** `frontend/src/routes/index.jsx`

**Changes:**

1. Voter routes - remove sidebar from ALL voter routes, add back button for event pages
2. Organizer route - remove sidebar from `/organizer` only

```jsx
// VOTER ROUTES - ALL NO SIDEBAR
{
  path: '/voter',
  element: (
    <ProtectedRoute allowedRoles={[USER_ROLES.VOTER]}>
      <DashboardLayout title="Voter" showSidebar={false} />
    </ProtectedRoute>
  ),
  children: [{ index: true, element: <VoterDashboardPage /> }],
},
{
  path: '/voter/events/:eventId',
  element: (
    <ProtectedRoute allowedRoles={[USER_ROLES.VOTER]}>
      <DashboardLayout 
        title="Vote" 
        showSidebar={false}
        showBackButton={true}
        backButtonPath="/voter"
      />
    </ProtectedRoute>
  ),
  children: [{ index: true, element: <VoterEventPage /> }],
},
{
  path: '/voter/polling/events/:eventId',
  element: (
    <ProtectedRoute allowedRoles={[USER_ROLES.VOTER]}>
      <DashboardLayout 
        title="Poll" 
        showSidebar={false}
        showBackButton={true}
        backButtonPath="/voter"
      />
    </ProtectedRoute>
  ),
  children: [{ index: true, element: <VoterPollPage /> }],
},
{
  path: '/voter/competition/events/:eventId/score',
  element: (
    <ProtectedRoute allowedRoles={[USER_ROLES.VOTER]}>
      <DashboardLayout 
        title="Judge scoring" 
        showSidebar={false}
        showBackButton={true}
        backButtonPath="/voter"
      />
    </ProtectedRoute>
  ),
  children: [{ index: true, element: <JudgeScoringPage /> }],
},
// Duplicate route removed (lines 268-275 in original file)

// ORGANIZER ROUTES
{
  path: '/organizer',
  element: (
    <ProtectedRoute allowedRoles={[USER_ROLES.ORGANIZER]}>
      <DashboardLayout title="Organizer" showSidebar={false} />
    </ProtectedRoute>
  ),
  children: [{ index: true, element: <OrganizerDashboardPage /> }],
},
// ... organizer modules keep their sidebars via ElectionLayout, PageantLayout, PollingLayout
```

---

### Phase 4: Handle Layout Shift

When sidebar is removed, the main content area will expand to fill the space. This is the desired behavior.

- Some pages use `mx-auto max-w-3xl` which centers content - these will still work fine
- The header stays intact (with title, back button (if applicable), notifications, user menu)
- Content simply uses the full available width

---

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/layouts/AppShell.jsx` | Add `showSidebar`, `showBackButton`, `backButtonPath` props; conditionally render sidebar and back button |
| `frontend/src/layouts/DashboardLayout.jsx` | Accept and pass through the new props |
| `frontend/src/routes/index.jsx` | Set `showSidebar={false}` for voter routes and `/organizer`; add `showBackButton={true}` for voter event pages |

---

## Testing Plan

### Test Scenarios - Voter

1. **Voter Dashboard**
   - [ ] Login as voter
   - [ ] Navigate to `/voter`
   - [ ] Verify NO sidebar is displayed
   - [ ] Verify dashboard content loads correctly (stats, events)
   - [ ] Verify navigation via header (notifications, user menu) works

2. **Voter Event Page**
   - [ ] Navigate to `/voter/events/:eventId`
   - [ ] Verify NO sidebar is displayed
   - [ ] Verify "Back to dashboard" link is visible and works
   - [ ] Verify event voting functionality works

3. **Voter Poll Page**
   - [ ] Navigate to `/voter/polling/events/:eventId`
   - [ ] Verify NO sidebar is displayed
   - [ ] Verify "Back to dashboard" link is visible and works
   - [ ] Verify poll functionality works

4. **Voter Judge Scoring Page**
   - [ ] Navigate to `/voter/competition/events/:eventId/score`
   - [ ] Verify NO sidebar is displayed
   - [ ] Verify "Back to dashboard" link is visible and works
   - [ ] Verify scoring functionality works

### Test Scenarios - Organizer

5. **Organizer Dashboard**
   - [ ] Login as organizer
   - [ ] Navigate to `/organizer`
   - [ ] Verify NO sidebar is displayed
   - [ ] Verify dashboard content loads correctly (stats, modules)
   - [ ] Verify module links work (election, competition, polling)

6. **Organizer Modules**
   - [ ] Navigate to `/organizer/election`
   - [ ] Verify sidebar IS displayed
   - [ ] Verify module functionality works
   - [ ] Repeat for `/organizer/competition` and `/organizer/polling`

---

## Rollback Plan

If issues occur:
1. Revert `showSidebar={false}` changes in routes/index.jsx
2. Revert DashboardLayout.jsx changes
3. Revert AppShell.jsx changes

All changes are isolated to the layout components and routes - no page components need to be modified.

---

## Security & UX Considerations

- Removing sidebar does not affect authentication or authorization
- Header with user menu, notifications, and branding remains functional
- All navigation links in modules remain accessible
- Back button provides clear navigation path back to voter dashboard
- Mobile view behavior: sidebar hidden, hamburger menu can stay for accessibility