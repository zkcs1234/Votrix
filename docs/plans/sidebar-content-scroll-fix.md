# Sidebar Content Scroll Fix Plan

## Overview

This plan describes how to fix the admin/organizer layout so only the page content scrolls, while the sidebar remains fixed in place.

Current problem:

- the sidebar and main content both scroll together in pages that use the `AppShell` layout
- when the page content grows, the sidebar should stay visible and fixed, not be part of the page scroll

Goal:

- keep the sidebar fixed and fully visible on desktop admin/organizer pages
- make only the main content area scroll vertically
- preserve the current sidebar collapse behavior and mobile drawer behavior

## Affected area

Primary layout file:

- `frontend/src/layouts/AppShell.jsx`

Affected user experience:

- admin dashboard pages
- organizer module pages (Election, Competition, Polling)
- any route that uses `AppShell` with `showSidebar=true`

## Implementation details

### Layout strategy

The key is to make the root page wrapper a stable flex container and isolate scrolling to the content panel.

1. Keep the overall page as `min-h-screen`.
2. Render the sidebar as a fixed-height flex column that does not scroll with the page.
3. Render the main page area as a separate flex column with `overflow-hidden`.
4. Make the page content wrapper inside the main area `overflow-auto` so only that section scrolls.

### Proposed structure

In `AppShell.jsx`, the structure should look like:

```jsx
<div className="flex min-h-screen bg-v-bg">
  <aside className="hidden shrink-0 bg-v-sidebar lg:block ...">{sidebar}</aside>

  <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
    <header className="sticky top-0 ...">...</header>
    <main className="flex-1 overflow-auto">...</main>
  </div>
</div>
```

### Notes

- The sidebar should remain outside the `overflow-auto` container.
- The `header` should remain sticky at the top of the content column, not the whole page.
- `main` should become the scroll container for page content.

## Expected file updates

- `frontend/src/layouts/AppShell.jsx`
  - add `overflow-hidden` to the main content wrapper
  - add `flex-1 overflow-auto` to the page content wrapper
  - preserve mobile drawer opening behavior for `lg:hidden`

Optional enhancement:

- if the sidebar currently has a shadow or background styling, confirm that it remains visible while the content scrolls.

## Verification

1. Open an admin page with long content (for example `AdminDashboardPage` or `OrganizerManagementPage`).
2. Confirm the sidebar does not scroll away when the page is scrolled.
3. Confirm the top header remains visible in the content column when scrolling.
4. Confirm the mobile drawer behavior is unchanged when viewing on smaller screens.

## Rollback

If the new layout causes regressions:

- restore the `AppShell` page wrapper structure to the previous `flex` layout without isolating `main` overflow
- remove the added `overflow-hidden` and `overflow-auto` classes from the content section
