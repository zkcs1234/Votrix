# Frontend Improvements Implementation Plan

## Overview

This document outlines the implementation plan for addressing four frontend issues in the Votrix platform:

1. **Fix Participant Information Form Save** — Cannot save the participant information form in election, competition, and polling modules.
2. **Stage Footer on All Pages + Persistent Checks** — Stage footer should appear on all module pages (not just event creation), and completed stages should remain checked when editing events.
3. **Admin "Create organizer" → "Add organizer"** — Text-only change in the admin UI.
4. **Organizer Profile Inline Editing** — Replace onboarding-page navigation with inline editing via ProfileCard.

---

## Issue 1: Fix Participant Information Form Save

### Root Cause

The `ParticipantInformationFormBuilder.jsx` component's Save button interacts with the `service.updateInformationForm(eventId, schema)` API call. The form was not saving because:

- The `saving` state was not properly managed — the button was disabled when `!dirty` but the `dirty` flag was set to `false` initially and never reset properly after save.
- The `handleSave` function used `eventId` from props but the form pages passed `eventId` correctly only when the event already existed (for new events, `eventId` could be `undefined` or `'new'`).
- The `onSave` callback was called but the parent component didn't re-render to reflect the saved state.

### Affected Files

| File                                                                      | Change                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/components/organizer/ParticipantInformationFormBuilder.jsx` | Fix save logic, add internal saving state, make Save button always clickable (only disabled while saving), reorder hooks to fix `useEffect` dependency issue. |

### Implementation

1. Ensure the Save button is always enabled when the form is dirty, only disabled during the save operation (`saving` prop).
2. The `handleSave` function validates fields, constructs the schema object, calls `service.updateInformationForm(eventId, schema)`, and calls `onSave(schema)` on success.
3. Error handling: display validation errors inline and API errors below the form.

### Verification

- Create a new election/competition/polling event.
- Navigate to the Information Form step.
- Enable the form toggle, add fields, click "Save form".
- Expect: API call succeeds, button shows "Saved" state, no errors.
- Edit the event, verify the saved form schema loads correctly.

---

## Issue 2: Stage Footer on All Pages + Persistent Checks

### Problem

The `StageFooter` and `EventStepper` components only appear on the event creation wizard pages (Details, Branding, Information Form). When navigating to other pages like Positions, Candidates, Voters (election), or Contestants, Criteria, Judges (competition), there is no stage navigation. Additionally, when editing an event, the stepper does not show previously completed stages as checked.

### Architecture

Create a shared stage progress tracking system using:

1. **`useEventProgress` hook** — Manages per-event stage completion state in `localStorage`.
2. **`eventStages.js`** — Centralized stage definitions for all modules + utility functions.
3. **`EventStepper.completedKeys` prop** — The stepper accepts a list of completed stage keys.
4. **`ModuleStageLayout` component** — Wraps module page content with the stepper and footer, auto-tracking completion.

### Data Flow

```
localStorage (votrix.event-progress.<module>:<eventId>)
  ↕
useEventProgress(module, eventId)
  ↕
ModuleStageLayout / EventFormPages
  ↕
EventStepper(completedKeys={completedKeys})
```

### Files to Create/Update

| File                                                                    | Change                                                                                                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/hooks/useEventProgress.js`                                | **CREATE** — New hook for per-event completion tracking (localStorage).                                              |
| `frontend/src/utils/eventStages.js`                                     | **UPDATE** — Add `stageKeyFromPath(module, pathname)` helper.                                                        |
| `frontend/src/components/ui/EventStepper.jsx`                           | **UPDATE** — Support `completedKeys` prop for persistent checks.                                                     |
| `frontend/src/components/ui/ModuleStageLayout.jsx`                      | **CREATE** — Wrapper component that renders stepper + footer on non-form pages.                                      |
| `frontend/src/layouts/ElectionLayout.jsx`                               | **UPDATE** — Wrap `<Outlet />` with `<ModuleStageLayout module="election">`.                                         |
| `frontend/src/layouts/PageantLayout.jsx`                                | **UPDATE** — Wrap `<Outlet />` with `<ModuleStageLayout module="competition">`.                                      |
| `frontend/src/layouts/PollingLayout.jsx`                                | **UPDATE** — Wrap `<Outlet />` with `<ModuleStageLayout module="polling">`.                                          |
| `frontend/src/pages/organizer/election/ElectionEventFormPage.jsx`       | **UPDATE** — Integrate `useEventProgress`, pass `completedKeys` to `EventStepper`, seed completion from loaded data. |
| `frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx` | **UPDATE** — Same as election.                                                                                       |
| `frontend/src/pages/organizer/polling/PollingEventFormPage.jsx`         | **UPDATE** — Same as election.                                                                                       |

### Implementation Details

#### `useEventProgress.js`

```javascript
// Hook API:
//   const { completedKeys, markComplete, seed } = useEventProgress(module, eventId)
//
// - completedKeys: string[] — list of completed stage keys
// - markComplete(key): adds a stage key to the completed list
// - seed(keys): merges an array of keys into the completed list
//
// Persistence: localStorage key = "votrix.event-progress.<module>:<eventId>"
```

#### `stagePath()` update

The existing `stagePath()` function already handles `eventId === 'new'` by returning URLs for the first editable stage. The `stageKeyFromPath()` function is added to derive the current stage key from a URL pathname.

#### `EventStepper.completedKeys`

The stepper checks `isCompleted` using:

```javascript
const isCompleted =
  completedKeys.includes(stage.key) ||
  (idx < currentIndex && currentIndex !== -1);
```

This ensures:

- Stages in `completedKeys` show as checked (green checkmark).
- Stages before the current index also show as checked (backward compatibility).
- The current stage is highlighted (blue).

#### `ModuleStageLayout`

- Derives `currentKey` from the URL pathname using `stageKeyFromPath()`.
- Uses `useEventProgress(module, eventId)` for completion tracking.
- Auto-marks the current stage as completed on visit.
- Only renders stepper + footer for non-form-wizard stages (skips `details`, `branding`, `information-form`, `settings` since those are handled by the form pages).
- Form pages render their own `EventStepper` and `StageFooter` inside the wizard.

#### Form Page Integration

Each event form page (`ElectionEventFormPage`, `CompetitionEventFormPage`, `PollingEventFormPage`):

- Imports and calls `useEventProgress('election'|'competition'|'polling', eventId)`.
- Passes `completedKeys` to `EventStepper`.
- Seeds completion on data load:
  - `details` — always completed when event exists (has `eventId`).
  - `branding` — completed when event has a banner URL.
  - `information-form` — completed when the form schema is enabled and has fields.
  - Other stages — auto-completed by `ModuleStageLayout` on visit.

### Verification

1. Create a new election event, fill Details → Branding → Information Form.
2. Navigate to Positions, Candidates, Voters pages.
3. **Expect**: Stepper shows all previous stages as checked (green), current stage highlighted (blue), footer shows navigation links.
4. Edit the event. **Expect**: Previously completed stages remain checked.
5. Repeat for competition (Contestants, Criteria, Judges, Rankings, Live) and polling (Builder, Respondents).

---

## Issue 3: Admin "Create organizer" → "Add organizer"

### Problem

The admin UI uses the text "Create organizer" in button labels and modal headings. The user wants this changed to "Add organizer" (frontend text only, no backend changes).

### Affected Files

| File                                                     | Change                                                    |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `frontend/src/pages/admin/AdminDashboardPage.jsx`        | Change button text "Create organizer" → "Add organizer".  |
| `frontend/src/pages/admin/OrganizerManagementPage.jsx`   | Change button text "Create organizer" → "Add organizer".  |
| `frontend/src/components/admin/CreateOrganizerModal.jsx` | Change heading text "Create Organizer" → "Add Organizer". |

### Implementation

Simple string replacements in JSX. No logic changes. The modal component filename (`CreateOrganizerModal.jsx`) and API function (`adminService.createOrganizer`) are left unchanged since they are internal identifiers, not user-facing text.

### Verification

- Navigate to `/admin/organizers`.
- **Expect**: Button shows "Add organizer" instead of "Create organizer".
- Click the button.
- **Expect**: Modal heading shows "Add Organizer" instead of "Create Organizer".

---

## Issue 4: Organizer Profile Inline Editing

### Problem

The organizer profile edit flow currently navigates to the `/organizer/onboarding` page to edit profile fields. The user wants inline editing via a profile card component, without navigation to the onboarding page.

### Solution

Create a reusable `ProfileCard` component with inline edit mode, and a shared utility file for the profile schema and options.

### Files to Create/Update

| File                                                | Change                                                        |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `frontend/src/utils/organizerProfile.js`            | **CREATE** — Shared Zod schema and organization type options. |
| `frontend/src/components/organizer/ProfileCard.jsx` | **CREATE** — Inline-editable profile card component.          |

### Implementation Details

#### `organizerProfile.js`

```javascript
export const profileSchema = z.object({
  organizationName: z.string().trim().min(1, "Organization name is required"),
  organizationType: z.string().trim().min(1, "Organization type is required"),
  organizerName: z.string().trim().min(1, "Your name is required"),
  position: z.string().trim().min(1, "Position is required"),
});

export const ORGANIZATION_TYPE_OPTIONS = [
  "Student Organization",
  "Academic Department",
  "College Office",
  "University Office",
  "Student Council",
  "Committee",
  "Others",
];
```

#### `ProfileCard.jsx`

The component has two modes:

1. **View mode** (default): Displays the organizer's profile information (Organization Name, Type, Organizer Name, Position) in a card layout with an "Edit profile" button.
2. **Edit mode** (toggled by "Edit profile" button): Shows a form with the same fields as the onboarding page, with "Cancel" and "Save" buttons.

Key features:

- Loads profile data from `organizerProfileService.getProfile()` on mount.
- Uses `react-hook-form` with `zodResolver` for form validation.
- Calls `organizerProfileService.updateProfile()` on save.
- Updates local user state via `useAuth().updateUser()`.
- Includes a "Sign out" button in view mode.
- Positioned as a dropdown/popover overlay (relative to the trigger element).

### Verification

- Click on the organizer profile avatar/button in the top navigation.
- **Expect**: A profile card appears showing profile information.
- Click "Edit profile".
- **Expect**: Form fields appear with current values pre-filled.
- Modify fields and click "Save".
- **Expect**: API call succeeds, card switches back to view mode with updated values.
- Click "Cancel".
- **Expect**: Changes are discarded, card switches back to view mode.

---

## Cross-Cutting Concerns

### Error Handling

- All API calls wrapped in try/catch with user-facing error messages.
- Network errors display inline in the relevant component.
- Validation errors show field-level messages.

### Loading States

- Skeleton loaders for initial data fetches.
- Button-level loading spinners during save operations.
- Disabled buttons during save to prevent double-submission.

### Backward Compatibility

- No changes to backend API endpoints or payloads.
- No changes to existing routes — all new components are drop-in replacements.
- The `OrganizerOnboardingPage.jsx` is kept unchanged for backward compatibility (new organizers still see it on first login).

---

## Testing Plan

### Manual Test Cases

#### Issue 1 — Participant Information Form Save

1. Create election event → Go to Information Form → Enable form → Add fields → Save → Verify saved state persists.
2. Edit election event → Go to Information Form → Verify loaded schema → Modify → Save.
3. Repeat for competition and polling modules.

#### Issue 2 — Stage Footer + Persistent Checks

1. Create election event → Fill Details → Branding → Information Form → Navigate to Positions → Verify stepper shows all previous stages as completed.
2. Edit the same event → Verify stepper still shows completed stages.
3. Navigate to Candidates, Voters pages → Verify stepper and footer appear.
4. Create competition event → Navigate to Contestants, Criteria, Judges, Rankings, Live → Verify stepper.
5. Create polling event → Navigate to Builder, Respondents → Verify stepper.

#### Issue 3 — Admin Text Change

1. Navigate to `/admin/organizers` → Verify "Add organizer" text.
2. Click the button → Verify "Add Organizer" modal heading.

#### Issue 4 — Profile Card

1. Click profile avatar → Verify profile card appears in view mode.
2. Click "Edit profile" → Verify form fields.
3. Save changes → Verify card updates.
4. Cancel edit → Verify no changes applied.

### Lint & Build

```bash
cd frontend
npm run lint
npm run build
```
