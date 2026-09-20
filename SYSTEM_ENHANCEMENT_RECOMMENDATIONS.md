# System Enhancement Recommendations

A prioritized, **non-destructive** enhancement plan for Votrix (frontend, backend,
database, UI/UX). Based on a codebase survey in the same session that shipped the
publish-lifecycle, faceted-search, and per-event-dashboard work.

## Guiding principle: additive, reversible, incremental

Every item below is designed so it can land **without breaking existing behavior**:

- **Additive** — new components/hooks/functions/indexes alongside current code, not
  rewrites. Nothing existing is deleted until its replacement is proven.
- **Opt-in adoption** — cross-cutting changes (e.g. a data-fetching library) are
  introduced page-by-page. The old pattern keeps working during migration.
- **Backward-compatible payloads** — API responses gain fields; none are removed or
  renamed while a consumer still reads them.
- **Reversible DB changes** — every migration is `IF NOT EXISTS` / additive with a
  paired `_down` migration; no column drops or destructive rewrites.
- **Behind a flag when risky** — anything that changes a hot path ships dark first.

Nothing here requires a big-bang refactor or a data migration that mutates rows.

---

## What is already healthy (leave as-is)

- Auth is on **HTTP-only cookies + CSRF** (`api.js`, `withCredentials`) — no token in
  localStorage. Do **not** reopen this.
- **90 migrations** with real composite indexes (018/019); **39 backend tests**; three
  CI workflows; charts are already code-split into their own chunk.
- Clean service / controller / validator / route layering. Preserve it.

---

# Phase A — Resilience (P0, low risk, high value)

## A1. Add a React error boundary
**Problem:** No `ErrorBoundary` exists anywhere; a single render error white-screens the
whole app.
**Non-destructive plan:**
- Add a new `components/ui/ErrorBoundary.jsx` (class component with
  `getDerivedStateFromError` + a friendly fallback + "reload" action).
- Wrap the router `Outlet` in [AppShell.jsx](frontend/src/layouts/AppShell.jsx) and,
  optionally, each lazy route's `Suspense` boundary.
- Purely additive; no existing component changes behavior.
**Effort:** ~2–3 hrs · **Risk:** none · **Rollback:** remove the wrapper.

## A2. Make multi-write flows transactional
**Problem:** Register-voter / register-judge / register-respondent create a user, a
participant row, and an invitation record as **separate** calls
([invitation.service.js](backend/src/services/invitation.service.js)); a mid-sequence
failure orphans rows.
**Non-destructive plan:**
- Author Postgres RPC functions (`register_event_participant(...)`, etc.) in a **new**
  additive migration with a `_down`. They wrap the existing inserts in one transaction.
- Add a service path that calls the RPC; keep the current path in place behind a
  feature check until the RPC is verified in staging, then switch the default.
- No table changes; same columns, same results — just atomic.
**Effort:** ~1 day/module · **Risk:** low (old path retained) · **Rollback:** flip back to
the JS path.

## A3. Batch CSV participant import
**Problem:** [csv-import.service.js](backend/src/services/csv-import.service.js) loops
`for (const row of parsedData)` doing one insert per row — N round-trips, non-atomic.
**Non-destructive plan:**
- Add a bulk path: pre-hash passwords, `upsert` users in one call, bulk-insert
  participants in one call (reuse the A2 RPC if present).
- Keep the row-by-row path as a fallback for the error-reporting detail it produces;
  choose bulk when the row count exceeds a threshold.
**Effort:** ~1 day · **Risk:** low · **Rollback:** default back to the loop.

---

# Phase B — Frontend architecture (P1)

## B1. Introduce TanStack Query (incremental adoption)
**Problem:** No data-fetching library; every page hand-rolls `useEffect` + `useState` +
manual loading/error/refetch. Symptoms in-tree: the dashboard N+1, request waterfalls,
no caching/dedup, and **zero** `AbortController` usage (stale-response races mitigated
only by `alive` flags).
**Non-destructive plan (page-by-page, never big-bang):**
1. Add `@tanstack/react-query` + a `QueryClientProvider` at the app root. This changes
   nothing until a page opts in.
2. Wrap the existing service calls in `useQuery`/`useMutation` **one page at a time**,
   starting with a low-risk read-only page (a dashboard). The service layer
   (`*.service.js`) is unchanged — Query just calls it.
3. Migrate hot pages next (participants, live control) to get caching + cancellation.
4. Leave un-migrated pages on the old pattern indefinitely; both coexist.
**Effort:** ~0.5 day setup + ~1–2 hrs per page · **Risk:** low, isolated per page ·
**Rollback:** revert the individual page.

## B2. Shared accessible `<Modal>` primitive
**Problem:** 18 `fixed inset-0` overlays (e.g. the CSV preview modal) with no focus trap,
Escape-to-close, `aria-modal`, or scroll-lock.
**Non-destructive plan:**
- Build `components/ui/Modal.jsx` (focus trap, Escape, `role="dialog"`,
  `aria-modal`, backdrop click, body scroll-lock).
- Adopt it **one modal at a time**, starting with the CSV preview modals we already
  touched. Existing modals keep working until migrated.
**Effort:** ~half day for the primitive + minutes per modal · **Risk:** none.

## B3. Decompose the largest page components
**Problem:** `CompetitionWorkspacePage.jsx` (**1,278 lines**),
`CompetitionLiveControlPage.jsx` (**1,028**) mix data loading, sockets, and several tab
UIs in one file.
**Non-destructive plan:**
- Pure structural extraction: move each tab into its own file and pull data logic into
  hooks (`useWorkspaceFoundation`, etc.). Same rendered output, same props.
- Do it behind the existing tests; no behavior change.
**Effort:** ~1 day each · **Risk:** low (mechanical) · **Rollback:** revert.

---

# Phase C — Backend & database (P2)

## C1. Composite index for the hot participant query
**Problem:** Dashboard/aggregate queries filter `event_id IN (...) AND participant_type =
X [AND has_voted/has_scored/has_responded]`, but the index is on `participant_type`
alone.
**Non-destructive plan:**
- New additive migration (`CREATE INDEX IF NOT EXISTS`) adding
  `(event_id, participant_type, has_voted)` and the scored/responded equivalents, with a
  `_down` that `DROP INDEX IF EXISTS`.
- Indexes only speed reads; nothing else changes.
**Effort:** ~1 hr · **Risk:** none · **Rollback:** drop the index.

## C2. Fold the dashboard N+1 into the endpoint
**Problem:** [OrganizerDashboardPage.jsx](frontend/src/pages/organizer/OrganizerDashboardPage.jsx)
fires one `getActiveSession` request per competition event.
**Non-destructive plan:**
- Add an `activeSessions` array to the existing organizer-dashboard payload (additive
  field). Keep the per-event endpoint for other callers.
- Switch the home page to read the new field; delete the client loop only after it's
  confirmed populated.
**Effort:** ~half day · **Risk:** low · **Rollback:** the field is ignored if unused.

## C3. Real pagination + server-side search for participant lists
**Problem:** `listVoters` is hard-capped at `limit: 500` with pagination noted as "not yet
built"; large events will silently truncate.
**Non-destructive plan:**
- Add optional `?cursor=&search=&<facet>=` params to the existing list endpoints
  (defaults preserve today's behavior). The `FilterBar` UI already exists to drive them.
- `useTableFilter` gains an optional "server mode" that defers to the API when a list is
  large; small lists stay client-side.
**Effort:** ~1–2 days · **Risk:** low (params are optional) · **Rollback:** ignore params.

## C4. Document the in-memory cache assumption (and a Redis path)
**Problem:** Dashboard + 7 other services use per-instance `Map` caches — cold/inconsistent
across restarts or multiple dynos.
**Non-destructive plan:**
- Short term: add a one-line note in each cache module stating "single-instance only".
- If scaling: introduce a tiny cache interface with a Redis implementation; the `Map`
  stays the default. No call sites change.
**Effort:** note = minutes; Redis = ~1 day if needed · **Risk:** none.

---

# Phase D — UI/UX & design polish (P2)

## D1. Standardize loading & empty states
Mixed `PageLoader` / skeleton / `return null`. Add a small set of shared skeletons that
match final layouts (less layout shift). Adopt per page; additive.

## D2. Mobile audit
The stepper, stage footer, and wide tables need a phone-width pass; collapse tables to
cards under `sm`. Additive CSS/markup, no logic change.

## D3. Bundle trim
Main chunk is ~646 KB. Lazy-load the heaviest admin/live pages (routes already split),
and audit `date-fns`/icon imports for tree-shaking. Measure with `vite build` before/after.

---

# Phase E — Cross-cutting quality (P2)

## E1. Frontend tests
39 tests exist but all backend. Add Vitest + Testing Library and cover the new
lifecycle-lock helpers (`isSetupLocked`/`isParticipantsLocked`) and `useTableFilter`
facet logic first. Additive; wire into the existing frontend CI.

## E2. Observability
`console.error` is the only error signal (60+ sites). Add structured logging on the
backend and an error tracker (e.g. Sentry) on both ends. Additive; no behavior change.

---

## Suggested order (safest first)

1. **A1** error boundary — hours, zero risk.
2. **C1** composite index + **C2** dashboard N+1 — quick, read-only wins.
3. **A2 / A3** transactional register + batch import — prevents data corruption; old
   paths retained during rollout.
4. **B1** TanStack Query — start on one dashboard, expand gradually.
5. **B2** modal primitive, **E1** frontend tests — parallelizable, low risk.
6. **B3 / C3 / D / E2** — as capacity allows.

## What this plan deliberately avoids

- No table drops, column renames, or row-mutating migrations.
- No big-bang framework rewrite; every cross-cutting change is opt-in per page/module.
- No change to the working auth/CSRF model.
- No removal of an existing code path until its additive replacement is verified.

Each phase is independently shippable and reversible.
