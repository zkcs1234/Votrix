# System Enhancements — Implementation Plan

Covers three cross-module changes (Election, Competition, Polling):

1. **Publish before invite** + staged edit-locking, with unpublish-while-scheduled.
2. **Search** — a shared filter primitive rolled out system-wide (metadata-aware, faceted, with counts).
3. **Dashboards** — scope every metric per event; kill blended cross-event totals.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Publish gate | Allow **zero participants**; invite after publish |
| Publish UI | Dedicated **"Review & Publish"** step |
| Unpublish | **Allowed while `scheduled`** (not yet `active`); one-way once `active` |
| Search scope | **Everywhere**, via one shared primitive |
| Dashboard fix | **Per-event breakdown tables** + type-bleed correctness fix |

## Lifecycle model (shared by all three modules)

Statuses: `draft → scheduled → active → completed` (+ `cancelled`). Two edit zones:

| Status | Setup (details, branding, info-form, positions/candidates, structure, questions) | Participants (register/invite voters·judges·respondents) |
|---|---|---|
| `draft` | editable | editable |
| `scheduled` | **locked** (unpublish to edit) | **editable** — resend window |
| `active` | locked | **locked** |
| `completed` / `cancelled` | locked | locked |

---

# POINT 1 — Publish before invite + staged lock

## 1A. Shared lifecycle helpers

**File:** `frontend/src/utils/constants.js`

Add next to `isReadOnlyEventStatus`:

```js
export const SETUP_EDITABLE_STATUSES = new Set([EVENT_STATUS.DRAFT])
export const PARTICIPANTS_EDITABLE_STATUSES = new Set([
  EVENT_STATUS.DRAFT,
  EVENT_STATUS.SCHEDULED,
])

// Setup (details/branding/positions/candidates/structure/questions) is locked
// once the event leaves draft. Participants stay editable through `scheduled`.
export function isSetupLocked(status) {
  return !SETUP_EDITABLE_STATUSES.has(status)
}
export function isParticipantsLocked(status) {
  return !PARTICIPANTS_EDITABLE_STATUSES.has(status)
}
export function canUnpublish(status) {
  return status === EVENT_STATUS.SCHEDULED
}
```

**Backend mirror** — `backend/src/utils/` (new `event-lifecycle.js` or extend an existing constants util) with the same predicates, imported by the three services. Single source of truth per side.

## 1B. Stepper: insert "Review & Publish"

**File:** `frontend/src/utils/eventStages.js` — add a `review` stage **before** the participants stage in each module:

- election: `… candidates → { key: 'review', label: 'Review & Publish', path: 'review' } → voters → analytics …`
- competition: `… judges → review → live …` (review sits after judges, before Live Control)
- polling: `… builder → review → respondents → analytics …`

## 1C. New Review & Publish page (per module)

**New files:**
- `frontend/src/pages/organizer/election/ElectionReviewPage.jsx`
- `frontend/src/pages/organizer/competition/CompetitionReviewPage.jsx`
- `frontend/src/pages/organizer/polling/PollingReviewPage.jsx`

Content (moved out of the participants pages):
- Readiness checklist (`ReadinessItem` — extract from [ElectionVotersPage.jsx:455](frontend/src/pages/organizer/election/ElectionVotersPage.jsx) into `components/organizer/ReadinessItem.jsx`).
  - election: ≥1 position, ≥1 candidate. **Drop the voter requirement.**
  - competition: ≥1 contestant, ≥1 judge, ≥1 criterion.
  - polling: ≥1 question. **Drop the respondent requirement.**
- Summary of the configured event (title, dates, counts).
- `StageFooter` with `onNext = handlePublish`, `nextLabel="Finish & Publish"`, `nextDisabled=!publishReady`.
- When `status === 'scheduled'`: show an **Unpublish** button + a note that setup is locked and reopening returns it to draft.

## 1D. Strip publish from participants pages

**Files:** `ElectionVotersPage.jsx`, `CompetitionJudgesPage.jsx`, `PollingRespondentsPage.jsx`

- Remove `isSetup`/`publishReady`/`handlePublish`/readiness block and the publish branch of `StageFooter`.
- The footer becomes plain stage navigation.
- Wrap register/invite controls in `disabled={isParticipantsLocked(status)}`; when locked show a banner ("Voting is active — the roster is now locked").
- Keep register + invite + resend fully usable while `scheduled`.

## 1E. Routes

**File:** `frontend/src/routes/index.jsx` — add a review route to each module:
```jsx
{ path: 'events/:eventId/review', element: <ElectionReviewPage /> }   // + competition, polling
```

## 1F. Sidebar nav

**Files:** `ElectionLayout.jsx`, `PageantLayout.jsx`, `PollingLayout.jsx`
Add a scoped **"Review & Publish"** nav item at the end of the Setup group.

## 1G. Lock the setup form pages

**Files:** `ElectionEventFormPage.jsx`, `CompetitionEventFormPage.jsx`, `PollingEventFormPage.jsx`, plus `ElectionPositionsPage`, `ElectionCandidatesPage`, `CompetitionWorkspacePage`, `CompetitionContestantsPage`, `PollingBuilderPage`.

- Replace `readOnly = isReadOnlyEventStatus(status)` with `readOnly = isSetupLocked(status)`.
- Existing `<fieldset disabled={readOnly}>` + `ReadOnlyEventBanner` patterns already handle presentation; the banner copy should say *"Published — unpublish to edit setup"* when `scheduled`.

## 1H. Backend: relax publish + enforce locks + unpublish

**Publish requirement relaxation:**
- `backend/src/services/election.service.js:1288` — remove the voter-count check.
- `backend/src/services/polling.service.js:700` — remove the respondent-count check.
- `pageant.service.js` — keep contestant/judge/criterion checks (structural, not invitees).

**New `unpublish*Event(eventId, organizerId)`** in each service:
- Assert ownership; require `status === 'scheduled'` (else 400 "Only scheduled events can be unpublished").
- Set `status: 'draft'`, run `syncEventSchedules()`, `recordAudit(...'.event.unpublish')`, invalidate dashboard cache.
- Controllers + routes: `POST /events/:eventId/unpublish` in the three `*-organizer.routes.js`.
- Frontend services: add `unpublishEvent(eventId)` to `election.service.js`, `pageant.service.js`, `polling.service.js`.

**Enforce setup lock server-side (currently missing — real gap):**
- Add an `assertSetupEditable(event)` guard (throws 409 if `isSetupLocked`) at the top of every setup mutation: create/update/delete position, candidate, criterion, round, division, contestant, poll question, event details update, banner upload, info-form save.
- Add `assertParticipantsEditable(event)` (throws 409 if `isParticipantsLocked`) on register/invite/CSV-import/resend handlers.
- These make the UI locks authoritative rather than cosmetic.

## 1I. Edge cases

- **Publish with zero voters → active with zero voters:** allowed by decision. Add a soft warning banner on the participants page while `scheduled` if roster is empty ("No one can vote until you invite participants").
- **Draft autosave / draft publish flow** (`draftService.publishDraft`) is the *create-from-draft* path (draft → setup event, still `draft`); unaffected — it does not set `scheduled`.
- **Resend rate limit:** unchanged; the whole point of keeping participants editable through `scheduled`.

---

# POINT 2 — Search, system-wide (shared primitive)

## 2A. Build the primitive

**New files:**
- `frontend/src/hooks/useTableFilter.js`
- `frontend/src/components/ui/FilterBar.jsx`

`useTableFilter({ rows, searchKeys, facetFields })` returns:
```
{ filtered, facets, activeFilters, setFilter, clearFilters, resultCount, totalCount }
```
- `searchKeys`: dot-paths / accessor fns (e.g. `email`, `metadata.*`, `name`, `party`).
- `facetFields`: `[{ id, label, accessor }]` — usually derived from the info-form schema.
- `facets[fieldId] = { value: count }` computed from the **full** dataset (counts stay visible while filtered) → answers *"how many BSCS?"*.

`FilterBar`: search input + one dropdown per facet (options show counts, e.g. `BSCS (42)`) + a "Showing X of Y" summary with optional group-by breakdown for the active facet. Debounced input; a11y labels; clear-all chip.

## 2B. Rollout (tiered)

**Tier A — participant tables** (`DynamicParticipantTable.jsx`): replace the email-only `.filter` ([line 48](frontend/src/components/organizer/DynamicParticipantTable.jsx)) with `useTableFilter`. `searchKeys = ['email', ...customFields]`; `facetFields` from `formSchema.fields`. One change covers **voters, judges, respondents**.

**Tier B — organizer setup lists:**
- `CompetitionContestantsPage.jsx` — **add** text search (name/number) + division facet (currently filter-only).
- `CompetitionRankingsPage.jsx` — **add** contestant search.
- `ElectionCandidatesPage.jsx` — keep name/party search, add result count + position facet via the shared bar.

**Tier C — admin lists:** `GlobalEventsPage` (add type + date facets), `OrganizerManagementPage` (keep, adopt FilterBar), `AuditLogsPage` (facet by action/actor/date), `SessionManagementPage` (adopt). Normalizes four bespoke implementations onto one.

**Tier D — global palette** ([GlobalSearch.jsx](frontend/src/components/ui/GlobalSearch.jsx)): extend `liveResults` so an **organizer** (not just admin) can search their own events/voters. Add an organizer live-search endpoint or reuse existing list services client-side.

## 2C. Server-side option

For lists that can grow large (respondents, audit logs, global events), the hook can defer to `GET ...?search=&facet_x=` returning `{ rows, facets, total }`. Ship client-side first; switch per-surface only if needed.

---

# POINT 3 — Dashboards scoped per event

**Root cause:** rates/cohorts summed across events, and `event_participants` counted regardless of `participant_type`.

## 3A. Backend correctness + per-event payload

**File:** `backend/src/services/dashboard.service.js`
- `totalAssignedVoters` ([line 437](backend/src/services/dashboard.service.js)) — count only `participant_type = election_voter`; return `assignedVoters`, `assignedJudges`, `assignedRespondents` separately.
- Admin `totalVoters` — same type-scoping.
- Add a **per-event array** to each module dashboard payload: `events: [{ id, title, status, registered, invited, participated, rate }]` (module service computes it: [election.service.js:87](backend/src/services/election.service.js) area, plus pageant/polling equivalents). This is the data the per-event tables render.

## 3B. Module dashboards → count KPIs + per-event table

**Files:** `ElectionDashboardPage.jsx`, `CompetitionDashboardPage.jsx`, `PollingDashboardPage.jsx`
- **Keep** count KPIs (Total events, Active, Finished, Drafts).
- **Move** rate/cohort tiles (Registered voters, Votes cast, Turnout %, Judge completion %, Participation rate) **out of the header** and into a **per-event breakdown table** (`components/organizer/EventStatsTable.jsx`, reuses `FilterBar` for status filtering + search). Each row shows that event's own numbers; no blended turnout.

## 3C. Organizer home

**File:** `OrganizerDashboardPage.jsx`
- Replace the blended **"Assigned voters"** tile ([line 240](frontend/src/pages/organizer/OrganizerDashboardPage.jsx)) with either a typed split ("Voters 100 · Judges 8 · Respondents 250 across 3 events") or an **"Active & upcoming events"** panel listing per-event participation.
- Fold the competition-session **N+1** ([line 61](frontend/src/pages/organizer/OrganizerDashboardPage.jsx)) into the dashboard endpoint (return `activeSessions` server-side).

## 3D. Voter / Admin

- **Voter dashboard** — already per-voter and correct; no change.
- **Admin dashboard** — apply the type-scoped "Total voters" fix; counts otherwise fine as a platform view.

---

# Build order

1. **Point 1 — Election first** (lifecycle helpers, review step, route/nav, form locks, backend relax + guards + unpublish). Validate end-to-end.
2. **Point 1 — replicate** to Competition + Polling.
3. **Point 2** — build `useTableFilter` + `FilterBar`; Tier A → B → C → D.
4. **Point 3** — backend payload/type fixes; per-event tables; home panel + N+1.

Each phase is independently shippable.

# Risk / verification checklist

- [ ] Publish with 0 voters works; event still reaches `active` by schedule.
- [ ] `scheduled`: setup rejects edits (UI + API 409); participants editable; unpublish returns to `draft` and re-enables setup.
- [ ] `active`: participants locked (UI + API 409).
- [ ] Search "BSCS" shows count and filters across all three participant tables.
- [ ] No dashboard shows a rate summed across events; participant counts are type-correct.
- [ ] Backend guards enforced even when frontend is bypassed.
