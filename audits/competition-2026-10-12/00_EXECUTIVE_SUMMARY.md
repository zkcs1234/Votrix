**Can a competition currently be run start-to-finish without manual workarounds? NO.**

# VOTRIX competition audit — executive summary

Audit date: **October 12, 2026, Asia/Bangkok**. This verdict applies to the actual current working tree and the requested standard, which requires correct eligibility, authorized access and automatic updates across the complete workflow. **Confidence is high in the reproduced defects; full deployed/browser/database end-to-end readiness is NOT VERIFIED.** Some configurations may operate with navigation/refresh and existing alternate controls, but that does not satisfy the supplied completion criteria.

No application code, existing test, migration, UI, route, database data, environment file or behavior was changed. Only this audit directory and audit-only evidence were created. Existing uncommitted repository changes were included and preserved.

## What was actually tested

| Verification | Result | Practical limit |
|---|---|---|
| Full existing backend suite | **468 passed; 1 failed; 3 skipped**, 61 files (59 passed / 1 failed / 1 skipped) | Mostly mocked/unit/service/API tests. The failure expects old `087-097` migration message; actual missing-schema error remains fail-closed 503 and says through099. No connected Supabase operation. |
| Full existing frontend suite | **181 passed**, 19 files | jsdom/mocked component behavior, not real browser accounts. The existing suite was run with process-only `VITE_LOCK_PARTICIPANTS_ON_ACTIVE=true`; local persisted flag is false. |
| Isolated actual WS/server/client characterization | **8 passed** | Ephemeral loopback server, actual transport/rooms/emitter/client and selected current callbacks; database and identity mocked. Two client contexts are not two real authenticated browser sessions. |
| Security/service boundary characterization | **5 passed**, asserting current vulnerable behavior | Actual createApp CORS/CSRF and actual setup service calls with mocked database/auth-related boundaries; no real unauthorized write or browser victim. |
| Existing focused scoring/workbook/access suites | **70 passed**, already included in backend count | Pure/serialization/scoped mocked tests, not additional independent full-stack executions. |
| Pure official scoring probes | Passed documented arithmetic cases and reproduced eliminated winner | Engine receives fixture rules/submissions in memory; no API score submission. |
| Frontend build / lint | Build passed with large-chunk warning; lint **0 errors / 3 warnings** | Build success does not prove permissions, persistence or realtime. |

Logs, exact commands, unexecuted real-browser scenarios and readiness checklist: [07_END_TO_END_TEST_PLAN.md](07_END_TO_END_TEST_PLAN.md). Audit evidence processes were isolated; `server.js`, migrations, mail, uploads and production operations were not run. Application hash verification is recorded in [_evidence/application-change-check.json](_evidence/application-change-check.json).

## Top 10 blockers and risks to resolve first

| Priority | Finding | Evidence-backed reason / affected scenario |
|---:|---|---|
| 1 | **F-01: eliminated contestant can win weighted championship** | Actual engine returns eliminated B=36/rank1, finalist A=34/rank2, ready=true. Eligibility and arithmetic output disagree. Critical for weighted elimination format. |
| 2 | **F-02: unchecked nested round/criterion/category event links** | Owned URL event does not validate supplied round/criterion; service requests foreign draft membership writes. Parent ownership is present but insufficient for nested targets. |
| 3 | **F-03: unrelated Vercel origins receive credentialed API/socket trust** | Actual CORS admits unrelated `*.vercel.app` when the Render-declared flag is enabled; token equality alone does not enforce origin. Real deployed/browser exposure unverified. |
| 4 | **F-04: missed live events require manual recovery** | Active judge has no disconnected HTTP polling fallback; organizer has no reconnect reconciliation. Current gates/progress can remain stale. |
| 5 | **F-05: independent review handoff disconnected** | Calculate does not notify an open reviewer page; reviewer Verify/approve does not refresh organizer tabulation. Automatic end-to-end publication handoff fails. |
| 6 | **F-06: stale responses/other enrolled-event messages overwrite sheet state** | Executed callback tests reproduce older Preliminary overwriting newer Final and foreign enrolled-event pause entering the current view. |
| 7 | **F-07: rankings/dashboard do not consume versioned invalidations correctly** | Unfiltered Rankings ignores eventId-only invalidation; versioned submission/start emissions do not match all receiving views. |
| 8 | **F-08: larger/shared-network judge panels can lose sockets** | Actual eleventh socket from one IP receives HTTP429; idle token-refresh/reconnect coordination also incomplete. Hosting/NAT behavior requires real acceptance test. |
| 9 | **F-09/F-10: publication/freeze freshness checked only partially in transaction** | Result digest computed before RPC; setup guards omit governing config/panel fields. Concurrent changes can evade a fully atomic validated snapshot boundary. Race reproduced only as source trace, not DB execution. |
| 10 | **F-12/F-13: visible correction/recovery actions contradict server contracts** | Grid Unlock/controller omit mandatory reason+confirmed; modern Unpublish offered after official rules are frozen always rejects. Separate workflow correction/amendment paths exist. |

These are not all unconditional failures for every event: F-01 depends on weighted elimination, F-08 on network/panel capacity, and publication races on concurrent input changes. They still prevent the module meeting the supplied complete-readiness standard. Exact reproduction, severity, repair and acceptance are in [03_GAPS_BUGS_AND_SECURITY_FINDINGS.md](03_GAPS_BUGS_AND_SECURITY_FINDINGS.md).

Additional significant gaps: **F-11** sensitive historical score/result tables have no repository RLS/grant hardening sufficient to prove direct Supabase isolation; actual deployed grants are unknown. **F-14** manual selected-field/round validation is inconsistent. **F-15** published report replacement loses division filtering. **F-16/F-17/F-20** frozen controls, silent bulk errors, create-footer navigation and misleading load failures impede recovery. Legacy result mapping and CSV safety are also documented.

## What is connected and what remains unverified

Current setup, effective versioned roster, judge scope checks, gate/context validation, revisioned drafts, atomic lock/projection/history RPC, explicit Submit Round source versions, server calculation and snapshot transitions are connected in code. The exact pure arithmetic passed worked examples: **raw/max × 100 → equally averaged normalized minors → major percentage contribution → rounded judge total → frozen official aggregation → approved adjustments → scoped ranking**.

The ordinary judge path exposes its own sheet; appointed independent reviewers intentionally receive verification data. There is no general ordinary-judge official-result release/public spectator workflow identified. The intended judge visibility policy must be approved rather than inferred. Dedicated per-judge recusal and contestant account/approval workflows were not found. Venue/import/public-view additions are optional missing features, not implicit authorized requirements.

The current live-control socket emits the right generic refetch hint, and isolated transport proves it invokes the judge callback. Forced-refresh symptoms are now explained chiefly by lost delivery/fallback, stale request order and disconnected receiving pages. Older documented WS token-identity/room-permission/intentional-reconnect defects have been fixed in this working tree and are not repeated as current findings.

Real cookie-authenticated two-browser scoring, stale-request rejection on PostgreSQL, concurrent inserts, deployed migrations/FKs/grants, cross-origin cookie behavior, email/media delivery, actual spreadsheet recalculation/print and production socket routing remain **Cannot verify**. The audit does not infer them from successful pure tests or UI buttons.

## Recommended implementation order — awaiting approval

1. Confirm actual schema/ACLs read-only and approve ambiguous Final field/setup revision/visibility decisions.
2. Repair championship eligibility, tenant link checks and trusted origin scope.
3. Repair active/reconnect fallback, ordered event-scoped reads, review/ranking invalidation and panel/auth recovery.
4. Repair atomic freeze/publication freshness and explicit correction/manual field contracts.
5. Fix reports, frozen controls, navigation/error recovery and legacy/export edge cases.
6. Execute all twelve real disposable-account/browser/database scenarios before using a real competition.

Full dependency/risks/migration impact/acceptance: [06_PRIORITIZED_IMPLEMENTATION_PLAN.md](06_PRIORITIZED_IMPLEMENTATION_PLAN.md). This is a proposal, not permission to deploy or mutate Supabase.

## Report index

- [01 — Workflow map, state machines, permissions and sequence](01_COMPETITION_WORKFLOW_MAP.md)
- [02 — Feature and actionable-control inventory](02_FEATURE_AND_BUTTON_AUDIT.md)
- [03 — Prioritized defects and security findings](03_GAPS_BUGS_AND_SECURITY_FINDINGS.md)
- [04 — Actual scoring, tabulation, ties, rounds and exports](04_SCORING_AND_TABULATION_REVIEW.md)
- [05 — Organizer/judge/reviewer realtime diagnosis](05_REALTIME_SYNC_REVIEW.md)
- [06 — Dependency-ordered implementation proposal](06_PRIORITIZED_IMPLEMENTATION_PLAN.md)
- [07 — Executed evidence, twelve-scenario E2E plan and release checklist](07_END_TO_END_TEST_PLAN.md)

**Audit complete; no application code changed. Awaiting approval for implementation.**
