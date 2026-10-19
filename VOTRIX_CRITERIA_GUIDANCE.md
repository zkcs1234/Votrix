# Automatic criteria validation and guided round progression

Implemented in the working tree on October 12, 2026. The Criteria page now guides an organizer through saved round configuration, checks readiness after confirmed mutations, and enables Continue to Divisions when every scoring scope is ready. There is no separate Validate Round action.

## Page behavior

- The page title is **Scoring Criteria**, followed by compact Round Setup Progress cards. Each card shows the official round number/name, saved active percentage total, status, and the first remaining requirement. Selecting a card loads that round's existing records.
- Statuses are **Not Started**, **In Progress**, **Complete**, and **Needs Attention**. A completion panel lists all current requirements, shows a weight progress bar, and links to incomplete scopes. A 100% total with invalid inputs remains Needs Attention.
- **Previous Round** and **Next: [name]** use saved IDs in `?tab=criteria&roundId=...`, ordered by `displayOrder`. Guided Next requires the current round to be ready; manual round selection stays available. Selection scrolls to the criteria editor and reloads saved foundation data.
- **Continue to Divisions** requires every scope to be ready, with no pending save, unresolved save failure, or failed foundation refresh. All Rounds Ready appears when all rounds pass. One-round events validate that round; flat events validate event-wide criteria.
- The existing major/minor editor retains creation, major name/weight editing, reuse, enable/disable, minor scales, ordering, removal, and deletion. Minor name/range editing now uses the same existing minor form. Existing IDs and membership APIs remain in use.
- Desktop retains two editor columns; mobile stacks the content and navigation. Criteria uses the existing shell's sticky footer portal. A ResizeObserver measures its height and reserves clearance below the page. Other workspace tabs retain their prior footer in document flow.

## Shared readiness rules

`shared/competition-criteria-readiness.js` is the common validator used by the foundation response, frontend saved-data fallback, rule publication, and official session start. It validates input configuration without duplicating the official engine's score aggregation.

For each saved round, or the single implicit flat scope:

1. Active linked major criteria must exist, have finite positive weights no greater than 100 individually, and total 100 within **0.001 percentage points**, matching the existing official publication tolerance.
2. Configured minors must include an active input. Disabled minors are excluded from scoring. Configuring minors and then disabling all of them does not silently enable direct parent scoring.
3. Active minor ranges must be finite with a maximum above zero and greater than the minimum. Custom ranges require both saved bounds; malformed data cannot fall back to a plausible default. Known fixed scales resolve through the same shared input-bound function used when freezing official rules.
4. A major with no configured minors may use the engine's supported direct-scoring input **when its saved major bounds are valid**. Missing minors combined with missing/invalid direct bounds blocks readiness. Missing minors alone do not block an explicitly supported direct-scoring configuration.
5. Duplicate memberships, missing/foreign criterion references, duplicate active inputs, and orphan minor references block readiness.

Percentage progress reflects confirmed saved records, never the percentage typed into a create form. Failed or pending operations overlay the affected round statuses without rewriting persisted totals. Editing a reused criterion rechecks every linked round.

## State and server safeguards

Criteria mutations are serialized in the editor. A successful write remains pending until a fresh foundation GET confirms the saved configuration. Older GET responses cannot replace a newer one, and a mutation awaiting a superseded GET awaits the latest request instead.

A write failure preserves entered form data and blocks further writes and continuation until the organizer explicitly chooses **Use saved configuration**. That action fetches the saved data again; the preserved form can then be edited or retried. An unrelated successful write cannot clear an unresolved failure. When the write succeeds but the reload fails, **Reload saved criteria** retries only the read, avoiding duplicate insertion. This is recovery from a failed confirmation, not a manual validation step.

Foundation now preserves minor `isActive` and retrieves complete paginated criteria/minor/round/membership data. Membership reads are scoped to the current event and fail explicitly on query errors.

Review & Publish displays criteria readiness and links to incomplete rounds. Its Finish & Publish action requires saved readiness, and a server rejection reloads current setup. The backend independently validates all scopes before freezing rules, so direct HTTP calls cannot bypass the frontend checks. Session start validates the immutable official rules rather than trusting the UI. Inactive linked parents remain in source history while the frozen scoring scope includes only active parents.

Migration **095_competition_criteria_publication_guard.sql** adds a canonical criteria-source reader and compares validated sources inside the publication transaction while holding the event lock used by setup triggers. Changes to weights, names, ranges, activity, round order, or criterion memberships during publication cause a conflict and roll back publication. SQL compares source records; the shared JavaScript validator remains responsible for readiness rules.

## Files changed for this request

| File | Change |
|---|---|
| `shared/competition-criteria-readiness.js` | Shared readiness, strict input bounds, tolerance, statuses, canonical source projection |
| `frontend/src/components/organizer/competition/CriteriaProgress.jsx` | Progress cards, completion requirements, previous/next round controls |
| `frontend/src/components/organizer/competition/CriteriaManager.jsx` | Integrates progress around the existing editor and confirms every mutation |
| `frontend/src/hooks/useCriteriaSave.js` | Serialized writes, pending/error state, confirmation reload and recovery |
| `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx` | Latest-response handling, Criteria title, footer gating and measured clearance |
| `frontend/src/pages/organizer/competition/CompetitionReviewPage.jsx` | Saved readiness requirement, incomplete-round links, conflict refresh |
| `frontend/src/components/ui/ModuleStageLayout.jsx` | Clarifies footer ownership; no behavior change |
| `backend/src/services/competition.service.js` | Complete event-scoped foundation reads, minor activity, readiness response |
| `backend/src/services/competition-workflow.service.js` | Publication/start validation, strict frozen bounds, source-conflict checks |
| `backend/src/services/pageant.service.js` | Shared readiness check in the retained legacy publish helper |
| `backend/src/database/migrations/095_competition_criteria_publication_guard.sql` | Atomic source comparison at official rule publication |
| Backend criteria-readiness/publication/foundation tests and SQL fixture | Configuration, source consistency, server guards, atomic publication checks |
| Frontend criteria-guidance/review tests; existing workspace tests | Saved mutation, navigation, recovery, publication gating and updated labels |
| This report, `COMPETITION_WORKFLOW_IMPLEMENTATION.md`, `VOTRIX_ROUNDS_COMPACT_LAYOUT.md` | Current rollout and footer behavior notes |

## Verification

- Backend suite: **403 passed, 3 skipped**. New coverage includes percentage tolerance, invalid/missing direct inputs, disabled minors, strict custom ranges, duplicate/foreign links, reused criteria, complete membership pagination, publication conflicts, and official start rejection.
- Frontend suite: **102 passed**, followed by **3 additional Review & Publish tests passed**. Criteria tests cover preliminary complete/final incomplete, actual-ID next navigation, saved final completion, shared-parent edits, flat/single-round setup, minor create/edit/delete, enable/disable, detach/reattach, pending/failed saves, read-only recovery without duplicate writes, and stale GET responses.
- Focused checks and production build pass. The existing build warning about chunks above 500 kB remains.
- Local PostgreSQL 18: migrations 087–094 plus 095 applied to a new isolated fixture database; canonical JavaScript/SQL source equality, stale minor/weight/membership rejection, rollback, valid publication, and frozen setup checks pass. The local server was stopped afterward.
- Headless Chrome in the actual `PageantLayout` / `AppShell` / `ModuleStageLayout` at **1536, 1280, 1024, 768, and 390px**: desktop columns/mobile stacking, sticky footer clearance, no horizontal page overflow or nested vertical content scrolling, guided navigation, saved completion, and footer cleanup pass. Browser calls used local fixtures; application API requests were blocked, and none occurred. Existing collapsed-sidebar nested-link warnings remain outside this change; no runtime exceptions occurred.
- Screenshots are under `.tmp/criteria-guidance-*.png`. Temporary browser fixture pages were removed and the preview server was stopped.

## Supabase rollout

**Migration 095 has not been run on connected Supabase by this task.** After migrations 087–094, run `backend/src/database/migrations/095_competition_criteria_publication_guard.sql` once in Supabase SQL Editor. It changes functions only and does not delete events, scores, or historical snapshots. Restart the backend and refresh the frontend afterward.

The backend intentionally refuses new rule publication if the new source-reading function is unavailable. Existing official scoring sessions and snapshots are retained; start checks reject an invalid historical rules configuration rather than silently rewriting it. No connected database data, judge submission, email, or deployment was executed for this request.
