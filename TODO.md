# Implementation TODO

## Issue 1 — Fix Participant Information Form Save (DONE ✅)

- [x] `frontend/src/components/organizer/ParticipantInformationFormBuilder.jsx` — add internal `saving` state; make Save button always clickable (only disabled while saving); reorder hooks to fix `useEffect` dependency issue.

## Issue 2 — Stage Footer + Stepper on All Module Pages & Persistent Checks (DONE ✅)

- [x] Create `frontend/src/hooks/useEventProgress.js` — new hook for per-event completion tracking (localStorage).
- [x] Update `frontend/src/utils/eventStages.js` — add `stageKeyFromPath(module, pathname)` helper.
- [x] Update `frontend/src/components/ui/EventStepper.jsx` — support `completedKeys` prop.
- [x] Create `frontend/src/components/ui/ModuleStageLayout.jsx` — wrapper component.
- [x] Update `frontend/src/layouts/ElectionLayout.jsx` — render stepper + footer for non-form pages.
- [x] Update `frontend/src/layouts/PageantLayout.jsx` — render stepper + footer for non-form pages.
- [x] Update `frontend/src/layouts/PollingLayout.jsx` — render stepper + footer for non-form pages.
- [x] Event form pages — seed branding/information-form completion from loaded event data.

## Issue 3 — Admin "Create organizer" → "Add organizer" (DONE ✅)

- [x] `frontend/src/pages/admin/AdminDashboardPage.jsx` — text change.
- [x] `frontend/src/pages/admin/OrganizerManagementPage.jsx` — text change.
- [x] `frontend/src/components/admin/CreateOrganizerModal.jsx` — heading text change.

## Issue 4 — Organizer Profile Edit via Profile Card (DONE ✅)

- [x] `frontend/src/utils/organizerProfile.js` — new shared schema + options file.
- [x] `frontend/src/components/organizer/ProfileCard.jsx` — inline edit mode (no navigation to onboarding).

## Follow-up

- [ ] Run frontend lint (`cd frontend && npm run lint`).
- [ ] Run frontend build (`cd frontend && npm run build`).
- [ ] Manual QA of all 4 issues.
