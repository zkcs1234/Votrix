# Native competition tabulation: setup and review flow

## Scope

The tabulation presentation follows the supplied compact dashboard reference: round metrics, overview summary cards, and one contestant matrix. Each tab renders only its own content. Original sheets, validation, finalization, rankings, and audit activity have distinct destinations. Screenshot names, scores, averages, and submission counts are illustrations, not application data. The page uses the current authorized snapshot and the existing official calculation output.

The existing native-tabulation feature boundary still selects this workspace. Migration 124 moves reviewer appointment out of the calculation prerequisites; independent verification remains required for finalization. API routes, authentication, scoring formulas, publication guards, and the legacy workspace retain their existing behavior.

## How setup affects tabulation

| Setup / operational step | Effect on tabulation |
| --- | --- |
| 1. Event Details | Supplies the event context. Dates and event creation remain governed by existing workflows. |
| 2. Branding | Presentation only; does not alter scores or ranks. |
| 3. Competition Type | Determines the setup branch and supported participation/configuration. Tabulation never infers a different competition type. |
| 4. Competitions / Categories | Supplies isolated competition contexts. Switching competitions clears previous results and pending review context. |
| 5. Single / multiple rounds | Supplies the selectable rounds and eligible scoring scope. Single round has a 100% contribution and no next-round qualification. |
| 5. Criteria / minor criteria | Defines required score cells, names, weights, bounds, and per-target precision. Raw submitted values remain separate from backend normalized criterion averages. |
| 5. Scoring basis / method | Raw-points basis adds major criterion points. Weighted basis normalizes scores to 100 and applies configured minor/major weights. The method aggregates complete judge totals or uses explicit manual placements according to the existing engine. |
| 5. Score input | Controls allowed input precision; target-specific precision overrides the competition default. Tabulation displays the configured ranges and never introduces a separate range editor. |
| 5. Deductions | Only rules applicable to the selected or contributing round scopes enable the deduction stage. Required decisions must be resolved before calculation/continuation. Existing proposal, review, audit, and units remain intact. |
| 5. Tie policy | Shared placement or the existing highest-criterion policy is applied by the authoritative calculation. The ranking stage explains actual ties; it does not fabricate an unresolved tie or override engine ranks. |
| 5. Round contribution / carry | Back-to-zero, weighted contributions, and carry-forward use current contributing-round sources. The breakdown shows backend round results and the saved contribution configuration; it does not recalculate them in the browser. |
| 5. Advancement | Qualifier proposals use finalized standings, configured cutoffs, ties, and explicit confirmation. Special rounds and final rounds follow the existing next-round resolver. Confirming qualifiers does not start scoring. |
| 6. Contestants / Entries | Supplies competition entries and the frozen eligible round roster. Matrix rows use actual entry numbers and names from the frozen eligible roster. |
| 7. Judges | Supplies required assigned judges. Submission badges use the authorized snapshot's required panel, not every event judge. |
| Review & Create / freeze | Establishes the versioned rules, participation, and assignments used for source validation and calculations. Ordinary draft setup is not treated as frozen scoring authority. |
| Live Control | Starts/closes scoring and produces current submitted sheets. Draft, incomplete, invalid, unauthorized, or stale-rule sources cannot become official totals. |
| Tabulation | Entries → configured Deductions → Calculation → Ranking & Tie Rules → Finalization → eligible advancement / competition completion. Reviewer appointment, independent verification, reasons, and explicit organizer finalization remain required by existing policies. |
| Results & Analysis | Publication is a separate existing action. A finalized calculation is not automatically a published result. Official result exports still require the current finalized, published calculation. |

## Presentation and correctness changes

- The header has compact context selectors, one rules action, and four actual round metrics. The overview shows category facts, submission progress, validation status, and quick actions.
- One spreadsheet-style contestant matrix replaces repeated per-entry cards. It uses grouped judge/criterion headers, compact rows, aligned decimal columns, a highlighted final-score column, status filters, sorting, a criterion key, and per-entry actions. Large tables scroll inside the panel; the page itself does not overflow horizontally.
- Criterion columns show the mean of saved adjusted criterion contributions, using the same rational-mean helper as the official engine. They are presentation values, not a second calculation of standings. Final scores, judge totals, ranks, and deductions come from the saved calculation.
- Overview contains only its summary cards and contestant matrix. Judge sheets, validation/review, finalization, and audit content appear in their respective tabs. Matrix row actions open original sheets in Judge Submissions and detailed calculations in the existing accessible dialog.
- Judge Submissions has its own coverage table. View Sheet opens a large read-only modal with one row per contestant and grouped scoring-target columns from the selected judge’s immutable submission. Source selection survives route navigation without re-fetching or resetting the scoring context.
- Validation contains calculation rules, prerequisites, and the existing manual-placement form where applicable. It does not repeat the matrix or a second totals summary. Independent review and finalization retain their existing controls in Finalization; standings are accessed through Matrix or Results & Rankings.
- View Scoring Rules shows the frozen method, basis, ranges, precision, tie scope, manual decision basis, applicable deductions, round carry, and advancement. Audit activity is built only from available saved timestamps; no mock review or calculation events are invented.
- Corrections, context changes, incomplete responses, and failed authoritative refreshes clear score-bearing views and breakdown dialogs immediately. Late responses cannot restore a sibling or obsolete context.
- CSV calls now pass records to the shared two-argument helper. Previously the workspace passed separate header/row arrays to that helper, dropping actual score rows. Numeric totals stay numeric and shared CSV escaping remains in place.
- Combined scores and deduction reports also support existing SpreadsheetML Excel (`.xls`) and browser Print / Save as PDF helpers. These are current-source reports, and unfinalized results are not labeled official. Original judge sheets and published official results retain the existing server CSV path.
- Rules, breakdown, and export dialogs reuse the existing accessible Modal (focus trap, Escape, dimmed backdrop, scroll lock, focus restoration). Scoped styles use existing VOTRIX tokens. Browser checks cover 1440px, 768px, and 390px without page overflow.

## Compatibility limits found during review

The current native engine supports `weighted_average`, `sum`, `rank_based`, `highest_score`, `lowest_removal`, and `manual`. Existing stored methods remain readable. `undecided` is not a confirmed numeric calculation method.

`weighted_average` averages complete **judge totals**. With the points basis, each judge total is the sum of that judge's major criterion points; averaging those sums is not the arithmetic mean of every raw criterion cell. Tabulation calls that combination “Average Judge Total (points)” to avoid implying a new formula. A separately selectable unweighted “Average Score” with the previously requested cell-level formula requires coordinated engine/validation/API support and is not implemented by this frontend presentation change. The setup dropdown is not changed here.

`sum` adds judge totals using the saved scoring basis. Previously saved weighted-basis Total Score configurations retain their existing behavior; silently converting them to unweighted points would corrupt compatibility.

The existing rank-based implementation derives each judge's placements from adjusted judge totals. The UI displays returned judge ranks and placement totals; it does not introduce a direct ranking-entry API. Configured numeric carry and placement deductions remain distinct.

Manual results use the existing complete organizer-entered placements, decision basis/reason, independent review, finalization, and publication flow. Numeric standings are not invented for manual results.

## Validation

The calculation/finalization update adds these checks:

- 36 frontend tabulation and breakdown tests; 28 backend tabulation module/service tests.
- Rollback-only PostgreSQL exercise: `node backend/scripts/test-competition-review-after-calculation-local.mjs`. It verifies migration reruns, calculation without appointment, stable results after appointment, legacy finalized-result preservation, configured deduction gates, and independent verification/finalization.
- Headless browser workflow at 1440, 1024, 390, and 320 pixels: calculate without a reviewer, remain on the selected stage during delayed refresh, assign in Finalization without recalculation, and open the criterion breakdown.

Apply `124_competition_review_after_calculation.sql` after migration 123 before using the updated frontend. Reviewer policy stays in audit evidence but is excluded from new numeric-source fingerprints. Existing current calculations retain their original fingerprints. Reviewer appointment and review notes live in Finalization; the configured Deductions stage also exposes them when independent deduction decisions are required. Manual placements have a separate decision-reason field in Calculation. The migration test uses only the verified synthetic localhost database and rolls back all function and fixture changes.

Earlier presentation checks:

Focused frontend coverage exercises original values, CSV/Excel/PDF records, publication gating, selected-round breakdown traces, point/weight units, rank carry, manual placements, configured deductions, stale-source invalidation, reviewer/finalizer controls, and qualification. Existing backend calculation, export, and tabulation/results service suites are run without changing backend code. Scoped ESLint and the production build are also run. Browser evidence is local under `.tmp/tabulation-evidence`; its isolated test fixtures never enter production bundles or the database.

Completed checks:

| Check | Result |
| --- | --- |
| Frontend: native tabulation/breakdown/results/boundaries/handoff, exports, and Step 5 setup suites | 9 files, 99 tests passed |
| Backend: native tabulation and export modules, official calculations, scoring rule configuration, native tabulation/results services | 6 files, 71 tests passed |
| ESLint on changed JavaScript and JSX files | Passed |
| Vite production build | Passed; existing large-chunk warning remains |
| Isolated headless Chrome: entries, breakdown, panel summary, rules, and export at 1440 / 768 / 390px | Passed, no runtime exceptions or API requests |

This does not claim a live production/database exercise of submissions, publication, or downloads. Existing service/module tests cover those policies; the browser exercise checks presentation with isolated test fixtures.

## Duplicate-content audit and reference cleanup (19 October 2026)

| Previous duplication | Result |
| --- | --- |
| Overview, Judge Submissions, and Matrix mapped to the same content | Each route now has a distinct view. |
| An original-score table, scoring-summary row, entry summary, and breakdown button repeated for every entry | One contestant matrix; source and breakdown details open for the selected entry. |
| The calculation page repeated all judge totals and results in another summary table | Validation shows source checks and the calculation policy; the matrix owns the totals display. |
| Finalization repeated the standings already shown in the matrix and ranking view | Finalization owns independent review and approval actions, with links to the existing standings. |
| Five supplemental panels repeated other tabs beneath Overview | Removed; Overview keeps its summaries and matrix. Each tab mounts only its own sections. |
| Expanded original-score tables lived inside action cells | View Sheet opens the selected judge’s read-only modal; original scores never appear in an Actions cell. |
| Global workflow styles enlarged definition-list values into large cards | Compact scoped styles keep the overview facts small and aligned. |

No SQL migration or backend arithmetic change is required for this presentation update. The native/legacy feature boundary remains; the legacy implementation is a fallback, not another panel mounted inside this workspace. Verification includes submission privacy, corrections and late responses, reviewer/finalization guards, deductions, unchanged exports, distinct route navigation, and a 12-contestant / 7-judge / 5-criterion visual fixture at desktop and mobile widths. Browser evidence is under `audits/tabulation-layout-2026-10-19/`.

Validation for this cleanup: 78 related frontend tests passed, scoped ESLint passed, and the production build passed. The visual browser checks passed at 1440, 1024, 390, and 320 pixels. The desktop matrix fits without horizontal scrolling; narrower viewports scroll only the matrix. Database and migration files were not changed.


## Judge-specific original sheets

View Sheet binds the judge and submission ID from the current authorized submission head. The viewer also checks the session, round, frozen rules and source-row judge identities. It reads only immutable `competition_child_submissions.sources`; calculated worksheets, averages, ranks and combined contestant results are never used. Recalculation does not change the displayed original scores. Source invalidation closes an open sheet before reloading.

The backend snapshot query already scopes submission heads through the event/competition/round session and validates locked source lineage. Its existing policy withholds scoring values until all required submissions and qualifications are current. The modal preserves that policy and displays actual unavailable/incomplete status instead of substituting scores. No database migration is needed.

The navy-header sheet has grouped major/minor columns, configured weights and ranges, exact saved numeric inputs, and explicitly labeled raw subtotals before weighting or deductions. Organizer Print / Save PDF and Download CSV actions retain the existing export permissions; reviewers receive read-only viewing. Judge downloads also validate the selected immutable submission ID and reject superseded IDs or mixed-judge export rows.

Verification covers the clicked judge, submission identity and lineage mismatches, missing scores versus zero, recalculation stability, invalidation, reviewer permissions, print escaping, and server download guards. Isolated browser evidence includes `original-judge-sheet.png`, `original-judge-sheet-390.png`, and `original-judge-sheet-320.png` under `audits/tabulation-layout-2026-10-19/`.
