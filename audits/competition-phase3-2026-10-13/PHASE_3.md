# Phase 3 — Competition-Scoped Configuration, Rules, Permissions and Revisions

Completed October 13, 2026. Phase 4 has not started. Native score submission, live sessions, tabulation and results are **not** implemented or enabled.

## A. Implementation summary

Native children now own configuration, explicit round/criterion/minor identities, judge assignments, immutable setup rule snapshots, and separate setup/input revisions. New setup APIs require event **and** competition identity. No event-wide configuration or empty-assignment fallback is used for native children.

The important revision isolation is verified in PostgreSQL: editing Hip-Hop leaves Contemporary Dance's setup revision, input revision and frozen rule validity unchanged. Adding a new sibling increments the existing parent topology revision but does not stale a frozen native sibling. Native rule validity compares only its own child revisions.

Both `COMPETITION_CHILD_CONTEXTS_ENABLED=true` and `COMPETITION_NATIVE_SETUP_ENABLED=true` are required for native setup/context metadata. Neither environment file nor deployed configuration was changed. Existing single-legacy APIs, calculation engines and judge table remain intact.

## B. Files changed

### Added

| File | Purpose |
| --- | --- |
| `backend/src/database/migrations/104_competition_scoped_rules.sql` | Native configuration projections, immutable rules, scoped revisions, explicit permissions, dependency triggers and transactional setup RPCs. |
| `backend/src/modules/competition-native-configuration.js` | Strict configuration validation; existing criteria-readiness and progression validation reused without score calculation. |
| `backend/src/services/competition-native.service.js` | Authenticated owner operations, child revision checks, atomic foundation reads, native context metadata, and explicit validation/error boundaries. |
| `backend/scripts/test-competition-native.mjs` | Real PostgreSQL verification in fresh workspace-only disposable clones. No .env, Supabase, mail or app startup. |
| `backend/__tests__/modules/competition-native-configuration.test.js` | Fourteen tests for methods, NULL single phase, scoped weights/ranges, equal-average minors and incompatible configuration rejection. |
| `backend/__tests__/services/competition-native.test.js` | Ten tests for flags, actor/context binding, acknowledgment/revisions, atomic foundation reads, fail-closed errors and no legacy fallback. |
| This report and JSON evidence | Schema inventories, integration results and source/historical preservation evidence. |

### Modified

| File | Change |
| --- | --- |
| `backend/src/routes/competition-child.routes.js` | Adds native foundation, configuration, assignment and rule-freezing endpoints. |
| `backend/src/routes/pageant-judge.routes.js` | Adds only an authorized native **context metadata** read before the existing legacy boundary. No native score endpoint. |
| `backend/src/modules/competition-legacy-preflight.js` | Optional 104 capability, correct native relation namespaces, source/dependency guards, signature and ACL checks. |
| `backend/src/database/scripts/competition-preflight-catalog.sql` | Includes native tables and shared users **metadata only**, so account dependency triggers can be inspected. No user record values are collected. |
| `backend/scripts/competition-preflight.mjs` | Stable ordering for native configuration rows keyed by competition ID. |

Migration 103 was not edited. Migration 104 replaces only its participation RPC's native revision behavior and retains legacy parent revision semantics. No existing scoring/deduction calculation function was replaced.

[source-preservation.json](source-preservation.json) checks 611 pre-existing source/script files. All frontend, election/polling, calculation-engine and judge-table files remain byte-identical. The five modified existing files are exactly those above; new files are additions. Pre-existing workspace edits were preserved.

## C. Database migration and relationships

104 requires reviewed 103 and runs transactionally. It adds three columns to the Phase 2 `competitions` table: `setup_revision`, `input_revision`, `official_child_rules_id`. Existing competition IDs and fields are retained; new counters initialize to 1. No historical rules or scores are backfilled.

New tables:

- `competition_child_configurations`: one declarative configuration per child.
- `competition_child_rounds`: explicit round IDs and ordered definitions owned by a child/event.
- `competition_child_criteria`: major definitions with a real NULL scope for single phase, or a composite FK to a round in the same child/event.
- `competition_child_minors`: minor definitions with a composite FK to their major criterion in the same child/event.
- `competition_child_judge_assignments`: existing participant ID, explicit child/event, optional authorized round; NULL means an explicit competition-wide grant.
- `competition_child_rule_versions`: immutable configuration, assignment and participation snapshots with child revisions and freeze provenance. Assignment snapshots preserve actual judge user IDs as well as participant IDs.

Composite FKs reject unrelated child/event/round/criterion references. Round IDs, criterion IDs and minor IDs are stable primary keys. Round ordering uniqueness is deferrable, permitting atomic reorder without changing identities. Assignment uniqueness deliberately handles NULL round identity.

New tables have RLS enabled and direct PUBLIC/anon/authenticated access revoked. `service_role` has SELECT; mutations run through authorized SECURITY DEFINER RPCs. Immutable rule snapshots reject UPDATE/DELETE. A native official pointer cannot be cleared or replaced silently; ordinary frozen setup cannot be edited.

No score, session, deduction decision, calculation or result table was created for native children. No historical calculation is rewritten or rerun.

## D. Configuration, freezing and revision behavior

### Configuration contract

`configuration` contains `structure`, `rounds`, `criteria`, and `scoringConfig`.

- Single phase: `structure="single"`, `rounds=[]`, criterion `roundId=null`; no artificial round.
- Multiple rounds: at least two explicit round definitions with contiguous saved order and scope-owned criteria.
- Major weights are validated within each phase/round. Drafts can retain partial totals; freeze requires 100% within existing tolerance.
- Minor criteria remain optional and equally averaged. Weighted minors and unimplemented fields are rejected explicitly.
- Input bounds preserve existing raw/maximum normalization semantics; no minimum-offset normalization or new calculation formula is introduced.
- All six existing method selections are supported: weighted average, sum, rank-based, highest score, remove extremes, manual. `undecided` can remain a draft but cannot freeze.
- Existing shared/highest-criterion tie policies are retained where compatible. Rank-based highest-criterion ties reject.
- Existing deduction units/scopes are validated: numeric points versus placement penalties. Manual results reject automatic numeric penalties. Duplicate deduction rule IDs reject.
- Top N, percentage, threshold, manual selection and all-continue settings retain existing meanings. No advancement decision or elimination is performed here.
- Final/last rounds cannot have next-round or advancement settings. Foundation metadata reports no outgoing advancement/carry controls for the last round; no frontend was changed.
- Back to Zero, weighted contributions and additive carry preserve existing interpretation. Ordinal percentage/additive carry, mixed round methods, and mixed weighted/additive contribution structures reject explicitly. Sum carry requires matching explicit panels; a future normalization policy is required before relaxing this restriction.

### Revisions

| Source change | Native revision effect | Parent/legacy behavior |
| --- | --- | --- |
| Child configuration, round, major, minor or assignment | Only that child's setup and input counters advance. | No parent revision update from these changes. |
| Native participation addition/change/removal | Only that native child's setup and input counters advance. | Legacy participation retains 103's parent revision behavior. |
| Exact configuration retry/no-op | No revision change. | No sibling effect. |
| New child identity/topology | Existing native siblings' counters do not change. | 103's parent topology revision remains for legacy publication safety. |
| Judge account/enrollment status, role or identity | Input counter advances only in native children explicitly assigned to that enrollment/user. | Existing legacy triggers remain intact. |
| Master entry metadata | Input counter advances only in native children containing that master. | Existing parent/legacy tracking remains intact. |
| Shared judge/master genuinely used in two children | Both dependent children change; unrelated children do not. | This is a real dependency, not event-wide invalidation. |

Counters are opaque monotonic versions, not edit counts: one atomic configuration save may project multiple rows and advance its own counter multiple times. Clients must submit the last observed child revisions rather than assume a fixed increment.

Config save checks `expectedSetupRevision` under the same child lock used for mutation. Freeze checks **both** setup/input revisions, complete criteria, explicit current active panels, removal counts, and applicable contribution compatibility. It cannot silently drop an inactive assigned judge.

Foundation reads use one STABLE SQL snapshot rather than several unrelated REST reads. `rulesCurrent` compares the immutable rule's setup/input stamps with that child only. Dependency invalidation never rewrites the frozen payload. A stale frozen child needs a future authorized revision/amendment procedure; ordinary setup cannot silently reopen it.

## E. Judge assignment and permission behavior

Assignments reference existing `event_participants` and user identities; no judge account or enrollment is duplicated. The enrollment must belong to the parent event, be an active competition judge/head judge, and have an active participant/voter account.

Native authorization requires an actual matching assignment for the child and selected round. A NULL-round assignment is an explicit competition-wide grant, not an empty-list fallback. Specific-round grants do not authorize other rounds. Multi-round context reads require an explicit round; single phase requires NULL.

The SQL context boundary binds event, competition, round and authenticated judge. It checks current enrollment/account state. Returned metadata includes child revisions, rules version/currentness, and `scoringAvailable:false`. It does not return a native score sheet, other judges' scores, or unfinished native scoring controls.

Historical event-wide permissions continue through the explicit Phase 2 mapped legacy competition only. Existing `scopeAllows()` and legacy calculation behavior were not changed. Native configuration endpoints reject legacy-origin children instead of interpreting old snapshots as native drafts.

## API surface

Organizer base: `/api/organizer/competition/events/:eventId/competitions/:competitionId`

| Method/path | Purpose |
| --- | --- |
| `GET /foundation` | Atomic owned setup/rules metadata, readiness and relevant round-control flags. |
| `PUT /configuration` | `{configuration,expectedSetupRevision}`; transactional draft save. |
| `POST /judge-assignments` | `{participantId,roundId?}`; explicit scoped grant. |
| `DELETE /judge-assignments` | Same explicit binding; remove a draft grant. |
| `POST /rules/freeze` | `{acknowledged:true,expectedSetupRevision,expectedInputRevision}`. |

Judge base (existing participant/voter aliases): `/competition/events/:eventId/competitions/:competitionId/context?roundId=...` — authorized metadata only. No native score submission or live-control endpoint was added.

## F. Legacy compatibility and preservation

The harness compares the original 28 table inventories before and after migration/rerun and after all synthetic tests. Original competition columns are compared excluding only the three newly added fields; all existing values, IDs, mapping/participation records, score values, locks, submitted snapshots, frozen rules, deductions and finalized/published payloads remain unchanged.

The original Phase 2 template was inspected again separately and remained unchanged. All changes were made in fresh clones, never the source template.

Legacy event-only APIs keep their prior compatibility behavior. Ambiguous/native event-only operations remain blocked by the Phase 2 safety guard when child contexts are enabled. No global permission list is copied into native assignments, and old locks are not converted into submissions.

## G. PostgreSQL integration results

[postgres-integration.json](postgres-integration.json): **20 scenarios passed** in fresh disposable `votrix_native_1791883232718`, cloned from the reviewed local Phase 2 template after actual catalog/constraint/trigger/ACL/function verification. That fixture is not claimed to represent deployed Supabase.

Verified:

- Installation and rerun preservation.
- Five distinct configurations, methods, criteria and minors.
- Child-only edit/no-op/stale revisions and unchanged sibling/parent configuration revisions.
- NULL single-phase context and explicit multi-child authorization.
- Preliminary/Semi-Final/Final identities and round-specific grants.
- Cross-child FK/reference/assignment rejection.
- Incompatible carry/method/weight rejection without score calculation.
- Native participation and round-roster scope isolation.
- Frozen rule immutability and ordinary edit rejection.
- Sibling topology changes do not stale frozen native rules; official pointers cannot be cleared silently.
- Account/enrollment dependency isolation, including shared real dependencies.
- Master-entry dependency isolation.
- Atomic round reorder with assigned identities preserved.
- Two concurrent same-child saves yield one commit and one stale rejection.
- Partial weights/missing manual basis cannot freeze; all six method selections are stored.
- Deduction scope/units and failed-update rollback.
- Account-role changes revoke authorization.
- Inactive assigned judges cannot be silently omitted at freeze.
- Direct anon/authenticated table and RPC access denial.

[native-preflight-final.json](native-preflight-final.json) inventories 34 tracked tables and reports zero structural/permission blockers. Twelve prior sparse-fixture historical review items remain unchanged. `migrationApproved:false` remains intentional: local checks do not approve production deployment.

Early SQL syntax/alias errors and synthetic test-scope assumptions were corrected using fresh disposable clones. The final 20-scenario run passes. No application calculation formula was changed to make a test pass.

## H. Backend/frontend verification

- Full backend: **76 test files passed, one existing file skipped; 605 tests passed, three existing assertions skipped**.
- 24 new Phase 3 unit/service tests (14 configuration and 10 service/error/context tests).
- Full frontend: **38 files / 259 tests passed**, with two workers and the same process-only production roster-locking override used in Phase 2. No .env or frontend source was changed.
- JavaScript syntax checks and `git diff --check` passed.
- Source hashes confirm all frontend/election/polling, both calculation engines, judge table and scoring page files are unchanged.

## I. Safety, remaining risks and deployment blockers

Only fresh localhost disposable databases in the verified workspace cluster received migration 104 and synthetic writes. Configured Supabase received **no migrations, backfills, repairs, schema changes or recalculations**. Integration scripts do not load .env or use Supabase. The local cluster was returned to its original stopped state after verification.

Production remains blocked on deployed SQL catalog/constraints/triggers/function/ACL verification, recoverable backup confirmation and a tested restore procedure. Source catalog evidence is in `template-preflight-current.json`, `template-after.json` and the final native preflight; it is not substituted for deployed metadata.

Other limits:

- Native full scoring, sessions, tabulation, exports and results do not work yet and are not advertised as working.
- Per-round different methods, weighted minors, per-division native policies and new normalization rules are explicitly unsupported in this configuration contract. Existing legacy configurations remain untouched.
- Rule freezing is setup approval, not official-result verification/publication. Reviewer/result workflows require later integration.
- A stale frozen native rule needs an authorized revision workflow; automatic reopen/rewrite is prohibited.
- Parent locks still serialize native mutations transiently. They do not cause sibling revision invalidation. Optimize lock concurrency only with later lifecycle/authorization review.
- The three skipped backend assertions are not claimed as passing; hosted Supabase and authenticated browser acceptance remain unverified.
- Do not replay 103 after 104: 103 defines the earlier parent-based participation RPC. Normal order is reviewed 100–102, then 103, then 104. Replaying 104 itself was tested; future deployment needs an applied-migration ledger and definition review.
- Safe setup rollback on a database with native children is to disable `COMPETITION_NATIVE_SETUP_ENABLED` while retaining `COMPETITION_CHILD_CONTEXTS_ENABLED` and its ambiguity guard. Disabling the child safety boundary is not a supported rollback for populated native data. Keep additive tables/history; no destructive down migration is supplied.

## J. Phase 4 dependencies

After approval, build judge/context selection and scoring/live connections using:

1. Explicit event/competition/round identities and stable participation IDs; no event-only fallback.
2. Current active authorization plus immutable frozen judge IDs/roles and native rule snapshots.
3. Child-specific expected setup/input revisions and atomic server-side write checks. Never use parent input revision as native calculation validity.
4. Independent child sessions and permission-scoped real-time invalidations, reconnect refetches and closed-scoring enforcement.
5. Qualification derived from finalized tabulation, not draft setup or mere scoring closure.
6. The existing table-format judge sheet, save/lock/submission behavior and authoritative calculation formulas.
7. Explicit policy/review for unsupported normalization, verifier/result approval and controlled frozen-rule revision.
8. Continued deployment gates and regression/historical preservation checks.

STOP: Phase 4 requires the user's approval.
