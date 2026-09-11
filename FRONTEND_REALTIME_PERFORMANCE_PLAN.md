# Frontend Real-Time & Performance Plan

Goal: pages load smooth and fast without needing a manual refresh — especially
**Live Control** and **Judge Scoring**. Approach chosen: **hot path first** using
**TanStack Query** as the caching layer, with WebSocket events converted from
"refetch everything" into **granular cache patches**.

---

## Root causes (verified in code)

| # | Problem | Where | Effect |
|---|---------|-------|--------|
| 1 | No cache layer — every page does `useState` + `useEffect` + `fetch` + `setLoading(true)` (19 pages) | all pages | Navigate away/back = full refetch + full-page spinner every time |
| 2 | Every socket event calls `loadSession()` → refetches **3 endpoints in full** | [CompetitionLiveControlPage.jsx](frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx) L52, L100–108 | Live control thrashes under many judges; flicker/lag |
| 3 | Judge page refetches full `getSessionView` on **every** socket event | [JudgeScoringPage.jsx](frontend/src/pages/voter/JudgeScoringPage.jsx) L206–260 | Scoring feels laggy; loses in-progress UI state |
| 4 | Full-page spinner replaces content on load | `useDelayedLoading` + `LoadingSpinner` | Every navigation feels like a hard reload |
| 5 | Socket closes on token refresh; no room re-subscribe after reconnect | [socket.service.js](frontend/src/services/socket.service.js) | Live updates silently die → user must refresh |
| 6 | No optimistic updates on score submit | JudgeScoringPage | Score waits for full round-trip |

---

## Phase 0 — Foundation (data layer + socket hardening)

### 0.1 Add TanStack Query
- `npm i @tanstack/react-query` (+ `@tanstack/react-query-devtools` as dev dep).
- Create `frontend/src/app/queryClient.js` with defaults:
  - `staleTime: 30_000` (list/dashboard), `gcTime: 5 * 60_000`
  - `refetchOnWindowFocus: false` (we drive freshness via sockets), `retry: 1`
- Wrap the tree in `Bootstrap.jsx` with `<QueryClientProvider>`; mount devtools in dev only.

### 0.2 Harden `socket.service.js`
- Track subscribed rooms in a `Set`; on `onopen`, re-send `subscribe` for every
  tracked room. **This is the actual fix** — the WS authenticates from the cookie
  on connect ([ws-server.js:69](backend/src/websocket/ws-server.js)), so the
  existing close-and-reconnect on token refresh is *correct* (reconnect re-reads
  the fresh cookie). The bug is only that rooms are never re-subscribed after the
  reconnect, so updates silently stop. Keep the reconnect behavior; just add
  re-subscribe.
- Keep exponential backoff as-is.

### 0.3 Query-key + invalidation conventions
Create `frontend/src/app/queryKeys.js`:
```
session:        ['competition','session', eventId]
foundation:     ['competition','foundation', eventId]
event:          ['pageant','event', eventId]
judgeProgress:  ['competition','judgeProgress', eventId]
judgeSession:   ['competition','judgeSessionView', eventId, divisionId]
```

### 0.4 Reusable socket→query bridge hook
`frontend/src/hooks/useSocketQuerySync.js` — subscribes to a socket event and
either `invalidateQueries(key)` or applies a `setQueryData` patch, so pages stop
calling their own `loadX()`.

**Verify:** app boots, no console errors, socket reconnects and re-subscribes
after a forced disconnect, devtools shows cached queries.

---

## Phase 1 — Live Control (highest impact)

File: `frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx`

### 1.1 Split the monolithic `loadSession()` into 4 queries
- `useQuery(session)` → `getActiveSession(eventId)`
- `useQuery(foundation)` → `getFoundation(eventId)`
- `useQuery(event)` → `getEvent(eventId)`
- `useQuery(judgeProgress)` → `getJudgeProgress(eventId)`, **enabled only** when
  session status is `active`/`paused`.

Page renders from cached data immediately; background revalidation replaces the
full-page spinner. Keep `stageSel` local UI state seeded from `session` data.

### 1.2 Convert socket handlers to granular cache updates
- `session:status-changed` / `contestant-changed` / `round-changed` /
  `active-criteria-changed` / `division-changed` → invalidate **only** the
  `session` key (foundation + event stay cached — they rarely change mid-session).
- `session:judge-score-submitted` → **targeted invalidate of only the
  `judgeProgress` key.** NOTE: the backend payload is thin —
  `{ sessionId, roundId, contestantId, judgeId, locked }`
  ([competition-session.service.js:1335](backend/src/services/competition-session.service.js))
  — so it cannot rebuild a judge's "X of N scored" progress row on its own. We
  invalidate one lightweight endpoint instead of the current 3-endpoint full
  reload. (Optional later: enrich the backend payload to enable true patch-only.)

### 1.3 Mutations for controls
- Wrap start/pause/resume/complete/next/prev/set-contestant/stage-group/set-round
  in `useMutation`; on success invalidate the `session` key. Optionally
  optimistic status change for instant button feedback.

**Verify (test scenarios):**
1. Start session → judges see it live; organizer sees active state with no refresh.
2. Multiple judges submit → progress rows update one-by-one, no full-list flicker.
3. Next/prev contestant → updates live on judge screens.
4. Navigate away and back to Live Control → instant (cached), then quiet revalidate.
5. Kill network briefly → on reconnect, live updates resume without manual refresh.

---

## Phase 2 — Judge Scoring

File: `frontend/src/pages/voter/JudgeScoringPage.jsx`

### 2.1 Query for the session view
- `useQuery(judgeSession, [eventId, selectedDivisionId])` → `getSessionView`.
- Derive `scores` from `scoresFromSheet(data)` but keep **in-progress edits** in
  local state so a background revalidate never wipes what the judge is typing
  (merge: server values for untouched keys, local values for dirty keys).

### 2.2 Socket handlers → cache patches, not refetch
- `session:contestant-changed` / `round-changed` / `active-criteria-changed` /
  `division-changed` → invalidate `judgeSession` (targeted) instead of calling
  `getSessionView` inline five times.
- `session:status-changed` → update status from payload; only invalidate if it
  transitions into `active`.

### 2.3 Optimistic score submission
- `useMutation(submitJudgeSessionScore)` with `onMutate` writing the score into
  the cache immediately, `onError` rollback + push to the existing localStorage
  retry queue, `onSuccess` confirm. Fold the current manual retry-queue logic into
  the mutation's error path so behavior is preserved but centralized.

**Verify:**
1. Score a contestant → value shows instantly; confirms after save.
2. On-stage contestant changes from organizer → judge screen follows live, typed
   (unsaved) values for other contestants are not lost.
3. Submit offline → queued, banner shows, auto-flushes on reconnect.
4. Division switch → correct sheet loads, cached per division.

---

## Phase 3 — Roll out to the rest of the app (after hot path is verified)

- One thin query hook per service call for the remaining ~17 list/dashboard pages
  (`useEvents`, `useContestants`, `useCriteria`, dashboards, analytics, reports).
- Route-level **prefetch on link hover/focus** so pages are warm before click.
- Replace full-page spinners with skeletons that overlay cached content
  (leverage existing `Skeleton.jsx`).

## Phase 4 — Polish
- Remove now-dead manual-fetch code and `useDelayedLoading` where superseded.
- Tune `staleTime` per query; audit bundle/route-split; confirm no regressions.

---

## Files touched (Phases 0–2)

| File | Change |
|------|--------|
| `frontend/package.json` | add `@tanstack/react-query` (+ devtools dev dep) |
| `frontend/src/app/queryClient.js` | **new** — client + defaults |
| `frontend/src/app/queryKeys.js` | **new** — key factory |
| `frontend/src/app/Bootstrap.jsx` | wrap with `QueryClientProvider` |
| `frontend/src/services/socket.service.js` | room re-subscribe, graceful refresh |
| `frontend/src/hooks/useSocketQuerySync.js` | **new** — socket→cache bridge |
| `frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx` | queries + granular patches + mutations |
| `frontend/src/pages/voter/JudgeScoringPage.jsx` | query + patches + optimistic submit |

## Risk summary (honest)
Low-to-medium overall; every change is additive and reversible page-by-page, and
nothing touches the backend or auth.
- **Very safe:** Phase 0.1 (add Query + provider), Phase 0.2 (socket re-subscribe).
- **Safe:** Phase 1 queries + targeted invalidation, optimistic control buttons.
- **Medium — the delicate part:** Phase 2 merge of server data with in-progress
  typed scores (risk: a judge losing typed values if dirty-key tracking is wrong)
  and folding the offline retry queue into the mutation. Go slow here; test hard.

## Rollback
- Query layer is additive; the socket handler changes are per-page. Any page can
  revert to its old `loadX()` independently. Phase 0 socket hardening is
  backward-compatible and worth keeping regardless.

## Rule
Implement and verify each phase before starting the next (matches existing
`REVISED_FRONTEND_MIGRATION_ROADMAP.md` convention).
