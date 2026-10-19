# Phase 2 — Child Competition Identity and Explicit Entry Participation

Completed October 13, 2026. Phase 3 has not started.

## A. Implementation summary

Added an independent child competition entity, explicit master-entry participation, and explicit legacy-context provenance. The new backend API supports listing/creating children, mapping a legacy event, and listing/creating participation records. No child configuration, judge assignment, scoring session, tabulation or results integration is implemented in this phase.

The feature is disabled unless `COMPETITION_CHILD_CONTEXTS_ENABLED=true` is explicitly supplied to the backend process. No environment file was changed. With it disabled, existing routes do not query the new tables, preserving operation against the configured database without migration 103.

With it enabled, the compatibility guard allows event-only competition operations only for an unmapped event with zero children or a single explicitly mapped legacy competition. A native child, missing/inconsistent mapping, or multiple children rejects those operations instead of picking an arbitrary context. Parent event details, branding and master-entry CRUD remain parent-scoped. New child endpoints always require explicit competition identity and organizer ownership.

The route guards are compatibility boundaries, not judge/live/tabulation integrations. No judge selector, sheet layout, score input, save/lock behavior, scoring formula, deduction calculation or result presentation was changed.

## B. Files changed

### Added

| File | Purpose |
| --- | --- |
| `backend/src/database/migrations/103_competition_child_identity.sql` | Three additive tables, context integrity guards, private privileges, and transactional create/participation/mapping RPCs. No automatic backfill. |
| `backend/src/modules/competition-context.js` | Disabled-by-default feature switch, explicit legacy context resolution and legacy permission applicability. |
| `backend/src/services/competition-child.service.js` | Organizer authorization, validated IDs/names/numbers, new entity reads, transactional writes, and fail-closed database error handling. |
| `backend/src/middleware/competition-context.js` | Opt-in rejection of ambiguous legacy operations. Judge enrollment is verified before context inspection; disabled mode performs no new queries. |
| `backend/src/routes/competition-child.routes.js` | New organizer identity and participation endpoints. |
| `backend/scripts/test-competition-child.mjs` | Actual PostgreSQL integration checks in a fresh disposable clone; fixed localhost/port, verified workspace cluster and recent metadata preflight. No .env or Supabase access. |
| `backend/__tests__/modules/competition-context.test.js` | Eight compatibility/permission-isolation tests. |
| `backend/__tests__/services/competition-child.test.js` | Sixteen API/service/guard tests, including the actual existing organizer router with its prior payload preserved. |
| This document and adjacent JSON evidence | Catalog inventories, isolated target identity, source preservation, scenario results and historical fingerprints. |

### Modified

| File | Change |
| --- | --- |
| `backend/src/routes/pageant-organizer.routes.js` | Mounts child routes and the opt-in compatibility boundary. Existing handlers remain intact. |
| `backend/src/routes/pageant-judge.routes.js` | Adds only the opt-in legacy-context safety boundary. Existing enrollment/scoring handlers remain intact. |
| `backend/src/routes/reports-organizer.routes.js` | Adds the boundary only to competition reports. Election and polling report routes remain unchanged. |
| `backend/src/modules/competition-legacy-preflight.js` | Inventories the new tables, same-event references, optional 103 capability, new guards/constraints/signatures. No new capability is required for a legacy schema without child tables. |
| `backend/src/database/scripts/competition-preflight-catalog.sql` | Includes child tables and their private permissions in SELECT-only metadata inspection. |
| `backend/scripts/competition-preflight.mjs` | Adds ordering for the explicit mapping table, which has `event_id` rather than an `id` column. |

Workspace changes from earlier work remain preserved. [source-preservation.json](source-preservation.json) compares 600 pre-existing backend/frontend/shared source files with the start-of-phase hashes. Its five changed existing `backend/src` files match the three route files and two preflight files above. The separate preflight CLI also changed as listed. Every frontend source file, election/polling source file, calculation engine and judge-table source is unchanged.

## C. Database changes

Migration 103 requires the reviewed through-102 foundation. It fails if the expected ownership/creation/revision dependencies are absent. It uses a transaction and does not execute mapping/backfill.

```text
events (existing parent)
  ├── competitions
  │     └── competition_entries ──> competition_contestants (existing master)
  └── competition_legacy_contexts ──> one explicit legacy competition
```

### Child competition

`competitions`: UUID primary key, parent event FK, name, optional type, immutable origin (`native` / `legacy`) and creation timestamp.

- Every child references exactly one parent event.
- Case-insensitive trimmed name uniqueness within the parent event.
- At most one legacy-origin child per event.
- Composite `(id,event_id)` uniqueness supports same-parent association FKs.
- A relation trigger rejects election/polling parents and immutable identity/origin changes.

### Participation

`competition_entries`: UUID primary key, parent event, child competition, existing master contestant, independent positive entry number, optional preserved legacy display number and creation timestamp.

- Composite FK `(competition_id,event_id)` ensures the child belongs to that parent.
- FK to the existing master contestant retains its identity.
- Trigger rejects a master from another event, including direct table writes.
- Unique `(competition_id,contestant_id)` prevents duplicate enrollment.
- Unique `(competition_id,entry_number)` protects independent numbering.
- The mutation RPC locks parent then child, serializes automatic-number selection and returns the existing participation on an identical retry.
- A retry supplying a different number for an existing participation returns a conflict; it does not overwrite it.
- No entry is enrolled into every child automatically.
- Existing authorized draft master deletion cascades only that master's new participation associations. Historical/frozen master deletion remains governed by the existing guards. This preserves existing draft CRUD behavior rather than making mapped drafts undeletable.

### Legacy provenance

`competition_legacy_contexts`: one row per mapped event, a unique child ID, mapping actor and mapping timestamp. Composite FK requires matching event/child identity. Trigger requires a legacy-origin child and makes parent/child identity immutable.

### Transactional operations and access

- `competition_create_child`: explicit stable request UUID; identical retries return the same child, conflicting payloads reject.
- `competition_add_entry`: explicit competition/master IDs and optional independent number; duplicate/retry/race handling is transactional.
- `competition_map_legacy_event`: explicit mapping and association operation; no historical writes or calculations.
- Every RPC rechecks parent ownership, active organizer identity, event type and applicable draft/frozen state under a parent row lock.
- New tables have RLS enabled; PUBLIC, anon and authenticated table access is revoked. Mutating RPC execution is granted only to service_role. Browser callers use existing authenticated backend routes.
- New draft child/participation writes advance existing setup/input revisions. An in-flight legacy publication reviewed before the new context existed therefore fails the existing revision check. Mapping/backfill does **not** increment historical event revisions.
- No scoring/configuration columns were added to existing competition tables. Existing function definitions, scoring engines and snapshot payloads remain intact.

`CREATE TABLE/INDEX IF NOT EXISTS`, guarded trigger creation and `CREATE OR REPLACE` definitions make reruns safe for the tested matching schema. The integration suite proves rerun IDs/rows stay unchanged. This is not permission to repair schema drift automatically: an incompatible existing shape must be investigated through preflight.

## D. Legacy mapping

Mapping is explicit: it is not performed by GET requests or migration 103. The integration harness invokes the mapping RPC only in its new disposable clone.

1. Lock and authorize the existing event.
2. If an explicit mapping already exists, reuse its stable child ID.
3. Otherwise require an empty child set, create one legacy child, and record its event/child mapping and actor.
4. Reuse each existing master entry through one participation row in that legacy child.
5. Repeated mapping retains participation IDs and numbers; newly discovered masters can be associated on an explicit subsequent mapping request.
6. Do not infer a legacy child from an existing native child or choose the first child from a list.

Some old pageants reuse contestant number 01 in different divisions. The new participation number is globally unique within its child competition; the old number is copied to `legacy_contestant_number`. Existing master numbers, IDs, judge-sheet display and historical JSON remain unchanged.

Existing event-wide judge permissions apply only to the explicit mapped legacy child. They do not become grants for native children. This is expressed by `legacyPermissionApplies()` and tested; actual native child judge assignments remain Phase 3 work. Multi-child legacy scoring routes fail closed until scoped integrations exist.

## New API contracts

Under `/api/organizer/competition/events/:eventId/competitions`:

| Method/path | Behavior |
| --- | --- |
| `GET /` | List children and explicit legacy mapping. |
| `POST /` | Create native child using `{id,name,competitionType?}`. Caller reuses `id` for a retry. |
| `POST /legacy-mapping` | Explicitly map an authorized legacy event and its master entries. Existing event lifecycle middleware remains applicable. |
| `GET /:competitionId/entries` | List only that child’s explicit associations. |
| `POST /:competitionId/entries` | Add `{contestantId,entryNumber?}`; omitted number is selected transactionally. |

No delete, rename, score configuration or scoring operation was added. The foundation API is intentionally disabled in the configured application pending deployment review. No frontend interface for these new contracts was introduced in Phase 2.

## E. Tests and verification

### Backend

Full suite: **74 files passed, one file skipped; 581 tests passed, three existing tests skipped**. There are 24 new Phase 2 unit/API tests. The actual existing organizer router returns the same single-competition foundation payload with the feature off and with a single mapped legacy context; ambiguous calls stop before the old service executes.

### Frontend

Full suite: **38 files / 259 tests passed**, using two workers and `VITE_LOCK_PARTICIPANTS_ON_ACTIVE=true` for that test process only.

Initial unrestricted parallel testing hit an election-form timeout. Reducing workers cleared it. The local roster-unlocking environment setting also conflicts with a test that assumes production locking; the assertion was reproduced in unchanged source and cleared by the process-only production-locking override. No election/polling code, frontend tests or .env files were changed to obtain this result.

### Actual PostgreSQL

**19 scenarios passed** in fresh disposable `votrix_child_1791877042044`, cloned from the existing local through-102 fixture. See [postgres-integration.json](postgres-integration.json).

- Actual schema/constraints/triggers/permissions/function inventory matched the recent template preflight before migration.
- Migration and explicit legacy mapping preserved fingerprints for all 25 original historical table inventories.
- Existing finalized/published calculations, rules, score values, locks, submitted snapshots and judge/entry identities remain unchanged.
- One and five native children; no implicit participation.
- Shared master identity with independent participation IDs and numbers.
- Duplicate membership and duplicate-number rejection through actual uniqueness constraints.
- Cross-event and missing-parent rejection through direct SQL and RPC paths.
- Stable child retry IDs; conflicting payload/name/ownership rejection.
- Concurrent duplicate participation requests return one ID; concurrent distinct requests receive distinct automatic numbers.
- Legacy duplicate per-division display numbers remain unchanged.
- Explicit mapping rejects native-child guessing; migration/mapping reruns preserve IDs.
- New draft identity invalidates a previously reviewed legacy publication through existing revision checks.
- Draft master removal preserves its existing behavior and removes only its associated participation.
- Election/polling parents reject child creation and mapping.
- Frozen parent setup rejects new ordinary child/participation writes.
- New private tables and RPCs deny anon/authenticated direct access.
- Operation rollback leaves no new child; final historical fingerprints still match the original clone.

The initial harness division fixtures omitted existing required registration settings; they were corrected in the synthetic test harness, not in application guards. The final 19-scenario run passes.

The after-migration catalog preflight inspected 28 tracked tables and returned **zero blockers**, including optional capability 103, its constraints, guards and RPC permissions. See [child-preflight.json](child-preflight.json). Twelve older sparse-fixture metadata/revision review items remain historical and unchanged.

The original template was inspected again afterward: all 25 table fingerprints still match, proving the source fixture was not migrated or backfilled. See [template-after.json](template-after.json).

`git diff --check` and JavaScript syntax checks passed.

## F. Database safety and rollback

Executed locally only:

- Read-only metadata inspection of the workspace fixture.
- Creation of new disposable local clones after confirming actual workspace cluster directory, localhost/port and recent catalog preflight.
- Migration 103, its rerun, explicit legacy mapping and synthetic integration transactions inside those clones.

**Not executed against configured Supabase:** migrations, mapping/backfill, repairs, recalculation, data mutations or destructive operations. This phase's integration runner never imports .env or connects to Supabase. The local schema is not asserted to represent deployed Supabase.

The local cluster was initially stopped, started for verification, then restored to the stopped state. Disposable databases and sanitized evidence are retained for inspection; no source database was dropped.

Rollback strategy is non-destructive: disable the feature and keep the additive tables/data. Existing APIs then bypass child-table reads. Do not automatically drop populated child/mapping/participation tables. SQL operation rollback was verified in the disposable clone; schema rollback after deployment requires an independently reviewed backup/restore plan.

The Phase 1 deployed-catalog limitation remains a **production deployment blocker**. The configured project's actual FK/trigger/ACL/function metadata and a recoverable backup with a tested restore procedure must be verified before any deployment. Nothing in this phase grants production migration approval.

## G. Remaining risks and limitations

- Deployed SQL catalog and restore procedure remain unverified; the feature stays disabled by default.
- The local fixture has historical score/result examples but is not a current production clone. Hosted Supabase/PostgREST integration and actual browser acceptance for new child endpoints remain unverified.
- The three existing skipped backend assertions are not claimed as passing.
- Parent locking is deliberately conservative: requests in different children serialize on the parent. It avoids races now; optimize only alongside future competition-specific revisions and atomic operation boundaries.
- Full independent scoring configuration, judges, sessions, tabulation and results do **not** exist yet for native children. Unsupported event-only paths are blocked when opted in.
- Parent master CRUD does not implicitly enroll a new master into native children. Participation remains explicit. Reconciliation of future legacy roster changes must retain that distinction.
- Existing historical calculation conflicts and incomplete-tabulation visibility are untouched. Old rules/results are not silently converted to a new interpretation.
- No frontend redesign, election/polling change, scoring-engine change, deduction change or judge-sheet change is included.

## H. Phase 3 dependencies

Next phase, after approval: competition-scoped configuration, rules, assignments and operation authorities. Required preparation includes:

1. Use the stable child and participation IDs as the only authoritative new context keys.
2. Keep immutable legacy rules/results attached through explicit mapping, never by rewriting their JSON payloads.
3. Scope revisions, judge grants, configuration, deductions and subsequent sessions by competition. Event-wide legacy assignments must not leak into native children.
4. Extend publication and write transactions with context checks; retain Phase 2's stale-publication protection.
5. Treat `round_id=NULL` as a real single phase and implement scoped uniqueness accordingly.
6. Preserve both existing calculation engines and the table-format judge sheet. New semantic changes require explicit versioned rules.
7. Keep unsupported event-only operations blocked until their complete scoped replacements are tested.
8. Keep production deployment gated on the separate catalog/backup/restore review.

STOP: await approval before Phase 3.
