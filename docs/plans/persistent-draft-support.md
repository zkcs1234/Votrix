# VOTRIX Persistent Draft Support (Database-Backed)

## Continuation of: `create-edit-event-lifecycle-draft-management.md`

This plan extends the session-lifecycle work already shipped (Phases 0–2: `useFormSession`,
`useDraft`, `UnsavedChangesDialog`, `useEventProgress.reset()`, keyed remounting, per-module
form cleanup) by replacing the **localStorage-backed** draft with a **server-persisted draft**
that survives browser refresh/close, logout, device switches, and time away.

---

## 1. Database Analysis

### 1.1 What exists today

| Concept | Where it lives | Suitability as a "draft" |
| ------- | -------------- | ------------------------ |
| `events.status = 'draft'` | `events.status` (`event_status` enum, migration `001`) | **No.** An `events` row already has `organization_id`, `event_type`, `created_at`. It models an *event that exists but is unpublished* — not an unfinished *Create form session* where the event row does not exist yet. |
| Create-session values (title, dates, step, banner, info-form schema) | `frontend/src/hooks/useDraft.js` → `localStorage` (`votrix.event-draft.{module}`) | **No (inadequate).** Lost on logout, device switch, browser data clear; not visible across devices. |
| Step progress | `useEventProgress.js` → `localStorage` | **No (inadequate).** Only step keys, not values; same device/browser limitations. |
| Banner asset | URL string on `events.banner` after `uploadBanner` | Reused as a plain URL in the draft payload — the asset itself lives in the upload provider (Cloudinary), so persisting the URL string is sufficient. |

### 1.2 What is missing

There is **no table** that stores unfinished Create-session work scoped to `(organizer, module)`.
The `events` table cannot be reused for this because:

- A Create session has **no event row yet** — the draft is saved *before* `createEvent` succeeds
  (or mid-flow, before all steps are completed).
- Drafts must be **owned by the organizer**, not by an event.
- Only **one** draft per (organizer, module) should exist — enforced by a unique constraint.

### 1.3 Design decision: one shared table

A single `event_drafts` table serves all three modules. We do **not** create three tables or
duplicate event columns — the draft is a **JSONB payload + a few metadata columns**, so:

- No schema changes are needed when a module adds a new form field (the payload is opaque to SQL).
- `module` uses the **frontend route segment** (`election` | `competition` | `polling`), which
  matches the existing `useDraft('election')` calls and the `/organizer/{module}` route prefixes
  exactly — no `pageant`/`competition_scoring` enum ambiguity.

### 1.4 Database analysis summary

| Requirement | Supported? | Via |
| ----------- | ---------- | --- |
| Draft status | ❌ (new) | `event_drafts` table (row exists = draft exists) |
| Draft metadata | ❌ (new) | `step`, `title`, `banner`, `payload` JSONB |
| Resume capability | ❌ (new) | Full payload + step stored server-side |
| Draft ownership | ❌ (new) | `organizer_id` FK → `users.id` |
| Last-saved info | ❌ (new) | `updated_at` (auto via `set_updated_at()` trigger) |
| Publishing workflow | ✅ partial | Reuse module `createEvent` service + delete draft |

---

## 2. SQL Migration

### 2.1 `backend/src/database/migrations/034_event_drafts.sql`

```sql
-- Migration 034 — Persistent organizer drafts for unfinished Create sessions.
--
-- One unfinished Create-session draft per (organizer, module).
-- Drafts are Create-only: Edit sessions must NEVER read or write this table.
-- `payload` is opaque JSON (form values, info-form schema, selections, etc.)
-- so new form fields do not require schema changes.

BEGIN;

CREATE TABLE IF NOT EXISTS event_drafts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  module       TEXT NOT NULL,
  step         TEXT NOT NULL DEFAULT 'details',
  title        VARCHAR(255),
  banner       TEXT,
  payload      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT event_drafts_module_valid
    CHECK (module IN ('election', 'competition', 'polling')),
  CONSTRAINT event_drafts_one_per_module UNIQUE (organizer_id, module)
);

CREATE INDEX IF NOT EXISTS idx_event_drafts_organizer_module
  ON event_drafts (organizer_id, module);

CREATE INDEX IF NOT EXISTS idx_event_drafts_updated_at
  ON event_drafts (updated_at DESC);

CREATE TRIGGER trg_event_drafts_updated_at
  BEFORE UPDATE ON event_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE event_drafts IS
  'Unfinished Create-session draft per organizer + module. Never merged with Edit sessions.';
COMMENT ON COLUMN event_drafts.payload IS
  'Opaque JSON snapshot of the Create form (values, info-form schema, selections).';

COMMIT;
```

### 2.2 `backend/src/database/migrations/034_down_event_drafts.sql`

```sql
-- Migration 034 DOWN — remove persistent draft storage.
-- Any saved drafts are lost. Existing events are untouched.

BEGIN;

DROP TRIGGER IF EXISTS trg_event_drafts_updated_at ON event_drafts;
DROP TABLE IF EXISTS event_drafts;

COMMIT;
```

### 2.3 Migration properties

- **Safe / idempotent** — `IF NOT EXISTS` guards everywhere; runs clean on a fresh DB and on
  repeat application.
- **Reversible** — paired down migration drops only the new table; no existing tables/enums touched.
- **Production-compatible** — additive only; `event_drafts` is a brand-new table, existing rows
  unaffected.
- **Backward compatible** — no column/type changes to any existing table; all current queries
  unchanged.

---

## 3. Updated Backend Architecture

### 3.1 New/changed files

| File | Change |
| ---- | ------ |
| `backend/src/database/migrations/034_event_drafts.sql` | **New.** Create `event_drafts`. |
| `backend/src/database/migrations/034_down_event_drafts.sql` | **New.** Drop `event_drafts`. |
| `backend/src/utils/constants.js` | Add `DB_TABLES.EVENT_DRAFTS = 'event_drafts'` and `DRAFT_MODULES = ['election','competition','polling']`. |
| `backend/src/services/draft.service.js` | **New.** Generic get/save/delete/publish for drafts. |
| `backend/src/controllers/draft.controller.js` | **New.** Module-bound handlers (factory pattern). |
| `backend/src/validators/draft.validator.js` | **New.** `validateDraft` (and reuse each module's `validateCreateEvent` for publish). |
| `backend/src/routes/election-organizer.routes.js` | Mount `GET/PUT/DELETE /drafts` + `POST /drafts/publish`. |
| `backend/src/routes/pageant-organizer.routes.js` | Same, for competition. |
| `backend/src/routes/polling-organizer.routes.js` | Same, for polling. |

### 3.2 `backend/src/services/draft.service.js`

```js
import { db } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES } from '../utils/constants.js'

/** One draft per (organizer, module). Row existence == draft exists. */
export async function getDraft(organizerId, module) {
  const { data, error } = await db()
    .from(DB_TABLES.EVENT_DRAFTS)
    .select('*')
    .eq('organizer_id', organizerId)
    .eq('module', module)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  return data ?? null // null = no unfinished draft
}

/** Upsert: saves a fresh draft or updates the existing one. */
export async function saveDraft(organizerId, module, { step, title, banner, payload }) {
  const { data, error } = await db()
    .from(DB_TABLES.EVENT_DRAFTS)
    .upsert(
      {
        organizer_id: organizerId,
        module,
        step: step ?? 'details',
        title: title ?? null,
        banner: banner ?? null,
        payload: payload ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organizer_id,module' },
    )
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  return data
}

/** Delete / discard. Idempotent — missing draft is not an error. */
export async function deleteDraft(organizerId, module) {
  const { error } = await db()
    .from(DB_TABLES.EVENT_DRAFTS)
    .delete()
    .eq('organizer_id', organizerId)
    .eq('module', module)
  if (error) throw new ApiError(500, error.message)
}

/**
 * Publish: create the real event from the draft payload via the module's
 * createEvent service, then remove the draft.
 *
 * `createFn(organizerId, payload)` is the module's existing create service
 * (election.service.createElectionEvent, etc.) — no business logic duplicated.
 */
export async function publishDraft(organizerId, module, createFn, payload) {
  const event = await createFn(organizerId, payload)   // creates events row (status 'draft')
  // Best-effort draft cleanup. If this fails the published event still stands;
  // a stale draft is discarded the next time the organizer chooses "Start New".
  try {
    await deleteDraft(organizerId, module)
  } catch (err) {
    console.error(`[draft] failed to clear draft after publish (${module}):`, err.message)
  }
  return event
}
```

### 3.3 `backend/src/controllers/draft.controller.js`

Handlers are **factories bound to a module** so each module router mounts the same controller
without string-matching on the URL:

```js
import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import * as draftService from '../services/draft.service.js'
import { validateDraft } from '../validators/draft.validator.js'
import * as electionService from '../services/election.service.js'
import * as pageantService from '../services/pageant.service.js'
import * as pollingService from '../services/polling.service.js'
import {
  validateCreateEvent as validateElectionEvent,
} from '../validators/election.validator.js'
// ... pageant + polling create validators

const CREATE_MAP = {
  election: { create: electionService.createElectionEvent, validate: validateElectionEvent },
  competition: { create: pageantService.createPageantEvent, validate: validatePageantEvent },
  polling: { create: pollingService.createPollingEvent, validate: validatePollingEvent },
}

export const getDraft = (module) =>
  asyncHandler(async (req, res) => {
    const draft = await draftService.getDraft(req.user.id, module)
    if (!draft) return res.json({ success: true, draft: null })
    res.json({ success: true, draft: mapDraft(draft) })
  })

export const saveDraft = (module) =>
  asyncHandler(async (req, res) => {
    const body = validateDraft(req.body)
    const draft = await draftService.saveDraft(req.user.id, module, body)
    res.json({ success: true, draft: mapDraft(draft) })
  })

export const deleteDraft = (module) =>
  asyncHandler(async (req, res) => {
    await draftService.deleteDraft(req.user.id, module)
    res.json({ success: true })
  })

export const publishDraft = (module) =>
  asyncHandler(async (req, res) => {
    const { create, validate } = CREATE_MAP[module]
    const payload = validate(req.body)                  // same validation as POST /events
    const event = await draftService.publishDraft(req.user.id, module, create, payload)
    res.status(201).json({ success: true, event })
  })

function mapDraft(row) {
  return {
    id: row.id,
    module: row.module,
    step: row.step,
    title: row.title,
    banner: row.banner,
    payload: row.payload,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
}
```

> **Note:** Draft routes live under each module router, which already sits behind
> `authenticate → authorize(ORGANIZER) → requireActiveAccount → requirePasswordChanged →
> requireProfileComplete` (see `organizer.routes.js`). **Authorization rules are unchanged.**
> Ownership is guaranteed by querying on `req.user.id` and the `organizer_id` FK — an organizer
> can only read/update/delete their own drafts. A draft row carries no `event_id`, so it can
> never be confused with or merged into an existing event.

### 3.4 `backend/src/validators/draft.validator.js`

```js
export function validateDraft(body) {
  const step = typeof body.step === 'string' && body.step.trim() ? body.step.trim() : 'details'
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 255) : null
  const banner = typeof body.banner === 'string' ? body.banner : null
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
  return { step, title, banner, payload }
}
```

### 3.5 Route wiring (example — election; identical for the other two modules)

```js
// election-organizer.routes.js
import * as draftCtrl from '../controllers/draft.controller.js'

const MODULE = 'election'

router.get('/drafts', draftCtrl.getDraft(MODULE))
router.put('/drafts', draftCtrl.saveDraft(MODULE))
router.delete('/drafts', draftCtrl.deleteDraft(MODULE))
router.post('/drafts/publish', draftCtrl.publishDraft(MODULE))
```

---

## 4. Updated API Endpoints

All endpoints are scoped to the module prefix and require the existing organizer auth.

| Method | Path | Purpose | Body | Response |
| ------ | ---- | ------- | ---- | -------- |
| `GET` | `/organizer/{module}/drafts` | Check for an unfinished draft (resume / list-page banner) | — | `{ success, draft: DraftOrNull }` |
| `PUT` | `/organizer/{module}/drafts` | Save or update the draft (upsert) | `{ step, title?, banner?, payload }` | `{ success, draft }` |
| `DELETE` | `/organizer/{module}/drafts` | Delete / discard the draft (idempotent) | — | `{ success }` |
| `POST` | `/organizer/{module}/drafts/publish` | Publish the draft → create the real event, then clear the draft | Same shape as `POST /organizer/{module}/events` | `201 { success, event }` |

`{module}` ∈ `election | competition | polling`.

**Draft JSON shape returned by the API:**

```json
{
  "id": "uuid",
  "module": "election",
  "step": "branding",
  "title": "Student Council 2026",
  "banner": "https://res.cloudinary.com/.../banner.png",
  "payload": {
    "title": "Student Council 2026",
    "description": "...",
    "startDate": "2026-09-01T00:00:00.000Z",
    "endDate": "2026-09-01T23:59:59.000Z",
    "resultsVisibility": "public",
    "infoFormSchema": { "enabled": false, "fields": [] }
  },
  "updatedAt": "2026-08-07T09:30:00.000Z",
  "createdAt": "2026-08-06T22:00:00.000Z"
}
```

---

## 5. Frontend Workflow

### 5.1 New/changed files

| File | Change |
| ---- | ------ |
| `frontend/src/services/draft.service.js` | **New.** `getDraft`, `saveDraft`, `deleteDraft`, `publishDraft` per module. |
| `frontend/src/hooks/useDraft.js` | **Rewrite.** Same public API (`hasDraft`, `draft`, `saveDraft`, `resumeDraft`, `deleteDraft`, `refreshDraft`) but **server-backed**. Keeps a lightweight localStorage cache for the events-list banner so the page is not blocked on the network. |
| `frontend/src/pages/organizer/election/ElectionEventFormPage.jsx` | Wire **resume** on Create mount; save/discard now hit the API; capture info-form snapshot on save (Option A, see §5.6). |
| `frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx` | Same. |
| `frontend/src/pages/organizer/polling/PollingEventFormPage.jsx` | Same. |
| `frontend/src/components/organizer/DraftBanner.jsx` | No structural change — it already renders from `useDraft` (now server-backed) and navigates to `/new`. |
| `frontend/src/components/ui/UnsavedChangesDialog.jsx` | No change. |

### 5.2 `frontend/src/services/draft.service.js`

```js
import api from '@/services/api'

const base = (module) => `/organizer/${module}/drafts`

export const draftService = {
  getDraft(module) { return api.get(base(module)) },
  saveDraft(module, data) { return api.put(base(module), data) },
  deleteDraft(module) { return api.delete(base(module)) },
  publishDraft(module, payload) { return api.post(`${base(module)}/publish`, payload) },
}
```

### 5.3 `frontend/src/hooks/useDraft.js` (rewritten)

Same interface the form pages and `DraftBanner` already use — callers change **nothing**:

```js
import { useCallback, useEffect, useState } from 'react'
import { draftService } from '@/services/draft.service'

const CACHE_PREFIX = 'votrix.event-draft.cache'   // local fallback only, never source of truth

export default function useDraft(module) {
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(false)

  const refreshDraft = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await draftService.getDraft(module)
      setDraft(data.draft)
    } catch {
      // network offline → fall back to local cache so the list banner still works
      try {
        const raw = localStorage.getItem(`${CACHE_PREFIX}.${module}`)
        setDraft(raw ? JSON.parse(raw) : null)
      } catch {
        setDraft(null)
      }
    } finally {
      setLoading(false)
    }
  }, [module])

  useEffect(() => { refreshDraft() }, [refreshDraft])

  const saveDraft = useCallback(async (data) => {
    const payload = { ...data, module, updatedAt: new Date().toISOString() }
    try {
      const { data: res } = await draftService.saveDraft(module, payload)
      setDraft(res.draft)
    } catch {
      // offline fallback: keep a local copy so the session is not lost on refresh
      try { localStorage.setItem(`${CACHE_PREFIX}.${module}`, JSON.stringify(payload)) } catch {}
    }
  }, [module])

  const resumeDraft = useCallback(() => draft, [draft])

  const deleteDraft = useCallback(async () => {
    try {
      await draftService.deleteDraft(module)
    } catch {
      /* offline: still clear local view */
    }
    try { localStorage.removeItem(`${CACHE_PREFIX}.${module}`) } catch {}
    setDraft(null)
  }, [module])

  return { hasDraft: Boolean(draft), draft, saveDraft, resumeDraft, deleteDraft, refreshDraft, loading }
}
```

### 5.4 Form pages — wire resume on Create mount

Add a Create-session effect that loads an existing server draft into the form (this is the
currently **missing** piece — today `Resume Draft` only navigates to `/new` without restoring
values):

```js
// In each module form page (shown for election):
const { saveDraft, deleteDraft, resumeDraft, refreshDraft } = useDraft('election')

// On a Create session mount, restore the draft (step + values + banner).
useEffect(() => {
  if (!isNew) return
  let cancelled = false
  setLoading(true)
  draftService.getDraft('election')
    .then(({ data }) => {
      if (cancelled || !data.draft) return
      const d = data.draft
      reset({
        title: d.payload.title ?? '',
        description: d.payload.description ?? '',
        startDate: isoToLocalInput(d.payload.startDate),
        endDate: isoToLocalInput(d.payload.endDate),
        resultsVisibility: d.payload.resultsVisibility ?? 'public',
      })
      setBanner(d.banner ?? null)
      setStep(d.step === 'information-form' ? inferStepFromPath('/form') : d.step ?? 'details')
      // Option A mirror (see §5.6): restore a non-default info-form snapshot if one was
      // captured in the draft. During a normal /events/new session this is the default
      // { enabled: false, fields: [] }, so the branch is usually a no-op — correct,
      // because the info form belongs to the event, not the draft.
      if (d.payload.infoFormSchema && d.payload.infoFormSchema.enabled) {
        setInfoFormSchema(d.payload.infoFormSchema)
      }
    })
    .finally(() => !cancelled && setLoading(false))
  return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [sessionKey])   // re-run only when the session identity changes
```

**Save as Draft** (`handleSaveAsDraft`) now calls the API via the same `saveDraft` from `useDraft`
— the local shape already matches `{ step, title, ..., banner }`, and `useDraft` maps it onto the
server payload. **Discard** calls `deleteDraft()` then `confirmLeave.proceed()`.

### 5.5 Events-list draft banner

`DraftBanner` already renders from `useDraft(module)` and offers **Resume Draft / Start New /
Delete Draft**. With the hook now server-backed:

- **Resume Draft** → navigates to `/organizer/{module}/events/new`; the form page's new resume
  effect loads the draft from the API and restores step + values + banner.
- **Start New** → `deleteDraft()` then navigate to `/new` (fresh empty form).
- **Delete Draft** → `deleteDraft()`.

`DraftBanner` is shown on the events list for `election`, `competition`, and `polling` (already
wired in `ElectionEventsPage.jsx` line 199, and mirrored in the other two modules).

### 5.6 Participant information form across the three modules

The participant information form is **already unified** in the VOTRIX data model, so a single
draft record holds it naturally — the module is a *UI/route concern*, not a *data concern*:

- **One column:** `events.information_form_schema` (JSONB, migration 030) with one canonical
  shape `{ enabled, fields: [{ id, label, type, required, options? }] }` for **all three modules**.
  No per-module info-form table exists.
- **Same endpoints:** identical `GET/PATCH /events/:eventId/information-form` on every module
  router, backed by the shared `event.service.js` (`getEventInformationForm` /
  `setEventInformationForm`).
- **Shared builder:** `ParticipantInformationFormBuilder` is one component used by all three form
  pages; the module only varies the `service` prop passed to it.

**Option A (implemented in this plan) — mirror snapshot; info form stays post-publish.**

The info-form step (`/events/:id/form`) is only reachable **after** the event row exists, so a
Create-session draft saved at `/events/new` (steps: Details + Branding) cannot contain a
non-default info form today. This plan therefore treats the info form as a **post-publish,
on-event concern** and mirrors it in the draft only defensively:

1. **Capture:** `handleSaveAsDraft` writes the current builder state into
   `payload.infoFormSchema`. During a normal `/events/new` session this is the default
   `{ enabled: false, fields: [] }` — nothing to restore.
2. **Resume:** the form page restores `payload.infoFormSchema` into the builder only when a
   non-default snapshot exists (see `§5.4`). In the current flow that branch is usually a no-op,
   which is correct — the info form belongs to the event, not the draft.
3. **Publish:** after `createEvent`, if the snapshot is non-default, patch it onto the new event
   with the module's `PATCH /information-form` (see `§7`). Normal flow: the organizer reaches
   `/events/:id/form` after publish and builds the info form there exactly as they do today — no
   data loss, no duplicate storage.

This keeps the draft minimal, reuses the existing on-event info-form storage, and adds **zero**
routing changes.

**Option B (future extension) — make the info form part of the Create draft.**

If the product wants "Resume Draft" to restore a fully built info form *before* the event exists,
the info-form step must become reachable inside `/events/new`:

- Routing: allow `/events/new` to include the info-form step without an `eventId` (the stepper
  already lists it; only the route guard excludes it today).
- Builder save path: while no event exists, `ParticipantInformationFormBuilder` saves into the
  draft payload instead of `PATCH /information-form`.
- Publish: create the event, then patch the drafted schema onto it in the same flow.

This is a larger change (routing, layout stepper, builder save path) and is deliberately **out of
scope** for this plan. It can be added later **without changing the draft schema** — the JSONB
payload already carries `infoFormSchema`.

---

## 6. Draft Lifecycle Diagram

```
                         ┌───────────────────────────────────────────────┐
                         │          Create Session (isNew)                │
                         └───────────────┬───────────────────────────────┘
                                         │ open /events/new
                                         ▼
                              ┌─────────────────────────┐
                              │   GET /drafts exists?   │
                              └──────────┬──────────────┘
                    ┌────────────────────┴────────────────────┐
                    │ yes                                      │ no
                    ▼                                          ▼
          DraftBanner "You have an                      Fresh empty form
          unfinished draft."                             (no draft row)
          ┌──────────┬──────────────┬──────────┐
          │ Resume   │ Start New    │ Delete   │
          ▼          ▼              ▼          ▼
      load draft  delete draft   delete draft  stay on
      into form   → fresh form   → fresh form   list
          │
          │  user edits form (dirty)
          ▼
      ┌──────────────────────────────────────────────┐
      │  Leave before publishing?  (useBlocker)      │
      └───────────────────┬──────────────────────────┘
          ┌───────────────┴───────────────────────────────┐
          │ Save as Draft      │ Discard      │ Cancel    │
          ▼                   ▼              ▼
      PUT /drafts         DELETE /drafts   stay on
      (persist step,       + navigate      form
       payload, banner)      away
       + navigate away
          │
          │   later: open /events/new again
          ▼
      draft row found → DraftBanner → Resume → values/step/banner restored
          │
          │   organizer completes all steps
          ▼
      ┌───────────────────────────────────────────────┐
      │          Publish (Create Event)               │
      │  POST /drafts/publish  ──OR──  POST /events   │
      │  1. create event via module service (audit)   │
      │  2. DELETE /drafts (clear the draft row)      │
      │  3. redirect → /organizer/{module}/events/{id}│
      └───────────────────────────────────────────────┘
                          │
                          ▼
                   Edit session begins —
                   NEVER reads /drafts
```

**Invariants enforced**

- Drafts exist **only** for Create sessions; Edit sessions never call the draft endpoints.
- A draft is scoped to `(organizer_id, module)` — one unfinished draft per module, never shared.
- Publishing clears the draft in the same flow, so a published event and a stale draft cannot
  coexist after a successful publish.
- "Start New" / "Delete" clears the draft row — a fresh Create session starts with no draft.

---

## 7. Publish Workflow

1. Organizer completes all Create steps and clicks **Publish / Create Event**.
2. Frontend sends the full create payload to `POST /organizer/{module}/drafts/publish`.
   - Payload shape is identical to `POST /organizer/{module}/events`, validated by the same
     module validator — no new validation path.
3. `draft.service.publishDraft`:
   - Calls the module's existing `createEvent(organizerId, payload)` → inserts the `events` row
     (status `draft`), runs audit logging and schedule sync exactly as today.
   - Deletes the `event_drafts` row for `(organizerId, module)` (best-effort; failure only leaves
     a stale draft that "Start New" will clear later).
4. **(Option A, see §5.6)** If the draft's `payload.infoFormSchema` is a non-default snapshot
   (`enabled: true`), patch it onto the new event with the module's
   `PATCH /information-form`. Normal flow: the organizer builds the info form on the event after
   publish instead, so this step is a no-op.
5. Frontend redirects to the new event's management page (`/events/{id}/...`).

> **Backward-compatible path:** the form may also keep calling the existing `POST /events`
> directly and then `DELETE /drafts` — the publish endpoint is a convenience that makes the
> "publish then clear draft" sequence a single request and removes the chance of forgetting the
> draft cleanup.

**Known edge (out of scope, documented):** an interrupted earlier session may have already
created a `draft`-status `events` row. Publishing creates a **fresh** event; orphan draft-status
events are not reused or deleted by this feature. A follow-up cleanup job (or the events list)
can surface/remove them later.

---

## 8. Resume Workflow

1. Organizer opens `GET /organizer/{module}/drafts` (via `useDraft` on the events list).
2. If a draft row exists → `DraftBanner` shows **"You have an unfinished draft."** with
   `title` + `updatedAt`.
3. Organizer clicks **Resume Draft** → navigates to `/organizer/{module}/events/new`.
4. The form page's Create-mount effect:
   - `GET /drafts` → reads `{ step, title, banner, payload }`.
   - `reset()` form values from `payload` (title, description, dates, visibility).
   - Restores `step` (details / branding / information-form) and `banner` URL.
   - Restores a non-default `infoFormSchema` snapshot from `payload` if present (Option A mirror,
     see `§5.6`).
   - Re-seeds stepper progress for the restored step.
5. Organizer continues editing; on leaving dirty → **Save as Draft / Discard / Cancel** dialog.

Because the draft is server-side, resume works after refresh, browser close, logout/login, and on
another device.

---

## 9. Rollback Strategy

| Step | Action |
| ---- | ------ |
| 1 | Run `034_down_event_drafts.sql` — drops `event_drafts` (any saved drafts are lost; **events untouched**). |
| 2 | Revert `useDraft.js` to the previous localStorage implementation (kept in git history). |
| 3 | Remove the `/drafts` route lines from the three module route files. |
| 4 | Optionally keep `draft.service.js` / `draft.controller.js` / `draft.validator.js` in the repo unused — they are additive and cannot break existing routes. |
| 5 | Form-page resume effect can be removed by reverting those three page files. |

Order matters only for the DB (step 1) and the frontend hook (step 2); backend service files are
safe to leave in place either way.

---

## 10. Verification Checklist

### Persistence (the core requirement)
- [ ] Save a draft → refresh the browser → draft still listed on events page.
- [ ] Save a draft → close and reopen the browser → draft still present.
- [ ] Save a draft → log out → log back in as the same organizer → draft still present.
- [ ] Save a draft on one device → log in on another device → draft visible and resumable.
- [ ] Draft survives 24h+ (persisted in DB, not ephemeral state).

### Draft API
- [ ] `PUT /organizer/{module}/drafts` creates a row on first save and **updates** (not duplicates) on later saves.
- [ ] `GET /organizer/{module}/drafts` returns the draft; returns `draft: null` when none.
- [ ] `DELETE /organizer/{module}/drafts` removes the row and is idempotent.
- [ ] `POST /organizer/{module}/drafts/publish` creates the event and clears the draft in one request.

### Ownership / authorization
- [ ] Organizer A cannot GET/PUT/DELETE Organizer B's draft (404/empty via `organizer_id` scoping).
- [ ] A voter/admin token cannot access `/organizer/*/drafts` (403 via existing middleware).

### UI flows
- [ ] Leaving a dirty Create form prompts **Save as Draft / Discard Changes / Cancel**.
- [ ] **Save as Draft** persists and navigating away succeeds.
- [ ] **Discard Changes** removes the draft and navigates away.
- [ ] **Cancel** stays on the form with all values intact.
- [ ] Reopening Create with a draft shows the **"You have an unfinished draft"** banner.
- [ ] **Resume Draft** restores current step, form values, banner, info-form schema, and progress.
- [ ] **Start New** clears the draft and opens a fresh empty form.
- [ ] **Delete Draft** removes it and opens a fresh form.

### Edit isolation
- [ ] Editing an existing event shows **no** draft banner and **no** draft data.
- [ ] Edit sessions never call `/drafts` (verified in network tab).
- [ ] Saving an Edit does **not** create or modify any draft row.

### Regression
- [ ] Create + Edit still work end-to-end for Election, Competition, and Polling.
- [ ] Stepper, sidebar jumps, and back/forward navigation behave correctly.
- [ ] Banner upload still works during Create and Edit.
- [ ] Existing `draft`-status events and published events are unaffected.

---

## 11. Summary

The previous plan delivered the **session lifecycle** (clean Create/Edit isolation, no stale state,
localStorage drafts). This continuation replaces the localStorage draft with a **single shared,
server-persisted `event_drafts` table** scoped to `(organizer_id, module)`, so unfinished Create
work survives refresh, browser close, logout, device switches, and days away.

The design:

- **One table, one migration, one shared service/controller** across the three modules — no
  duplicated schema or business logic.
- **Opaque JSONB payload** so new form fields never require schema changes.
- **Reuses existing module `createEvent` services and validators** for publish — no duplicated
  event-creation logic.
- **Edit isolation preserved** — drafts are Create-only by construction (draft routes are only
  invoked from Create sessions, and the table carries no `event_id`).
- **Authorization unchanged** — existing organizer auth middleware + `organizer_id` ownership
  scoping.

This integrates naturally with the existing VOTRIX architecture while keeping Create sessions,
Edit sessions, and persistent Draft records cleanly separated.
