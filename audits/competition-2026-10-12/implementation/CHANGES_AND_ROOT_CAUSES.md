# Changes and root causes

Implementation record updated October13,2026. The eight parent audit reports were read as baseline evidence and each concrete finding was checked against source. This document describes implementation, not an additional audit-only assessment.

## Scoring and resource integrity

The weighted calculation used all entries with any included round, so an eliminated entry could become champion. [competition-calculation.js](../../../shared/competition-calculation.js) now shares a `championshipField` with manual results and requires applicable complete round cells. Raw/max normalization, equal minor averaging, parent/round/category weights, judge aggregation, exact rounding, shared ties and unaffected progression branches are retained.

[competition.service.js](../../../backend/src/services/competition.service.js) validates nested round, criterion, category, division and next-round event ownership before mutation, including removal. Migration [100](../../../backend/src/database/migrations/100_competition_atomic_integrity.sql) adds direct SQL same-event checks with a historical-link preflight. Inconsistent existing links cause rollback rather than silent data movement/deletion.

## Transactional source freshness

Previously JS validation/digest computation preceded the event-lock transaction; partial source guards missed weights/config/panel changes. [competition-workflow.service.js](../../../backend/src/services/competition-workflow.service.js) now captures setup/input revision before reads, stores input revision on a new snapshot and rejects missing migration metadata.100 increments revisions transactionally for governing setup, submissions, decisions, effective advancement and required account changes; guarded publication, calculation INSERT and advancement compare under event lock. Source identity and snapshot payloads are immutable. Prior RPC implementations are private wrappers, not exposed bypasses.

Saved confirmed settings govern publication; request bodies cannot substitute unpersisted scoring settings. Unknown/foreign round contexts reject before calculation. Manual entries come from the effective eligible round/championship scope, not all registered contestants.

## HTTP, sockets and privacy

[trusted-origins.js](../../../backend/src/config/trusted-origins.js) supplies one exact allowlist for Express and WebSocket upgrades. Configuration names legitimate production/preview origins explicitly; provider-wide wildcard trust was removed. Server mutation checks reject untrusted browser origins. Cookie-only authentication remains unchanged in principle; no token storage/header fallback was introduced.

[ws-server.js](../../../backend/src/websocket/ws-server.js) replaces the shared-IP ten-socket cap with authenticated per-user/node limits, bounded upgrade time and message size. [api.js](../../../frontend/src/services/api.js) serializes refresh, dispatches cookie-reconnect, preserves work on network failures and rejects late identity responses. [socket.service.js](../../../frontend/src/services/socket.service.js) reconnects with current cookies, restores requested rooms and derives correct relative/absolute URLs. Vite proxies `/ws` separately.

Migration [101](../../../backend/src/database/migrations/101_competition_private_access.sql) hardens private score/source/result/decision/history tables, with actual local ACL inventory before/after. It is **not applied to the configured project**; deployed permissions must be inspected first.102 restricts its create-request table as well.

## Reconciliation and handoff

[useCompetitionSync.js](../../../frontend/src/hooks/useCompetitionSync.js) treats notifications as event-scoped invalidation hints, coalesces overlapping reads and reconciles on reconnect/focus/online. Visible pages fetch every15s when disconnected and60s when connected to recover lost frames/process-local broadcasts; hidden pages avoid that traffic. [useLatestRequest.js](../../../frontend/src/hooks/useLatestRequest.js) prevents obsolete reads from installing state. Judge session revision and identity checks add context protection; valid unsaved drafts remain separate from authoritative saved locks.

Calculate/Submit/Verify/Finalize/Publish and approved decisions/amendments/advancement emit post-commit invalidations to owner and appointed reviewer. Only safe lifecycle/publication hints go to ordinary judges. Tabulation, Reviewer, Rankings, dashboard and live/list receivers now refetch rather than trusting payload totals. Failure to resolve a notification recipient does not report a committed mutation as failed; bounded GET recovery remains available.

## Controls, setup and creation

Live Unlock now gathers and forwards reason+confirmed through frontend service and controller. Existing SQL correction invalidates prior submissions, keeps values and immutable lock/source history, and requires a new submission. Finalized/advanced correction gates remain enforced.

Frozen Review no longer offers impossible Unpublish. Read-only messaging points to existing authorized amendment/rejudging; no new structural revision policy was invented. Workspace frozen state reaches hidden/category/division/criteria/rules controls. Bulk assignment reports individual failures and retries failures only. Division reorder is one complete-permutation RPC rather than two writes.

The wizard uses the same validated transition for footer/form actions, awaits failed draft persistence before proceeding and supports in-place Back. A UUID saved with create draft data is passed to [102 atomic creation](../../../backend/src/database/migrations/102_competition_creation_idempotency.sql); duplicate requests return the original event, changed details or foreign ownership reject. Missing102 fails closed instead of silently falling back to duplicate-prone create.

Errors are distinct from empty states on event/judge/live/report/reviewer/tabulation screens; retry preserves useful input/last good data. Shared analytics reports expose their own fetch failure instead of disappearing when analytics succeeds.

## Reports, legacy and exports

[reports.service.js](../../../backend/src/services/reports.service.js) and report export controller preserve selected division/scope when using official snapshot rows and use actual finalScore. Missing values remain null/blank; frontend metrics/display distinguish incomplete and manual placement results and preserve authoritative lower-is-better ordering. The legacy rank-based mapper tolerates omitted breakdown dictionaries without altering the modern engine.

[csv-export.js](../../../shared/csv-export.js) is shared by backend/frontend and emits literal risky user-entered text while retaining true numeric cells. XLSX verification remains verification only. External spreadsheet recalculation/print is not claimed as tested.

## Explicitly approved result visibility

The user approved **ordinary judges may see published final results only**. The enrolled [published-results route](../../../backend/src/routes/pageant-judge.routes.js) returns an allowlist of official overall entry identities/names/ranks/final scores and publication metadata. It does not return provisional rows, other judges' raw scores/totals, worksheets, evidence or full configurations. [CompetitionPublishedResults](../../../frontend/src/components/voter/competition/CompetitionPublishedResults.jsx) fetches that snapshot and never substitutes live totals.

Deployment topology was reported unknown. No cross-process broker or production setting was guessed. Broader recusal/special/public-spectator policies remain unimplemented pending requirements.

An exact changed/new file inventory relative to the preserved audit baseline is maintained in [evidence/changed-files.json](evidence/changed-files.json). Existing pre-audit modifications are not presented as newly authored work.
