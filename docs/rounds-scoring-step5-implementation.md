# Step 5: Rounds & Scoring

Implemented in the existing native competition workspace. No alternative application, authentication flow, infrastructure, or competition records were introduced. Existing working-tree changes were retained.

## Existing implementation and dependencies

The setup route reaches `NativeSetupBoundary` / `NativeSetupWorkspace` when native setup is enabled. Mapped legacy events continue through `CompetitionWorkspacePage`. Each native child competition has independent configuration, entries, assignments, revisions, frozen rules, scoring sessions, deductions, calculations, and publications.

The existing workflow is:

1. Competition selection creates child identities under one event.
2. `PUT .../competitions/:competitionId/configuration` validates and atomically saves the selected child's rounds, criteria, minors and scoring settings under its observed setup revision.
3. Entries and explicit judge assignments are added. Event-wide review freezes configuration, participation and assignment snapshots together.
4. Authorized Live Control operations open/close the session, entrants and criteria. Draft, lock and round-submit operations bind the authenticated judge, child, round, session, frozen rules and revisions.
5. Tabulation consumes current submitted sources, approved deduction decisions and confirmed prior-round qualification. Independent verification precedes finalization and publication.
6. Scoped websocket invalidations cause fresh authorized reads. The existing `useCompetitionSync` also reconciles after reconnect, focus and transport recovery, with polling as a fallback.

This work reuses that architecture, the real `CompetitionScoringForm`, `ScoreInput`, shared official calculation engine, ownership/assignment checks, revision conflicts, frozen-edit protections and independent deduction review. Authentication, routes and existing score history are preserved.

## Four substeps

**Structure:** Single Round or Multiple Rounds; round names, calculation methods, order, qualification and planned rosters. Independent rounds require no percentage total. Weighted contributions must be positive and total 100%. Converting a flat single scope into one explicit round preserves criterion/minor identities. Converting multiple rounds into a single scope or removing a round requires confirmation. Referencing deduction rules remain visible for explicit repair.

**Criteria:** Round selector, compact add/edit panel, collapsible saved major cards, minor editors and ordering controls. Major totals are shown per round with remaining percentages. Minors support equal normalized averaging or positive weights totaling 100% within their major. Duplicate names are rejected within their relevant scope. Removing or replacing criteria requires confirmation.

**Score Sheet:** Default numeric ranges, optional input precision, per-input overrides, result precision, panel aggregation and tie settings. Applying a default range to existing inputs is explicit. The interactive preview renders the real judge component and calls the official engine with local preview identities. Preview drafts and locks remain local and make no official score requests. It shows one judge's normalized weighted total; panel aggregation and carry occur in tabulation.

**Deductions:** Optional named rules, fixed points or the existing rank-placement units, values and scope. Disabling existing rules requires explicit removal confirmation. Application remains per violation, proposed by the organizer and independently approved by the appointed reviewer. Each actual decision retains offense identity, reason, actor, timestamp and affected entrant/session separately from original judge scores. The preview demonstrates one violation per applicable point rule; ordinal placement penalties require actual ranking.

The progress indicator reflects validation rather than record counts. Back/Next preserve the current configuration draft. Unfinished Add/Edit forms block saves and warn before leaving. Switching competitions warns about unsaved configuration. Competition and substep are stored in the URL for refresh restoration. Overall continuation requires valid saved configuration for every selected native competition.

## Scoring and compatibility

The existing normalization is preserved: `rating / maximum × 100`. The minimum is an input bound, not a score offset. Equal minors average those normalized ratings. Weighted minors multiply them by their minor percentages. Each major then contributes its percentage to the judge total.

The official engine retains exact rational arithmetic, configured final rounding, average/sum/highest/removal methods, ranking, manual results and existing carry/qualification semantics. Rank percentage carry uses an explicit numeric judge-average basis, never weighted ordinal ranks. Numeric point deductions apply after aggregation; rank point deductions affect numeric totals before ranking, while placement penalties apply after ranking.

Input precision is now enforced consistently in the judge input, preview, official calculation and database score-write transaction. Typing an invalid value also clears its valid upstream value, preventing a previous rating from remaining lockable.

Single-round competitions retain their existing NULL round identity and empty rounds array. Their optional display name is saved in scoring configuration. Existing frozen snapshots without input precision retain unrestricted decimal acceptance. No saved rules, scores, deductions, calculations or publications are backfilled or rewritten.

## Database and API changes

New migration: `backend/src/database/migrations/116_competition_scoring_input_settings.sql`.

- Adds no tables or columns; settings use existing JSON configuration and frozen snapshots.
- Accepts optional `scoringConfig.singleRoundName`, `defaultMinScore`, `defaultMaxScore`, and `inputDecimalPlaces`.
- Accepts optional `decimalPlaces` on individual major/direct or minor inputs. Precision is an integer from 0 through 6.
- Validates duplicate round/criterion names in scope.
- Projects effective frozen precision into live judge inputs and preserves saved criterion/minor ordering.
- Adds a score-draft trigger enforcing precision under the existing atomic write, including locking.
- Retains scoped grants and private helpers. Uses the corrected round-scope variable to avoid the foundation's existing `scope` column.

Existing API paths and request revision requirements are unchanged. Range and input-precision settings are optional extensions of the existing configuration request/response.

## Files changed

| File | Change |
|---|---|
| `frontend/src/components/organizer/competition/NativeSetupWorkspace.jsx` | Integrates four screens, validation, saved completion status, draft guards and URL restoration. |
| `frontend/src/components/organizer/competition/RoundsScoringEditor.jsx` | New structure, criteria, scoring preview and deduction editors. |
| `frontend/src/components/organizer/competition/RoundsScoringEditor.css` | Responsive editor layout using VOTRIX tokens. |
| `frontend/src/components/ui/ScoreInput.jsx` | Precision validation and clearing invalid upstream ratings. |
| `frontend/src/components/voter/competition/CompetitionScoringForm.jsx` | Actual judge precision and input steps. |
| `shared/competition-score-input.js` | Shared bounds/precision checks with historical compatibility. |
| `shared/competition-setup-readiness.js` | Per-substep and aggregate readiness checks. |
| `shared/competition-creation-flow.js` | Saved scoring readiness uses complete setup validation. |
| `shared/competition-calculation.js` | Validates submitted ratings against frozen precision. |
| `backend/src/modules/competition-native-configuration.js` | API validation for new settings and scoped duplicate names. |
| `backend/src/database/migrations/116_competition_scoring_input_settings.sql` | Forward migration described above. |
| `frontend/src/components/organizer/competition/NativeSetupWorkspace.test.jsx` | Updates editor integration tests; adds unfinished-form and refresh restoration checks. |
| `frontend/src/components/organizer/competition/RoundsScoringEditor.test.jsx` | New conversion, criteria, preview, normalization and deduction tests. |
| `backend/__tests__/modules/competition-native-configuration.test.js` | Settings and duplicate-name coverage. |
| `backend/__tests__/modules/competition-native-tabulation.test.js` | Frozen precision enforcement in official calculations. |
| `backend/__tests__/modules/competition-setup-readiness.test.js` | New single/multiple/qualification/weighted and precision coverage. |
| `backend/scripts/test-rounds-scoring-local.mjs` | Isolation-verified migration and rollback-only database checks. |
| `backend/scripts/test-rounds-scoring-browser.mjs` | Real Chrome/API/database workflow verification and screenshots. |
| `docs/rounds-scoring-step5-implementation.md` | This report. |

Evidence and logs are in `audits/rounds-scoring-2026-10-16/`.

## Executed verification

- **Backend full suite:** 92 files passed, one skipped; 689 tests passed, three skipped (`backend-final-tests.log`).
- **Frontend focused suite:** 48 tests passed across setup, editor, judge form, native judge workspace and realtime reconciliation (`frontend-focused-final.log`).
- **Frontend full suite with established default test flags:** 336 passed, one failed. The remaining legacy `CompetitionWorkspacePage` assertion expects `0 rounds`, while that existing page displays its current count differently. That page and assertion were not changed by this work. An earlier run inheriting local native feature flags produced additional profile-related failures; it is retained separately rather than reported as passing.
- **Builds:** Native-enabled and default-disabled production builds both completed with exit code zero (`builds-final.log`). Existing large-chunk warnings remain.
- **Scoped ESLint:** Passed (`lint.log`).
- **Database:** Migration applied twice; fingerprints confirmed unchanged existing events/configurations/rules/drafts/submissions/calculations/publications. Rollback-only scenarios exercised named single scope, independent children, weighted totals, qualification without required weights, duplicate rejection, per-input precision, invalid precision, actual draft/lock/submit, unauthorized writes, frozen edit refusal and closed judge inputs (`database.json`).
- **Real Chrome:** One complete run passed through ordinary password login, actual creation routes, two independent competitions, local preview locks, entries, assignments, event review, both judges' drafts/locks/submission, live updates without browser refresh, deduction proposal/independent approval, finalization and publication (`real-browser.json`). The average-scoring result was 85 minus 2 = 83. The second competition used sum scoring without deductions. Cookie-only authentication also passed.
- A later Chrome run captured full desktop and mobile views, then stopped at the existing authentication rate limit during repeated judge logins (`real-browser-failure.json`). The earlier successful run remains separately recorded. Rate limits were not weakened.

Multiple-round arithmetic and qualification were exercised by unit/database checks; they were not separately driven through the new editor in the successful Chrome run. Skipped tests are not claimed as executed.

## Deployment and remaining limits

Apply migration 116 after the existing migrations through 115 before deploying the new input-setting UI. The new migration and its prerequisite 115 were applied only to the verified synthetic local development database for testing. Hosted databases and environment files were not changed.

Keep the existing native setup/scoring/tabulation/results deployment gates and websocket configuration. No additional environment variables or dependencies are required. The legacy setup path remains available under its existing dispatch rules; this redesign targets the native Step 5 implementation.

Existing scored/frozen competitions remain read-only through ordinary setup. Use the existing authorized correction/review process rather than rewriting their frozen rules. Deduction application intentionally retains the existing organizer-proposal/independent-review permissions and fixed point/placement semantics; arbitrary percentages or unrestricted role assignment were not introduced.
