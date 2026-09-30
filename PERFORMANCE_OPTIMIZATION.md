# VOTRIX Production Performance Optimization

## Scope and goals

This document is a production performance plan for the existing Votrix application. It prioritizes:

- Lower API latency and database work.
- Bounded memory and CPU usage as events, voters, answers, and audit records grow.
- Fewer React renders and less client-side data processing.
- Horizontal scalability without changing product behavior or authorization rules.
- Measurable, reversible changes with clear rollout gates.

The recommendations are based on the current implementation. Items marked **confirmed** are visible in the code path. Items marked **validate** should be confirmed with production-like load and query plans before changing behavior.

## Executive priorities

| Priority | Area                 | Finding                                                                                                                       | Impact                                                                                     | Action                                                                                                  |
| -------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| P0       | Poll analytics       | **Confirmed:** every answer for every question is loaded into Node, then the full answer array is filtered once per question. | High memory use and O(questions x answers) CPU; latency grows with poll size.              | Aggregate/group answers once, paginate long text responses, and move summary calculations into SQL/RPC. |
| P0       | Admin analytics      | **Confirmed:** dashboard analytics selects timestamp rows from entire vote, score, and answer tables.                         | Response size and Node memory grow with historical activity.                               | Replace raw-row reads with database-side daily/monthly aggregates and bounded time windows.             |
| P0       | Horizontal scale     | **Confirmed:** rate limiting defaults to `express-rate-limit` MemoryStore.                                                    | Limits are per instance and memory grows with key cardinality.                             | Use a shared Redis-compatible store and configure proxy trust explicitly.                               |
| P1       | Polling registry     | **Confirmed:** registry data is reloaded for multiple operations in one request flow.                                         | Repeated database round trips on question CRUD and analytics.                              | Add a short TTL cache with versioned invalidation after custom-type writes.                             |
| P1       | Voter lists          | **Confirmed:** scope filtering occurs after fetching a page.                                                                  | A page can contain fewer results than requested and totals are incorrect for scoped users. | Apply scope predicates in SQL or paginate over a scoped database view/RPC.                              |
| P1       | Frontend data flow   | **Confirmed:** only a small set of pages use React Query; many pages still use local effect/state fetching.                   | Duplicate requests, inconsistent cache behavior, and unnecessary loading/render cycles.    | Migrate list/detail reads to query hooks with stable keys and server pagination.                        |
| P1       | Media and exports    | **Validate:** object URLs and large exports can retain browser memory when cleanup is delayed or absent.                      | Memory pressure during repeated uploads/downloads.                                         | Revoke preview/download URLs deterministically and stream large exports.                                |
| P2       | Bundle and rendering | **Confirmed risk:** Vite build configuration has no explicit chunk strategy; charts and feature modules are large candidates. | Slower first load and parse/compile time.                                                  | Lazy-load route-heavy modules, charts, editors, and admin-only surfaces; inspect bundle output.         |

## Evidence from the current code

### Backend

- [`backend/src/services/polling.service.js`](backend/src/services/polling.service.js) `getPollAnalytics` loads all answers for all questions, then calls `.filter()` for each question. This is both a transfer problem and a repeated CPU allocation problem.
- [`backend/src/services/polling.service.js`](backend/src/services/polling.service.js) `listQuestions` loads the complete question set and all options. This is acceptable for small polls but becomes an unbounded response for large events.
- [`backend/src/services/dashboard.service.js`](backend/src/services/dashboard.service.js) `getAdminAnalytics` selects `created_at` from complete vote, score, and answer tables. The database should calculate time buckets instead of sending every timestamp to Node.
- [`backend/src/services/election.service.js`](backend/src/services/election.service.js) `listEventVoters` fetches a page and applies organizer scope filtering in JavaScript. Filtering must happen before pagination for stable pages and correct counts.
- [`backend/src/services/polling-registry.service.js`](backend/src/services/polling-registry.service.js) loads system and organization registry rows on every call. `findQuestionType` calls the full loader before finding one key.
- [`backend/src/middleware/rateLimiter.js`](backend/src/middleware/rateLimiter.js) documents and uses the in-memory default store. This is not suitable for multiple API instances.
- [`backend/src/database/migrations/019_phase9_indexes_and_optimizations.sql`](backend/src/database/migrations/019_phase9_indexes_and_optimizations.sql) already adds several useful indexes. New indexes should be justified with `EXPLAIN (ANALYZE, BUFFERS)` rather than added speculatively.

### Frontend

- [`frontend/src/app/queryClient.js`](frontend/src/app/queryClient.js) has sensible conservative defaults, but React Query is only adopted by a few dashboard pages. The remaining effect-based fetches should converge on one cache and cancellation model.
- [`frontend/src/pages/organizer/polling/PollingDashboardPage.jsx`](frontend/src/pages/organizer/polling/PollingDashboardPage.jsx) invalidates the dashboard query on socket events. Use targeted cache updates where the event payload contains the changed count; reserve invalidation for events that cannot be reconciled locally.
- [`frontend/src/components/upload/ImageUploadField.jsx`](frontend/src/components/upload/ImageUploadField.jsx) uses `URL.createObjectURL(file)`. Every preview URL must be revoked on replacement and unmount.
- [`frontend/vite.config.js`](frontend/vite.config.js) has an empty `build` block. Route-level lazy loading may already exist in the router, but bundle output should be measured and explicit chunk boundaries added only where the report confirms value.
- [`frontend/src/main.jsx`](frontend/src/main.jsx) runs under `StrictMode`, which intentionally exposes unsafe effects during development. Production does not double-render this way, but effect cleanup still matters for sockets, timers, and document listeners.

## Production-ready code patterns

These examples preserve the existing API contracts conceptually. Adapt names and response shapes to the route layer, then cover them with the existing Vitest suites.

### 1. Group poll answers in one pass

This immediately removes repeated full-array scans from `getPollAnalytics`. It does not yet solve the database transfer size; the SQL aggregation below should follow for very large polls.

```js
const answersByQuestion = new Map();
for (const answer of allAnswers ?? []) {
  let questionAnswers = answersByQuestion.get(answer.question_id);
  if (!questionAnswers) {
    questionAnswers = [];
    answersByQuestion.set(answer.question_id, questionAnswers);
  }
  questionAnswers.push(answer);
}

const questionAnalytics = questions.map((question) => {
  const questionAnswers = answersByQuestion.get(question.id) ?? [];
  const typeDef = registryByKey.get(question.type) ?? null;

  const stats = buildAnalytics({
    question,
    answers: questionAnswers,
    options: question.options,
    typeDef,
    typeConfig: question.typeConfig ?? {},
    anonymous,
  });

  return {
    questionId: question.id,
    question: question.question,
    type: question.type,
    typeLabel: typeDef?.label ?? question.type,
    responseCount: questionAnswers.length,
    ...stats,
  };
});
```

Also create `registryByKey` once:

```js
const registryByKey = new Map(registry.map((type) => [type.key, type]));
```

### 2. Bound analytics reads

Keep summary statistics separate from detail responses. The summary endpoint should return counts, distributions, and completion metrics. Text responses and respondent names should be loaded through a paginated endpoint such as:

```http
GET /events/:eventId/analytics/questions/:questionId/responses?page=1&limit=50
```

Enforce server limits even when the client supplies query parameters:

```js
const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
const limit = Math.min(
  100,
  Math.max(1, Number.parseInt(req.query.limit, 10) || 50),
);
const from = (page - 1) * limit;
const to = from + limit - 1;
```

Do not return unbounded `answer` text, audit details, or export rows from a dashboard request.

### 3. Database-side poll analytics

For counts and average completion time, use a SQL function or a view/RPC so rows are aggregated close to the data:

```sql
create or replace function poll_event_summary(p_event_id uuid)
returns table (
  total_submissions bigint,
  average_completion_seconds numeric
)
language sql
stable
as $$
  select
    count(*)::bigint,
    round(avg(extract(epoch from (completed_at - started_at)))::numeric, 0)
  from poll_submissions
  where event_id = p_event_id
    and started_at is not null
    and completed_at is not null;
$$;
```

For per-question counts, return grouped rows keyed by `question_id`. Keep raw answers only for the paginated detail endpoint. Verify the function against RLS and the existing authorization checks before deployment.

### 4. Cache the question-type registry safely

Use a bounded process-local cache as a first step. It reduces duplicate reads on one instance without introducing cross-instance invalidation risk. For multiple instances, use Redis or a database version key.

```js
const registryCache = new Map();
const REGISTRY_TTL_MS = 5 * 60 * 1000;

export async function loadQuestionTypeRegistryCached(organizationId = null) {
  const key = organizationId ?? "system";
  const cached = registryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await loadQuestionTypeRegistry(organizationId);
  registryCache.set(key, { value, expiresAt: Date.now() + REGISTRY_TTL_MS });
  return value;
}

export function invalidateQuestionTypeRegistry(organizationId = null) {
  registryCache.delete(organizationId ?? "system");
}
```

Call invalidation after create, update, activate, and delete operations. Add a maximum cache size or use an LRU if organization count is large.

### 5. Query React data with cancellation and bounded pages

Use one query key shape for list pages and let the query library cancel stale requests:

```jsx
function useEventVoters(eventId, page, search) {
  return useQuery({
    queryKey: ["event-voters", eventId, { page, search }],
    queryFn: ({ signal }) =>
      electionService.listVoters(
        eventId,
        { page, limit: 50, search },
        { signal },
      ),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}
```

The Axios service must pass `signal` to Axios. Search inputs should be debounced before they change the query key. Prefer server pagination and virtualization for tables over rendering thousands of rows.

### 6. Revoke object URLs deterministically

```jsx
useEffect(() => {
  if (!file) {
    setPreview(null);
    return undefined;
  }

  const objectUrl = URL.createObjectURL(file);
  setPreview(objectUrl);

  return () => URL.revokeObjectURL(objectUrl);
}, [file]);
```

For downloads, revoke the URL after the anchor click and a short browser-safe delay. Do not retain blobs in React state after the download completes.

### 7. Explicit production chunking

First measure `dist/assets` and a bundle visualizer. Then lazy-load expensive route surfaces:

```js
const AnalyticsPage = lazy(
  () => import("./pages/organizer/polling/PollingAnalyticsPage.jsx"),
);
const AdminReportsPage = lazy(() => import("./pages/admin/ReportsPage.jsx"));
```

Keep shared UI and the authentication shell in the initial chunk. Do not force every route into a separate chunk; too many tiny chunks increase request overhead.

## Scalability architecture

### Database and API

1. **Pagination everywhere:** enforce maximum page sizes at controllers, use stable `(created_at, id)` ordering, and return `{ data, meta }` with a total only when the count is required. Counts can be expensive; expose an approximate or deferred count for very large tables.
2. **Filter before page:** move organizer scope, event ownership, participant type, status, and search predicates into SQL/RPC. Never fetch a page and then discard most rows in Node.
3. **Select columns explicitly:** avoid `.select('*')` on list and dashboard paths. Return only fields used by the response mapper.
4. **Avoid N+1 authorization reads:** combine ownership checks with the primary query where possible, or load reusable event context once per request.
5. **Use database aggregation:** dashboard totals, turnout, response counts, and time buckets should be `COUNT`, `AVG`, and grouped queries, not raw row transfers.
6. **Indexes follow plans:** validate existing composite indexes and add only indexes that match real predicates and ordering. Monitor write amplification and index storage.
7. **Exports are jobs:** large CSV/XLSX/PDF exports should be queued, streamed, or generated asynchronously with a status endpoint. Never build an unbounded export in the request heap.

### Caching

- Browser/server query cache: short TTL for dashboards and event configuration.
- Shared Redis cache: registry metadata, immutable public event configuration, and precomputed dashboard summaries.
- Invalidation: event-scoped keys after writes; TTL as a backstop.
- Never cache authorization-sensitive responses without including tenant, organizer, role, and event scope in the key.
- Avoid caching volatile vote totals for long periods; use socket updates or short TTLs with explicit invalidation.

### Horizontal scaling

- Replace the rate limiter MemoryStore with a Redis store shared by all API instances.
- Confirm WebSocket room behavior under multiple instances. Add a pub/sub adapter so an event emitted by instance A reaches clients connected to instance B.
- Use a load balancer with WebSocket upgrade support, health checks, and connection draining during deploys.
- Keep API instances stateless: no correctness-critical in-memory queues, sessions, locks, or caches.
- Move deletion processing, report generation, email delivery, and image cleanup to durable workers with retries and idempotency keys.
- Set explicit timeouts, payload limits, and concurrency limits for database, Cloudinary, email, and external service calls.

### Memory and reliability

- Bound every array loaded from the database, every upload, every export, and every queue.
- Use `Promise.all` only for independent, bounded work. Use a concurrency limiter for many image or email operations; unbounded `Promise.all` can exhaust sockets and memory.
- Ensure every timer, DOM listener, WebSocket listener, and subscription has cleanup. Confirm the existing socket, polling, and schedule-sync timers during shutdown.
- Add graceful shutdown: stop accepting requests, close WebSocket connections, stop recurring timers, drain workers, and then exit.

## Frontend rendering plan

1. Migrate high-traffic list/detail pages to React Query first. Use stable query keys, `enabled` guards, request cancellation, and placeholder data.
2. Virtualize candidate, voter, judge, audit, notification, and response tables when the visible row count can exceed roughly 200.
3. Keep row components pure and memoized only after profiling shows parent rerenders are costly. Pass stable primitive props instead of freshly created objects/functions where possible.
4. Keep form state local to the form. Do not put every keystroke into global Zustand state or cause the whole page to rerender.
5. Lazy-load Recharts, XLSX/reporting code, rich editors, and organizer/admin-only modules.
6. Use image dimensions, responsive sizes, lazy loading, and Cloudinary transformations to prevent oversized candidate/banner assets from entering the browser.
7. Avoid invalidating whole dashboards for events that can update one cached statistic. Update the relevant query data when socket payloads are complete; invalidate when they are not.

## Measurement and validation

### Baseline before changes

Capture p50/p95/p99 latency, error rate, response bytes, database time, Node heap, event-loop lag, and frontend LCP/INP for:

- Organizer dashboard.
- Poll question builder.
- Poll analytics with 10, 100, and 1,000 questions/answers per question.
- Election voter list at 10K and 100K participants.
- Admin analytics over the full historical dataset.
- Login, refresh, vote submission, poll submission, and WebSocket reconnect.

### Required checks

```bash
cd frontend
npm run lint
npm run test
npm run build

cd ../backend
npm test
```

For database changes, capture before/after `EXPLAIN (ANALYZE, BUFFERS)` plans and test with production-like row counts. For frontend changes, compare the built asset sizes and use browser performance traces on a throttled mobile profile.

### Suggested load scenarios

- 1,000 concurrent dashboard reads with a warm cache.
- 100 concurrent analytics reads against a large poll.
- 500 concurrent submissions with rate-limit and idempotency checks enabled.
- 10,000 WebSocket clients distributed across at least two API instances.
- Repeated upload/preview/download workflows while monitoring browser heap.

## Phased rollout

### Phase 1: low-risk hot-path fixes

- Group answers once in Node and build registry maps once per request.
- Add object URL cleanup.
- Add request cancellation and server page-size caps.
- Replace obvious `.select('*')` list reads with explicit columns.
- Add dashboards and alerts for latency, heap, event-loop lag, and database time.

### Phase 2: bounded data contracts

- Add paginated question responses and large respondent lists.
- Move organizer scope filtering into SQL/RPC.
- Replace admin raw timestamp reads with grouped database summaries.
- Add virtualization to large tables and lazy-load charts/reporting modules.

### Phase 3: scale-out infrastructure

- Deploy shared Redis rate limiting and cache invalidation.
- Add WebSocket pub/sub across instances.
- Move exports, cleanup, email, and other long-running work to workers.
- Add connection, request, upload, and concurrency budgets.

### Phase 4: data-volume optimization

- Add SQL/RPC analytics summaries and optional materialized views for historical charts.
- Partition or archive high-volume immutable tables only after query and retention requirements are measured.
- Revisit indexes quarterly using real query plans and index usage statistics.

## Definition of done

- No dashboard or analytics endpoint transfers an unbounded historical table to Node.
- Every list endpoint has a server-enforced page size and stable ordering.
- Scoped lists filter before pagination and report correct totals.
- Poll analytics memory remains bounded as answer volume grows.
- Rate limits and WebSocket events work consistently across multiple instances.
- Frontend route chunks and table rendering are measured on target devices.
- Load tests meet agreed p95 latency and error-budget targets without functional or authorization regressions.
