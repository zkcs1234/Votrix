# VOTRIX Create/Edit Event Lifecycle & Draft Management Refactoring

## 1. Root Cause Analysis

### 1.1 Where Create/Edit state is currently stored

Each module uses a **single, monolithic page component** that handles both Create and Edit modes:

| Module      | Component                      | Routes served                                                                                         |
| ----------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Election    | `ElectionEventFormPage.jsx`    | `/events/new`, `/events/:id/edit`, `/events/:id/branding`, `/events/:id/form`                         |
| Competition | `CompetitionEventFormPage.jsx` | `/events/new`, `/events/:id/edit`, `/events/:id/branding`, `/events/:id/form`                         |
| Polling     | `PollingEventFormPage.jsx`     | `/events/new`, `/events/:id/edit`, `/events/:id/branding`, `/events/:id/settings`, `/events/:id/form` |

The Create/Edit distinction is made by a single boolean: `const isNew = !eventId || eventId === 'new'`.

All form state is **component-local** (`useState` + `useForm` from `react-hook-form`). There is **no global store** (no Zustand/Redux/Context) for form sessions.

### 1.2 Whether state is shared between pages

**No explicit sharing** — but the _same component instance_ is reused across routes. Because React Router maps multiple URL patterns to the same `element` (`<PollingEventFormPage />`), navigating between `/new` and `/edit` does **not** unmount/remount the component. Only the `useParams`/`useLocation` values change.

### 1.3 Whether forms remain mounted after navigation

**Yes.** The form component stays mounted when navigating between the Create/Edit sub-routes of the same module. When the user leaves the module entirely (e.g., to the events list), the component unmounts — but **there is no cleanup logic** that resets `useForm` or `useState`. The unmount discards memory but does not clear the persisted `useEventProgress` (localStorage) or guarantee a clean re-init on next mount.

### 1.4 Whether routing reuses component instances

**Confirmed.** In `frontend/src/routes/index.jsx`, all event sub-routes for a module point to the **same lazy component**:

```jsx
// Polling
{ path: 'events/new', element: <PollingEventFormPage /> },
{ path: 'events/:eventId/edit', element: <PollingEventFormPage /> },
{ path: 'events/:eventId/branding', element: <PollingEventFormPage /> },
{ path: 'events/:eventId/settings', element: <PollingEventFormPage /> },
{ path: 'events/:eventId/form', element: <PollingEventFormPage /> },
```

React Router reuses the mounted component when only the URL params change. The `step` state is derived from `location.pathname`, but **other state (`bannerFile`, `infoFormSchema`, `useForm` values/errors, `banner`) is not reset** when `eventId` changes.

### 1.5 Whether form state is global instead of scoped

Form state is **scoped to the component instance** (good), but because the instance is reused across sessions, the scoping does **not** translate to per-session isolation. The `useEventProgress` hook, however, **is global** (persisted to `localStorage`).

### 1.6 Whether cleanup occurs when components unmount

**No cleanup exists.** There is no `useEffect` cleanup that resets form values, validation errors, current step, temporary uploads (`bannerFile`), or selections. On unmount, React discards the in-memory state, but:

- `useEventProgress` completed keys remain in `localStorage` and are re-loaded on next mount.
- On remount, `useForm` re-initializes from `defaultValues`, but if the previous session was an Edit and the new session is a Create, the `defaultValues` are empty — so the leak is more subtle: stale `completedKeys`, stale `banner` in some flows, and validation state carried by the shared `reset()` lifecycle.

### 1.7 Whether draft functionality already partially exists

**No draft functionality exists.** The only persistence mechanism is `useEventProgress` (completed step keys only — not values). There is no draft storage, no "resume draft" flow, and no "unsaved changes" detection.

### 1.8 The concrete failure scenario

1. Organizer opens **Create** (`/new`), fills Details, Branding, etc. `useForm` holds values; `bannerFile` holds an uploaded file; `markComplete` writes keys to `localStorage`.
2. Organizer **leaves without publishing** (navigates to the events list). Component unmounts. In-memory state is discarded, but `useEventProgress` for `module:"new"` was never written (it early-returns for `'new'`), while any steps visited leave **no** persisted trace — except for the in-memory instance which is now gone.
3. Organizer opens **Edit** (`/events/:id/edit`). The component mounts fresh — but because the same route element is reused and the `useEventProgress` hook loads persisted keys, and because `reset()` is only called inside the async `getEvent` load, there is a window where **stale step/validation/banner state can render** before the load resolves. If the user navigates quickly between Create and Edit _without_ unmounting (e.g., via the stepper or sidebar which links to `/new` vs `/edit`), the stale in-memory state leaks directly.

Additional leak vector: navigating from `/events/:idA/edit` to `/events/:idB/edit` (two different existing events) without unmount — `banner`, `infoFormSchema`, and validation state from event A persist until async load for B resolves.

---

## 2. Current Workflow Diagram

```
                    ┌──────────────────────────────────────────────┐
                    │        Module EventFormPage (shared)         │
                    │                                              │
  /events/new ─────►│  isNew = true  (Create Session)             │
                    │  useForm defaultValues (empty)              │
                    │  step = details                             │
                    │  banner = null, bannerFile = null           │
                    │  useEventProgress(module, 'new') → []       │
                    └───────────────┬──────────────────────────────┘
                                    │ navigate (reuse instance!)
                    ┌───────────────▼──────────────────────────────┐
  /events/:id/edit ─►│  isNew = false (Edit Session)              │
                    │  useForm STILL HAS PREVIOUS VALUES           │
                    │  banner/bannerFile NOT CLEARED               │
                    │  step = derived from path                    │
                    │  async getEvent() → reset() (eventually)     │
                    │  useEventProgress(module, id) → loads        │
                    │    PERSISTED keys from any prior session     │
                    └──────────────────────────────────────────────┘
                          ▲
                          │  ✗ NO cleanup between sessions
                          │  ✗ NO draft system
                          │  ✗ STALE state leaks (step, values,
                          │     validation, banner, progress)
```

### Problems highlighted by the diagram

- Single component, dual purpose → no explicit session boundary.
- React Router reuses the instance → no unmount-based cleanup.
- Async `reset()` creates a render window where stale state is visible.
- `useEventProgress` persists globally and can carry progress across events/sessions.
- No draft persistence → unfinished Create work is silently lost AND can collide with Edit.

---

## 3. Proposed Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EventFormPage (session-aware)                    │
│                                                                         │
│  Determine session mode from eventId:                                   │
│    • no eventId / 'new'  → Create Session                               │
│    • has eventId         → Edit Session                                 │
│                                                                         │
│  On every session change (mode or eventId):                             │
│     1. END   current session (persist draft if Create + dirty)          │
│     2. CLEAR all local form state (values, errors, step, uploads)       │
│     3. INIT  a fresh session                                            │
│     4. LOAD  event data (Edit only) via getEvent()                      │
│     5. RENDER form                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Create Session flow

```
[Open Create] ──► [Check for existing draft for module]
                     │
                     ├─ Draft exists ──► "You have an unfinished draft."
                     │                     [Resume Draft] [Start New] [Delete Draft]
                     │                       │            │              │
                     │                       │            │         delete/archive
                     │                       │            │              │
                     │                       ▼            ▼              ▼
                     │                   load draft   fresh Create   fresh Create
                     │
                     ▼
              [Render Create form]
                     │
              [User leaves before publishing]
                     │
                     ├─ Detect unsaved changes
                     ├─ Prompt: [Save as Draft] [Discard] [Cancel]
                     │     │              │        │
                     │     ▼              ▼        │
                     │  persist draft   discard    └── stay on form
                     │  (step, values, assets)
                     │
                     ▼
              [Return to Event List]
```

### Edit Session flow

```
[Open Edit] ──► [END any Create session]      ← never load a draft
               [CLEAR all temporary state]
               [LOAD only the selected event]
               [Initialize fresh Edit session]
                     │
                     ▼
              [Render Edit form with event data]
```

### Invariants enforced

- Only **one** session type exists at any time: `None`, `Create`, or `Edit`.
- Create and Edit can **never** be active simultaneously.
- Drafts **never** merge with existing events.
- Switching modes always runs the full **End → Clear → Init → Load → Render** sequence.

---

## 4. Session Lifecycle Design

### 4.1 Session type

```js
type FormSession =
  | { type: 'none' }
  | { type: 'create'; module: ModuleKey }
  | { type: 'edit'; module: ModuleKey; eventId: string }
```

### 4.2 Lifecycle states

A session passes through these states:

```
INITIALIZING → READY → DIRTY → (SAVING | NAVIGATING) → ENDED
                                            │
                                            ▼
                                        CLEARED
```

### 4.3 Required transitions

| Transition         | Action                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `Init Session`     | Create empty form state; set `step` from path; mark `INITIALIZING`.                                |
| `Load Data (Edit)` | `getEvent(eventId)` → `reset(values)`; load info-form schema; mark `READY`.                        |
| `User edits`       | Mark `DIRTY`; track banner file; record current step.                                              |
| `Save`             | `createEvent`/`updateEvent`; clear dirty; mark `READY`.                                            |
| `End Session`      | If Create + DIRTY → persist draft (per user choice). Then clear all state. Mark `ENDED → CLEARED`. |
| `Switch mode`      | `END` current → `CLEAR` → `INIT` new → (Edit: `LOAD`) → `RENDER`.                                  |

### 4.4 Cleanup primitive (shared)

A single `resetFormSession()` helper must clear:

- Form values (`reset(EMPTY_VALUES)`)
- Validation errors (`clearErrors()`)
- Current step (`setStep(defaultStep)`)
- Temporary uploads (`setBannerFile(null)`, revoke object URLs)
- Temporary selections (`infoFormSchema`, `banner`)
- Cached local state (any memoized derived values)
- In-memory `useEventProgress` (reset to `[]` for the session)

---

## 5. Draft Lifecycle Design

### 5.1 Draft data model

```js
// Persisted per module + organizer (localStorage or backend):
{
  module: 'election' | 'competition' | 'polling',
  step: string,                 // last visited step key
  values: { title, description, startDate, endDate, ... },
  banner: string | null,        // uploaded asset URL
  updatedAt: ISO timestamp,
}
```

### 5.2 Create: leaving before publishing

On navigation away (before `createEvent` succeeds):

1. **Detect** unsaved changes (`isDirty` from `useForm` OR `bannerFile != null`).
2. **Prompt** the organizer:
   - **Save as Draft** → persist `{ module, step, values, banner, updatedAt }`; navigate away.
   - **Discard Changes** → clear session, delete any existing draft, navigate away.
   - **Cancel Navigation** → stay on the form.

3. For **Save as Draft**, also persist any uploaded assets (banner) so they can be restored.

### 5.3 Create: opening again

On opening `/new`:

- If a draft exists for the module, show:

  > "You have an unfinished draft."
  >
  > [Resume Draft] [Start New Event] [Delete Draft]

- **Resume Draft** → load draft values into the form, restore step + banner, mark `READY`.
- **Start New Event** → delete/archive the draft per system rules, initialize a completely fresh Create session.
- **Delete Draft** → remove the draft, stay on fresh Create.

### 5.4 Edit: never touches drafts

- Entering Edit **always**:
  1. Ends any Create session (persisting or discarding a draft per explicit user choice — never silently).
  2. Clears all temporary state.
  3. **Does not load any draft.**
  4. Loads only the selected event.
  5. Initializes a fresh Edit session.

---

## 6. Components / Services Requiring Modification

### Frontend

| File                                                                             | Change                                                                                                             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `frontend/src/hooks/useEventProgress.js`                                         | Add a `reset()`/`clear()` method; scope progress strictly to the session's eventId; avoid leaking across sessions. |
| `frontend/src/pages/organizer/election/ElectionEventFormPage.jsx`                | Refactor to session lifecycle; add cleanup on unmount + eventId change; add draft detection/prompt.                |
| `frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx`          | Same refactor.                                                                                                     |
| `frontend/src/pages/organizer/polling/PollingEventFormPage.jsx`                  | Same refactor.                                                                                                     |
| `frontend/src/pages/organizer/election/ElectionEventsPage.jsx`                   | Add draft banner / "resume draft" if a draft exists for the module.                                                |
| `frontend/src/pages/organizer/competition/CompetitionEventsPage.jsx`             | Same.                                                                                                              |
| `frontend/src/pages/organizer/polling/PollingEventsPage.jsx`                     | Same.                                                                                                              |
| `frontend/src/components/ui/EventStepper.jsx`                                    | Ensure it reflects per-session completed keys only (no cross-event progress).                                      |
| `frontend/src/components/ui/StageFooter.jsx`                                     | Wire navigation confirmation (intercept leaving a dirty Create session).                                           |
| `frontend/src/components/ui/ModuleStageLayout.jsx` _(if used for sidebar jumps)_ | Ensure sidebar navigation also triggers session end/cleanup.                                                       |
| `frontend/src/hooks/useDraft.js` _(new)_                                         | Central draft persistence, detection, resume/discard/delete logic.                                                 |
| `frontend/src/hooks/useFormSession.js` _(new)_                                   | Central session lifecycle (`INIT → CLEAR → LOAD → RENDER → END`).                                                  |
| `frontend/src/components/ui/UnsavedChangesDialog.jsx` _(new)_                    | Reusable modal for Save/Discard/Cancel and Resume/Start/Delete.                                                    |

### Backend (optional, if drafts are server-persisted)

| File                                                           | Change                                         |
| -------------------------------------------------------------- | ---------------------------------------------- |
| `backend/src/database/migrations/0XX_event_drafts.sql` _(new)_ | Table to store drafts per (organizer, module). |
| `backend/src/controllers/<module>-organizer.controller.js`     | Draft create/read/delete endpoints.            |
| `backend/src/routes/<module>-organizer.routes.js`              | Draft routes (`GET/POST/DELETE /drafts`).      |
| Corresponding service + validator                              | Draft validation & storage.                    |

> **Note:** A purely client-side draft (localStorage) is sufficient for the MVP and avoids backend migration. Backend persistence is recommended for multi-device resilience.

---

## 7. Routing / State-Management Changes

### 7.1 Routing

- Keep the existing route structure (component reuse is fine) — but make the **component itself** session-aware via a derived `session` object from `useParams`.
- Ensure the **same component instance** is keyed by its session identity so React remounts on session change. The simplest robust approach:

```jsx
// In routes/index.jsx, give each route a distinct key via a wrapper OR
// derive session in the component and run cleanup on change.
<Route path="events/new" element={<EventFormPage />} />
<Route path="events/:eventId/edit" element={<EventFormPage />} />
...
```

Best practice: add a `key` based on the session so React **unmounts** the old session:

```jsx
// In the layout component that renders EventFormPage:
<EventFormPage key={session.type === "create" ? "new" : eventId} />
```

This forces a full unmount/remount on Create↔Edit and Edit(A)↔Edit(B), guaranteeing no instance reuse.

### 7.2 State management

- **Do not** introduce a global form store. Keep form state local but **scoped to a session key**.
- Move cross-cutting concerns (draft + session lifecycle) into dedicated hooks (`useFormSession`, `useDraft`) shared across the three modules.
- `useEventProgress` must be **resettable** and **scoped** so that completed keys never leak between events or between Create/Edit.

---

## 8. Risk Assessment

| Risk                                                   | Impact | Mitigation                                                                                |
| ------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------- |
| Forced remount via `key` changes focus/scroll          | Low    | Re-focus first field on mount; scroll to top.                                             |
| Breaking existing stepper URLs/back-navigation         | Medium | Keep URL structure identical; only change internal state handling.                        |
| Draft data model mismatch (date format, assets)        | Medium | Reuse existing `isoToLocalInput`/`localInputToIso` and `ImageUploadField` conventions.    |
| Unsaved-changes prompt on every navigation (annoyance) | Medium | Only prompt when `isDirty` is true; honor "Cancel" to stay.                               |
| Draft merge hazard                                     | High   | Enforce the rule: **Edit never loads a draft**; drafts are Create-only. Add a guard/test. |
| `useEventProgress` regression                          | Medium | Add `reset()` and unit tests; verify stepper shows correct progress per event.            |
| Multiple organizers / same module drafts               | Medium | Scope drafts by organizer id + module (and org).                                          |
| Asset cleanup (orphaned banner uploads)                | Low    | Track uploaded asset URLs; delete on draft discard if unused.                             |

---

## 9. Implementation Plan

### Phase 0 — Foundations ✅ COMPLETE

- [x] Create `useFormSession` hook with the session lifecycle state machine.
- [x] Create `useDraft` hook (localStorage or API) with `hasDraft`, `save`, `resume`, `discard`, `delete`.
- [x] Create `UnsavedChangesDialog` reusable component.
- [x] Add `reset()` to `useEventProgress`.

**Files created/modified:**

- `frontend/src/hooks/useFormSession.js` (new) — session type detection (`none|create|edit`), `sessionKey`, `sessionChanged` signal, `beginSession`/`endSession`/`clearState`.
- `frontend/src/hooks/useDraft.js` (new) — localStorage draft persistence scoped per module with `hasDraft`, `saveDraft`, `resumeDraft`, `deleteDraft`, `refreshDraft`.
- `frontend/src/components/ui/UnsavedChangesDialog.jsx` (new) — reusable modal for both "leave" (Save/Discard/Cancel) and "resume" (Resume/Start New/Delete) flows.
- `frontend/src/hooks/useEventProgress.js` (modified) — added `reset()` to clear persisted progress for the current event.

### Phase 1 — Session keying (routing) ✅ COMPLETE

- [x] Update module layouts/routes to render `EventFormPage` with a session-derived `key` so instances remount on session change.
- [x] Verify Create↔Edit and Edit(A)↔Edit(B) transitions fully remount.

**Files modified:**

- `frontend/src/layouts/ElectionLayout.jsx` — `<Outlet key={eventId || 'new'} />`
- `frontend/src/layouts/PageantLayout.jsx` — `<Outlet key={eventId || 'new'} />`
- `frontend/src/layouts/PollingLayout.jsx` — `<Outlet key={eventId || 'new'} />`

The `key` is derived from the session identity (`eventId` for Edit, `'new'` for Create). When React Router reuses the same route element but the `eventId` changes, the `key` forces a **full unmount/remount**, guaranteeing no instance reuse and eliminating stale in-memory state leakage between Create↔Edit and Edit(A)↔Edit(B).

### Phase 2 — Refactor each module form page ✅ COMPLETE

- [x] Election: integrate `useFormSession` + `useDraft`; add unmount/eventId-change cleanup.
- [x] Competition: same.
- [x] Polling: same.
- [x] Ensure `reset(EMPTY)`, `clearErrors()`, `setStep`, and upload clearing run on every session end.

**Details:** Each module form page now invokes `useFormSession({ module, eventId })` and adds a session-boundary `useEffect` keyed on `sessionKey` that runs on every session change (Create↔Edit, Edit(A)↔Edit(B)). The cleanup resets form values via `reset(EMPTY)`, clears `banner`/`bannerFile`, clears `infoFormSchema`, clears `error`, and resets event progress via `resetProgress()` (aliased from `useEventProgress`). Combined with the Phase 1 `key`-based remounting in the layouts, this guarantees a clean **End → Clear → Init → Load → Render** transition with no stale state leakage.

### Phase 3 — Draft UI

- [ ] Add "unfinished draft" banner/modal on the events list when a draft exists.
- [ ] Add Resume / Start New / Delete Draft flow.
- [ ] Add Save as Draft / Discard / Cancel flow on leaving a dirty Create session.

### Phase 4 — Progress scoping

- [ ] Scope `useEventProgress` to the current eventId; clear on session end.
- [ ] Verify stepper accuracy for both Create and Edit.

### Phase 5 — Backend (optional)

- [ ] If server-persisted drafts are desired: migration, service, controller, routes, validators.

### Phase 6 — Testing & polish

- [ ] Manual QA across all three modules (see verification checklist).
- [ ] Add automated tests for `useFormSession` and `useDraft`.

---

## 10. Verification Checklist

### Session isolation

- [ ] Starting a **Create** session, then opening **Edit** never shows Create values/banner/validation.
- [ ] Editing **Event A**, then editing **Event B** never leaks A's data into B.
- [ ] Stepper position on Edit reflects only the edited event's progress.
- [ ] Validation errors do not carry over between sessions.

### Draft lifecycle

- [ ] Leaving a dirty Create session prompts Save as Draft / Discard / Cancel.
- [ ] "Save as Draft" persists step, values, and banner; returning to the list shows a draft indicator.
- [ ] Reopening Create shows Resume / Start New / Delete Draft.
- [ ] "Resume Draft" restores values, step, and banner.
- [ ] "Start New" clears the draft and opens a fresh empty form.
- [ ] "Delete Draft" removes it and opens a fresh form.

### Edit never merges with drafts

- [ ] Opening Edit does **not** show any draft prompt or draft data.
- [ ] Drafts are never saved against an existing event.

### Cleanup

- [ ] Leaving Create/Edit resets form values, errors, step, uploads, selections, and cached state.
- [ ] No stale state remains after navigation (verified via devtools/console).

### Regression

- [ ] Create + Edit still work end-to-end for Election, Competition, and Polling.
- [ ] Stepper, sidebar jumps, and back/forward navigation behave correctly.
- [ ] Existing persisted progress does not corrupt new events.

---

## 11. Summary

The core defect is that a **single component instance is reused across Create and Edit routes** without a session boundary, combined with **no cleanup** and **globally persisted progress**. The fix is to introduce an explicit **form session lifecycle** (`None | Create | Edit`) with guaranteed **End → Clear → Init → Load → Render** transitions, force a remount on session change via a session-derived `key`, scope `useEventProgress` to the active event, and add a proper **draft system** so unfinished Create work is either persisted, resumed, or discarded deliberately — and **never** merges into an Edit session.

This yields a clean, predictable, and scalable Create/Edit experience across all organizer modules.
