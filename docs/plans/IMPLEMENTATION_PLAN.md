# VOTRIX Frontend Improvements - Implementation Plan

## Overview

This document outlines the implementation plan for four key frontend improvements across the Votrix platform:

1. **Fix "Save & Continue" in Event Forms** — Fix StageFooter broken button logic across Election, Competition, and Polling modules
2. **Persistent Stage Footer & Completion Tracking** — Show stage footer on all module pages (not just event creation) and persist checked stages when editing events
3. **Admin "Create Organizer" → "Add Organizer"** — Text change only (no backend changes)
4. **Organizer Profile Inline Editing** — Replace onboarding workflow with editable profile card

---

## Issue 1: Fix "Save & Continue" in Event Forms

### Root Causes

Three independent bugs broke the "Save & continue" button in `StageFooter`:

1. **Bug 1 — StageFooter next-button render logic (StageFooter.jsx)**: The `onNext` callback was not being wired correctly. When `onNext` is provided, the button renders but doesn't trigger form submission because `Button` defaults to `type="button"` and the handlers weren't passed.

2. **Bug 2 — Missing `onNext` prop on Branding step (Election & Competition form pages)**: The Branding step's `StageFooter` was missing `onNext={handleNextBranding}`, so clicking "Save & continue" did nothing.

3. **Bug 3 — `nextHref` computed incorrectly for `eventId === 'new'`**: `stagePath()` returned `${base}/new` for any `eventId === 'new'`, regardless of stage key.

### Fix

- **StageFooter.jsx**: Rewrote next-button ternary to properly handle `onNext` vs `<Link>`
- **ElectionEventFormPage.jsx**: Added `onNext={handleNextBranding}` to Branding step's `StageFooter`
- **CompetitionEventFormPage.jsx**: Added `onNext={handleNextBranding}` to Branding step's `StageFooter`
- **eventStages.js**: Improved `stagePath()` to return meaningful URLs for new events

---

## Issue 2: Stage Footer on All Pages + Persistent Completion

### Architecture

Created a shared system for stage navigation across all module pages:

### New Files

| File                                               | Purpose                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `frontend/src/utils/eventStages.js`                | Shared stage definitions for election, competition, polling modules |
| `frontend/src/components/ui/ModuleStageLayout.jsx` | Wrapper that renders stepper + footer on non-wizard module pages    |
| `frontend/src/hooks/useEventProgress.js`           | `localStorage`-backed hook that tracks visited/completed stages     |

### Updated Files

| File                           | Changes                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `EventStepper.jsx`             | Added `completedKeys` prop to support persistent checked stages                                                                |
| `ElectionLayout.jsx`           | Wrapped `<Outlet />` with `<ModuleStageLayout module="election">`                                                              |
| `PageantLayout.jsx`            | Wrapped `<Outlet />` with `<ModuleStageLayout module="competition">`                                                           |
| `PollingLayout.jsx`            | Wrapped `<Outlet />` with `<ModuleStageLayout module="polling">`                                                               |
| `ElectionEventFormPage.jsx`    | Integrated `useEventProgress`, seeds `details`/`branding`/`information-form` on load, passes `completedKeys` to `EventStepper` |
| `CompetitionEventFormPage.jsx` | Same integration as Election                                                                                                   |
| `PollingEventFormPage.jsx`     | Same integration as Election                                                                                                   |

### How It Works

1. `useEventProgress` stores completed stage keys in `localStorage` keyed by `module:eventId`
2. `EventStepper` uses `completedKeys` to determine which stages show a green checkmark
3. `ModuleStageLayout` wraps module layout pages (events list, contestants, voters, analytics, etc.) with the stepper + footer
4. Wizard form pages (details/branding/information-form) render their own stepper with `completedKeys` passed in
5. On edit, `markComplete('details')` and `markComplete('branding')` are called when data loads, ensuring stages remain checked
6. Information form data loads trigger `markComplete('information-form')` if the form has enabled fields

---

## Issue 3: Admin "Create Organizer" → "Add Organizer"

### Changes (Frontend-only, no backend changes)

| File                                                     | Change                                              |
| -------------------------------------------------------- | --------------------------------------------------- |
| `frontend/src/pages/admin/OrganizerManagementPage.jsx`   | Button text: `Create organizer` → `Add organizer`   |
| `frontend/src/pages/admin/AdminDashboardPage.jsx`        | Button text: `Create organizer` → `Add organizer`   |
| `frontend/src/components/admin/CreateOrganizerModal.jsx` | Modal heading: `Create Organizer` → `Add Organizer` |

---

## Issue 4: Organizer Profile Inline Editing

### New Files

| File                                                | Purpose                                                 |
| --------------------------------------------------- | ------------------------------------------------------- |
| `frontend/src/utils/organizerProfile.js`            | Shared profile schema, field config, and default values |
| `frontend/src/components/organizer/ProfileCard.jsx` | Editable profile card component with inline editing     |

### Updated Files

| File                          | Changes                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `OrganizerOnboardingPage.jsx` | Updated to use shared `organizerProfile` utilities and `ProfileCard` for editing |

### How It Works

1. `ProfileCard.jsx` renders an editable card with fields: organization name, organization type, organizer name, position
2. Uses `useForm` with `zodResolver` for validation
3. Calls `organizerProfileService.updateProfile()` on save
4. Shows success/error feedback via toast notifications
5. `OrganizerOnboardingPage.jsx` uses the same shared schema/utilities for consistency

---

## Verification Checklist

### Issue 1 — Save & Continue

- [ ] Election: Create new event, click "Save & continue" from Branding → event created, navigated to `/form`
- [ ] Election: Edit existing event, change banner, click "Next: Information Form" → banner uploaded, navigated to `/form`
- [ ] Competition: Same flow as Election
- [ ] Polling: Same flow (already had `onNext`, now reliably works)

### Issue 2 — Stage Footer + Persistent Checks

- [ ] Election events list page shows stepper at top with stage footer
- [ ] Competition contestants/criteria/judges pages show stepper
- [ ] Polling respondents/analytics pages show stepper
- [ ] Edit an election event → "Details" and "Branding" stages show as checked (green)
- [ ] Edit a competition event → "Details" shows checked, "Branding" shows checked if banner exists
- [ ] Edit a polling event → "Details" shows checked, "Branding" shows checked if banner exists

### Issue 3 — Admin Text

- [ ] Admin Dashboard: "Add organizer" button shown
- [ ] Organizer Management page: "Add organizer" button shown
- [ ] Create Organizer Modal: "Add Organizer" heading shown

### Issue 4 — Profile Editing

- [ ] Organizer can view/edit their profile inline via ProfileCard
- [ ] Changes persist after save

---

## Files Modified

### New Files (6)

1. `frontend/src/utils/eventStages.js`
2. `frontend/src/components/ui/ModuleStageLayout.jsx`
3. `frontend/src/hooks/useEventProgress.js`
4. `frontend/src/utils/organizerProfile.js`
5. `frontend/src/components/organizer/ProfileCard.jsx`
6. `docs/plans/IMPLEMENTATION_PLAN.md`

### Modified Files (12)

1. `frontend/src/components/ui/StageFooter.jsx`
2. `frontend/src/components/ui/EventStepper.jsx`
3. `frontend/src/layouts/ElectionLayout.jsx`
4. `frontend/src/layouts/PageantLayout.jsx`
5. `frontend/src/layouts/PollingLayout.jsx`
6. `frontend/src/pages/organizer/election/ElectionEventFormPage.jsx`
7. `frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx`
8. `frontend/src/pages/organizer/polling/PollingEventFormPage.jsx`
9. `frontend/src/pages/admin/OrganizerManagementPage.jsx`
10. `frontend/src/pages/admin/AdminDashboardPage.jsx`
11. `frontend/src/components/admin/CreateOrganizerModal.jsx`
12. `frontend/src/pages/organizer/OrganizerOnboardingPage.jsx`
