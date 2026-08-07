# Form Session Lifecycle — Implementation TODO

## Plan: `docs/plans/create-edit-event-lifecycle-draft-management.md`

- [x] Phase 0: Analyze module form pages & routes
- [x] Phase 1: Create shared `useFormSession` hook + `useDraft` hook + `UnsavedChangesDialog` component
- [x] Phase 2: Integrate `useFormSession` + session-boundary cleanup into module form pages
  - [x] `ElectionEventFormPage.jsx`
  - [x] `CompetitionEventFormPage.jsx`
  - [x] `PollingEventFormPage.jsx` (also removed unused `HELPER_TEXT`/`endDateValue`)
  - [x] Each page resets form values, banner/uploads, info-form schema, errors, and event progress (`resetProgress()`) on session change
- [ ] Phase 3: Wire draft autosave + unsaved-changes guard into stepper/stage navigation
  - [ ] Add "unfinished draft" banner/modal on the events list
  - [ ] Add Resume / Start New / Delete Draft flow
  - [ ] Add Save as Draft / Discard / Cancel flow on leaving a dirty Create session
- [ ] Phase 4: Verify (lint/tests/build)
