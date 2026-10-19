# Competition scoring and tabulation review

Audit date: **October 12, 2026 (Asia/Bangkok)**. Scope: the current working tree, including uncommitted changes and migrations through 099. No application code, database, migration, account or score was changed by this review.

## Evidence and verdict

**The pure official arithmetic works for the exercised examples; the complete scoring-to-publication journey is NOT VERIFIED.** A weighted multi-round elimination defect was reproduced in the real pure engine. Source inspection also identifies transactional validation gaps, incomplete database access hardening and presentation inconsistencies. Passing arithmetic tests does not establish that the deployed Supabase schema, cookie authentication, two-browser synchronization or publication workflow works.

Evidence levels used here:

- **Exercised:** existing automated tests or an audit-only in-memory probe executed during this audit. No application API or connected database was used.
- **Code-evidenced:** a connected source path was read, but its live outcome was not exercised.
- **Cannot verify:** requires deployed permissions/schema, real accounts, a browser or an external spreadsheet application.

The focused existing run passed **70 tests in nine files**: official competition, workbook, legacy scoring, tabulation, scoring-rule configuration, scoped weights, judge access and assignments. Run from `backend`:

```powershell
npm.cmd test -- __tests__/modules/official-competition.test.js __tests__/modules/competition-workbook.test.js __tests__/modules/scoring-engine.test.js __tests__/modules/scoring-engine.characterization.test.js __tests__/modules/tabulation.test.js __tests__/modules/scoring-rule-configuration.test.js __tests__/services/scoring-weights-scope.test.js __tests__/services/competition-access.test.js __tests__/services/pageant-assignments.test.js
```

The independent [pure probe](./_evidence/scoring-probes.mjs) and [recorded output](./_evidence/scoring-probes.json) exercise five numeric methods, missing submissions, decimal rounding, division ranks, shared cutoff ties and the weighted elimination defect. From the repository root:

```powershell
node audits/competition-2026-10-12/_evidence/scoring-probes.mjs
```

An initial added rounding probe incorrectly multiplied decimal fixture inputs with JavaScript before passing them to the exact engine. Its assertion failed. The final probe supplies exact decimal strings and passes. This was a test-fixture error, not evidence of an engine failure.

## Current authoritative path and retained legacy behavior

| Branch | Selector | Sources | Meaning |
|---|---|---|---|
| Versioned official workflow | `events.official_rules_id` is present | Current-session, current-rules `competition_round_submissions.sources` | Calculate each judge's weighted total first, then aggregate those totals. |
| Retained legacy ranking read | No official rules ID | Flattened `competition_scores` | Reduce judge values per scoring cell first; tolerate missing cells as zero. These formulas differ from the versioned official methods. |

Source: [pageant.service.js](../../backend/src/services/pageant.service.js), `getLiveRankings`, lines 1847–1854; [competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js), `tabulationData`, lines 154–173; [competition-calculation.js](../../shared/competition-calculation.js), `calculateOfficial`, lines 47–160.

The current participant `/session-score` handler delegates to the versioned workflow at [competition-session.service.js](../../backend/src/services/competition-session.service.js):1480–1482. The older batch POST `/score` remains mounted, but `submitJudgeScores` rejects events with official rules at [pageant.service.js](../../backend/src/services/pageant.service.js):1604–1608. The old tabulation service remains in the repository; the mounted Calculate/Finalize/Publish controllers call the new workflow instead at [pageant-organizer.controller.js](../../backend/src/controllers/pageant-organizer.controller.js):241–267. Its presence therefore does not establish a reachable legacy publication bypass.

**Legacy limitation:** rank-based legacy engine rows contain placement totals and category data but no `perCriterion`/`perRound` objects ([scoring-engine.js](../../backend/src/modules/scoring-engine.js):298–369). The legacy public mapper dereferences those objects ([pageant.service.js](../../backend/src/services/pageant.service.js):1992–2012). That legacy read can throw for rank-based events without versioned rules. New official rank-based results use a compatible shape and passed the focused engine test.

## Inputs, ranges and weight semantics

Judges enter **raw minor scores**, not the parent percentage as an input maximum. A directly scored major with no minors uses the major's saved min/max. Published rules freeze these inputs and applicable criteria.

| Minor configuration | Minimum | Maximum |
|---|---:|---:|
| `range_1_100` | 1 | 100 |
| `range_1_10` | 1 | 10 |
| `decimal` | 0 | 10 |
| `custom_range` | Saved custom minimum | Saved custom maximum |

The strict shared readiness check rejects nonfinite bounds, nonpositive maximum, minimum at/above maximum, invalid links, no active input under a configured parent, and active parent weights outside 100% by more than 0.001 percentage points. See [competition-criteria-readiness.js](../../shared/competition-criteria-readiness.js):10–18 and 49–75. `freezeRules` filters disabled inputs and freezes resolved bounds at [competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):74–80.

The visible input uses a `0.5` step. SQL validates numeric finiteness and frozen bounds; it does not require half-point increments or restrict entered decimal places to the output precision. A true raw zero is valid when the saved minimum permits zero. Missing, null and blank inputs do not become official zeros.

Parent `percentage`, round `weight`, category `weight` and judge aggregation are separate concepts. Minors have equal influence inside their parent; judges have equal influence within an applicable panel. The implementation has no arbitrary judge percentage multiplier.

## Actual criterion and judge formulas

For judge `j`, entry `e`, major `c` with `m` configured minors:

```text
NormalizedMinor(j,e,input) = RawScore / FrozenMaximum × 100
MajorAverage(j,e,c) = sum(NormalizedMinor values) / m
MajorContribution(j,e,c) = MajorAverage × MajorPercentage / 100
JudgeTotal(j,e,round) = round(sum(MajorContribution), decimalPlaces)
```

A major with no minors is treated as one direct scoring input. The minimum controls validation; the engine does **not** subtract the minimum during normalization. Custom ranges can therefore produce negative normalized scores if their minimum permits negative values. The configuration must not be interpreted as a min-to-max rescaling.

The engine records rounded normalized values, rounded major averages and rounded contribution display values, but sums **unrounded rational contributions** before rounding the judge total. Summing already displayed rounded contributions may differ by a last decimal from the authoritative total.

Source: [competition-calculation.js](../../shared/competition-calculation.js):1–28 and 66–86. Its `Q` class represents decimal inputs as rational integers, and rounds half away from zero at the configured decimal position. Zero through six output places are permitted; the default is two. Exact decimal arithmetic applies to the values actually supplied. It does not undo a floating-point conversion performed before the value reaches the engine.

### Worked example exercised against the actual engine

Assume the saved score maxima are **40, 30, 20 and 10**, and the corresponding major percentages are **40%, 30%, 20% and 10%**:

| Major | Raw / saved maximum | Normalized value | Weighted contribution |
|---|---:|---:|---:|
| Beauty | 36 / 40 | 90 | 36 |
| Stage | 27 / 30 | 90 | 27 |
| Answer | 18 / 20 | 90 | 18 |
| Appeal | 9 / 10 | 90 | 9 |
| **Judge total** | | | **90** |

For Beauty, `36/40 × 100 × 40/100 = 36`. With a saved maximum of 100, typing 36 under the same 40% major contributes **14.4**, not 36. The percentage never implicitly supplies the maximum.

With two minors 8/10 and 90/100 under a 40% parent: normalized values are 80 and 90, average is 85, contribution is **34**.

## Official methods and multiple judges

Methods come from frozen `scoringConfig.calculationMethod`; changing a request's method after publication is rejected. Complete judge totals are aggregated after each total has been rounded.

| Method | Input/formula | Exercised A totals 90, 86, 92 | Better direction |
|---|---|---:|---|
| `undecided` | No official numeric formula; publication rejects it | No official result | None |
| `weighted_average` | `sum(complete JudgeTotals) / JudgeCount` | 89.33 | Higher |
| `sum` | `sum(complete JudgeTotals)` | 268 | Higher |
| `highest_score` | `max(complete JudgeTotals)` | 92 | Higher |
| `lowest_removal` | Sort judge totals, remove configured low/high counts, average remainder | Drop one each: 90 | Higher |
| `rank_based` | Compute each judge's tied placements, sum those placements | A=4, B=5, C=9 in the probe | Lower |
| `manual` | Organizer supplies positive integer contestant ranks and reason; numeric result is null | Entered ranks retained after required verification | Lower entered rank |

Only active frozen scoring roles `judge` and `head_judge` contribute. `score_reviewer` verifies. The panel for an entry is selected through event/round/category/division scopes; no explicit assignments means event-wide scoring. Frozen-rule publication rejects incompatible panels for rank-based scopes and trimmed panels that retain no judge. See [competition-calculation.js](../../shared/competition-calculation.js):35–43 and 60–112; [competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):89–112.

Highest and trimmed methods operate on **whole judge totals**, not individual minor cells. A sum is not divided back to 100: three 100-point judges can produce 300.

For rank-based scoring:

```text
JudgePlacement = 1 + count of same-scope contestants with a strictly larger JudgeTotal
PlacementTotal = sum(applicable JudgePlacements)
```

Equal judge totals receive standard competition placements, such as `1,1,3`; no fractional mean placement is created. Incomplete contestants are excluded from a judge's placement worksheet; the global result remains provisional until all required inputs exist. Publishing requires readiness.

Manual calculations do not require complete numerical judge scores. The service validates full coverage of the selected eligible scope, unique contestant IDs and positive integer ranks. It retains supplied tie/gap choices instead of automatically reranking them. It requires a documented manual rule basis and independent reviewer approval. See [competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):216–226 and [088](../../backend/src/database/migrations/088_competition_operations.sql):114–124.

## Drafts, locks, submission and server authority

| State/action | Stored representation | Official source? | Current server gate |
|---|---|---|---|
| Typed number | React state until draft save | No | Browser validation is advisory. |
| Draft | `competition_judge_drafts`, revisioned criterion JSON | No | Active session, current context, eligible scope, open entry/criterion/intersection and bounds. |
| Lock | `competition_session_judge_scores` JSON, locked parent IDs, revision/lock metadata; flat projection and lock history | No by itself | Same gates; all inputs for that major required. |
| Submit Round | `competition_round_submissions`, copied score-source snapshots and version | Yes | Current session/rules/round/judge context, active allowed enrollment/account, complete required locks, no unresolved eligible drafts, open submission window. |
| Calculate | Immutable result/configuration snapshot with source IDs/versions/digest | Review snapshot | Organizer owns event; computes from submitted sources. |
| Verify | Reviewer/authorized procedure metadata | Verified snapshot | Current rules, same input digest, current submitted sources, no pending decisions, independent procedure where required. |
| Finalize | `finalized` status/users/times | Frozen workflow state | Verified state required. |
| Publish | `published` status/users/times | Official result | Finalized state required; overall publication completes event/session scoring. |

Draft/Lock persistence is one SQL RPC transaction, including flattened score replacement, draft removal and audit. It now avoids the old separate JSON/mirror transaction gap. Entry locks and round submission versions are serialized by event/session locks. See [099](../../backend/src/database/migrations/099_competition_round_progression_upgrade.sql):195–286, wrapped by [096](../../backend/src/database/migrations/096_competition_participation_guards.sql):119–128.

Retries are idempotent within existing saved context: an already submitted round returns its existing submission; an identical existing criterion lock returns duplicate=true. A changed locked criterion is rejected. Draft updates require the existing `draftRevision`; conflicts are rejected rather than merged blindly. Versioned SQL uses `IS NOT DISTINCT FROM` for nullable round context.

**Important gate distinction:** Draft/Lock requires an active session and open scoring gates. Submit Round instead requires `submission_window`; SQL intentionally checks that separate window before the active-status check ([099](../../backend/src/database/migrations/099_competition_round_progression_upgrade.sql):209–237). A paused/ended performance may still permit submitting previously locked scores if that window remains open. Whether the product should close that window automatically is an unresolved business-policy decision, not an assumed defect.

Scores are calculated on the backend from frozen rules and submitted source values. The request cannot supply an authoritative judge total, official numeric score or numeric-method rank. Manual rank entry is explicitly authorized, independently reviewed input.

The current independent correction invalidates affected round submissions, removes selected locks, keeps saved values and increments source revision. Prior criterion lock history remains immutable. Correcting a confirmed advancement round is rejected pending an authorized amendment. See [099](../../backend/src/database/migrations/099_competition_round_progression_upgrade.sql):353–361; [093](../../backend/src/database/migrations/093_competition_source_history.sql):2–29. The rule amendment path makes a new rule version and requires rejudging; it does not silently recalculate a previous published snapshot.

## Missing values, deductions and eligibility

Required missing inputs or a missing judge submission result in null totals and null ranks; they are never fabricated zeros. A missing applicable scoring panel is reported. Readiness requires no missing sources and at least one complete result. Current account-state checks block official transitions when a required frozen judge has become inactive, pending an approved panel amendment.

Approved `non_competing` decisions exclude the entry in the relevant round/event. The implemented decision does not distinguish no-show, disqualification, withdrawal or recusal as separate SQL decision values. A judge recusal is not a standalone action; panel changes use the acknowledged amendment flow. These are current capabilities, not new policy proposals.

Only approved deductions affect official arithmetic:

```text
NumericAdjustedRound = AggregatedJudgeTotal − ApprovedRoundDeductions
PlacementAdjustedRound = SumOfPlacements + ApprovedRoundDeductions
Overall numeric result subtracts event-wide deductions once.
Overall placement result adds event-wide deductions once.
```

There is no zero floor. Round deductions are adjusted before weighted round combination; an event-wide deduction is applied after combination. Consequently a 10-point deduction against a round weighted 60% changes a numeric weighted overall result by 6 points. This matches the current engine; it is not a universal competition convention.

Reporting uses predefined frozen penalty amount/units and an offense key; the SQL unique partial index prevents duplicate active penalties for the same event/rules/entry/offense. Pending eligibility/deduction decisions block verification/publication. Reporting and approval require distinct actors and recorded reason. Numeric deductions are not supported with manual official placements. See [competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):329–349; [089](../../backend/src/database/migrations/089_competition_verification.sql):2–25.

## Ranking and ties

```text
Submitted Raw Inputs
→ Normalized Minors
→ Weighted Major Contributions
→ Rounded Judge Totals
→ Frozen Aggregation Method
→ Approved Deductions / Round Combination
→ Rounded Final Score
→ Ranking in configured scope
```

Numeric methods sort high to low; placement totals sort low to high. Incomplete rows follow complete rows and have no rank. Automatic rank equality uses exact equality of the already rounded final score; there is no additional tolerance.

Shared ties use standard competition ranks: scores `95,90,90,85` yield `1,2,2,4`. The next rank after two tied second places is fourth. With `highest_criterion`, numeric final-score ties compare the highest major **normalized panel average**, not a weighted contribution or an individual judge's best score; a remaining equal tie key keeps the shared rank. Rank-based rules require the shared tie policy. Manual ranks are retained as entered. Source: [competition-calculation.js](../../shared/competition-calculation.js):150–159.

Top N selects the rank at the Nth contestant position and includes every rank at/better than that cutoff. Top percentage uses `ceil(entryCount × percentage/100)` positions and includes boundary ties. Both tied fifth places advance under Top 5, potentially producing six finalists. Threshold compares the requested calculated round score; for carry-forward rounds this returned score already contains prior round totals. Manual selection has no automatic qualifiers and requires an explicitly allowed manual advancement rule/reason. Nonmanual rules reject qualifier exceptions. See [advancement.js](../../backend/src/modules/advancement.js):20–94, [competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):350–363 and [099](../../backend/src/database/migrations/099_competition_round_progression_upgrade.sql):369–415.

## Round participation versus score progression

Membership progression is now separate from score carry-over:

- No elimination: eligible source-round entries resolve into the next main round; Live Control activation synchronizes the continuing roster.
- Top N/percentage/threshold/manual: the destination resolves from a verified, approved advancement decision for the current rule version. Registration and pre-existing planned membership cannot alone permit scoring there.
- Special-award rounds retain independent assignments and are excluded from ordinary combined results.

Roster resolution is in [competition-participation.js](../../shared/competition-participation.js):72–91 and [099](../../backend/src/database/migrations/099_competition_round_progression_upgrade.sql):28–72. SQL guards protect destination scoring even when the judge's UI is stale.

Score progression uses `progression`:

| Progression | Formula / scope | Example Pre=90, Final=80 |
|---|---|---:|
| `back_to_zero` | Selected Final result only; prior raw scores are not copied | 80 |
| `carry_forward` | Sum applicable prior/main round computed results through the selected Final for the Final field; ignore round/category weighting in this branch | 170 |
| `weighted` | Sum applicable round score × round weight/100; category rounds also multiply category weight/100 | At 30/70: 83 |

The older `scorePolicy='cumulative'` is not read by the official engine. Each round stores new scoring context and submitted sources. Final rules come from the published configuration; a Preliminary advancement rule selects **who** moves on, while Final progression selects **which points** count.

### Reproduced High defect: weighted official scope can include an eliminated champion

**Status: Broken for the exercised weighted-elimination scenario.** [competition-calculation.js](../../shared/competition-calculation.js):114–129 includes every entry with any included round cell and checks completeness only across the cells it has. It does not restrict the ordinary weighted overall list to the Final roster and does not require a Final cell for eliminated entries.

The probe supplies one judge, valid 0–maximum inputs, Preliminary weight40/Final weight60, Top1 membership already resolved correctly:

| Entry | Preliminary | Approved Final roster? | Final | Approved Final deduction | Returned overall |
|---|---:|---|---:|---:|---:|
| A | 100 | Yes | 0 | 10 | `100×.4 + (0−10)×.6 = 34`, rank2 |
| B | 90 | No; eliminated | No cell | None | `90×.4 = 36`, **rank1** |

The engine reports **ready=true**. Thus correct qualification/scoring guards do not by themselves establish correct overall championship scope. Back-to-zero and carry-forward branches restrict their final field; this weighted branch does not.

Recommended change **for approval only:** define the official field for weighted elimination, then enforce that field and expected included rounds consistently in the shared engine, snapshots and reports. Keep eliminated entries in round history. Acceptance: the fixture above cannot publish B as overall champion; a separate Preliminary report still retains B's90 and elimination. A stakeholder decision is required if intentionally publishing an all-entry aggregate alongside the Final championship.

## Divisions and presentation consistency

`scoringConfig.perDivision=true` restarts automatic rank numbers per division and calculates rank-based judge placements per division. Advancement groups each division separately. False/absent produces a combined ranking; merely filtering it does not recalculate global rank numbers. The probe returns Men ranks1,2 and Women rank1. Manual ranks remain supplied values.

**Medium report inconsistency:** [reports.service.js](../../backend/src/services/reports.service.js):230–237 requests division-filtered live rankings but switches to unfiltered published `resultsData.overall` whenever a publication exists. A division-specific published report can therefore include other divisions. Acceptance: the same division filter yields only that division before and after publication, without inventing new ranks.

**Medium/manual scope inconsistency:** the manual input UI maps all frozen contestants ([CompetitionTabulationWorkspace.jsx](../../frontend/src/components/organizer/competition/CompetitionTabulationWorkspace.jsx), `Verification & Audit` manual form), while the server validates only the requested eligible round field. Qualifier-only manual results may display eliminated/out-of-scope entries and reject entered extras. Overall manual calculation also uses `roundField(rules,null)`, meaning all registered entries rather than applying the numeric Final-selection branch. Required manual championship scope is a policy question; the implemented coverage and UI mismatch are explicit.

**High event-boundary validation gap:** `calculate` does not explicitly assert that `body.roundId` belongs to the event ([competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):216–225). `roundField` treats an unknown round as no round and returns all contestants; the database foreign key checks only that a round exists. In manual mode an organizer can submit all current-event ranks using an existing other-event round ID and create a mismatched calculation. No cross-event score read was demonstrated; this is a code-evidenced relation-integrity defect. Acceptance: unknown and foreign-event round IDs reject before insert for every method, while null means intentional overall scope.

**High tenant-integrity gap in scoring setup:** `addCriteriaToRound` and `removeCriteriaFromRound` authorize the URL event but do not require the supplied round and criterion to belong to it ([competition.service.js](../../backend/src/services/competition.service.js):471–512). The membership foreign keys only validate each ID independently ([015](../../backend/src/database/migrations/015_competition_scoring_foundation.sql):181–184); the frozen-setup trigger derives the event from the supplied round and rejects only when already frozen. For another organizer's draft round, a forged request through an owned draft event can therefore attach/remove criteria there. `updateRound` validates supplied division ownership but does not validate `categoryId` ownership before writing it (same service:370–408). The root audit provides a mocked service reproduction; deployed writes were not attempted. Acceptance: cross-event round/criterion/category combinations reject at the service and database boundary, including another organizer's draft, and normal same-event links remain usable.

## Verification, immutable snapshots and concurrent input changes

Current source IDs/versions, all current-rules deductions/eligibility decisions, current judge-account states, rule version and requested round contribute to a SHA-256 digest. The service compares the digest before transition. SQL verifies submitted source versions and pending decisions under an event lock. Snapshots retain worksheets/missing inputs, rules version, session, source versions and publication actors/times. Versioned result/configuration/source-version/rules fields are immutable on update. There is no ordinary unpublish endpoint; historical publications remain while a new acknowledged version requires rejudging.

**High race gap (code-evidenced, not database-executed):** the digest is computed in JavaScript outside the transition transaction ([competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):229–240). SQL compares the passed digest only to the calculation's saved digest ([088](../../backend/src/database/migrations/088_competition_operations.sql):108–113); it does not recompute the present decision/account digest under the event lock. [092](../../backend/src/database/migrations/092_competition_input_invalidation.sql):4–5 invalidates only calculated/ready/under-verification snapshots, leaving finalized snapshots unchanged.

Reproduction design, **unexecuted**:

1. Create/verify/finalize a fixture snapshot with no approved penalty.
2. Pause the organizer publication request after `tabulationData` returns its old digest and before the RPC.
3. Independently report and approve a valid penalty. Its pending state is resolved before the publication RPC; finalized status/digest remain unchanged.
4. Resume the publication RPC with the old digest. Existing submitted sources still exist and no decision is pending; static checks permit publishing the unadjusted finalized snapshot.

A current required judge account-state change in the same gap likewise is not rechecked by the transition SQL. A concurrent input change earlier than the service read is detected; this issue concerns the read-to-RPC interval.

Recommended change **for approval only:** use a database-owned input revision/digest checked under the same lock as source/decision updates, or lock/revalidate the complete authoritative set transactionally. Preserve finalized/published historical data, but refuse publishing a finalized snapshot whose authoritative revision changed. Acceptance: a deliberately interleaved approval/account change rejects stale publication, and recalculation/reverification produces the adjusted official result.

**High publication-review race gap:** criteria and registration source comparisons do not cover all validated setup. `criteriaSource` captures round identity/order/criterion links and criterion/minor definitions; `registrationSource` captures entry divisions, round identity/order/division/purpose/advancement/roster. Neither contains round weight/progression, category weight, full saved scoring configuration, enrolled judge role/activity or assignments. `freezeRules` validates these outside the SQL transaction. A concurrent draft edit of those omitted fields immediately before the publication lock can freeze stale values without the expected reload error. See [095](../../backend/src/database/migrations/095_competition_criteria_publication_guard.sql):6–22, [096](../../backend/src/database/migrations/096_competition_participation_guards.sql):7–11, [099](../../backend/src/database/migrations/099_competition_round_progression_upgrade.sql):165–171 and [competition-workflow.service.js](../../backend/src/services/competition-workflow.service.js):47–120. Acceptance: interleave edits to each omitted field between review and publication; each causes a conflict instead of freezing a stale snapshot.

## Privacy and database permissions

HTTP scoring routes require participant authentication and competition-judge enrollment; current sheet/write paths check account/enrollment/role/scopes. Official ranking/tabulation/report routes are organizer-owned. The appointed reviewer receives combined worksheets, submitted source values and calculation snapshots through a separate verified event endpoint. This is intentional reviewer visibility, not permission for ordinary scoring judges. No ordinary judge/public final-results endpoint was found; judge result visibility remains an explicit policy decision.

**High security hardening gap; deployed exposure Cannot verify:** migrations enable RLS for new rule/draft/submission/eligibility/advancement/amendment/history tables, and privileged workflow functions revoke PUBLIC execution. No repository migration enables RLS on existing `competition_scores`, `competition_session_judge_scores`, `competition_result_calculations` or `competition_deductions`; no application-table SELECT/UPDATE revocation for anon/authenticated is declared either. See [087](../../backend/src/database/migrations/087_competition_workflow.sql):225–230, [081](../../backend/src/database/migrations/081_competition_deductions.sql), [082](../../backend/src/database/migrations/082_competition_result_calculations.sql), and the whole-migration search in the audit.

HTTP-only application JWTs do not automatically restrict direct PostgREST calls made with a Supabase anonymous key. If the deployed table grants expose these RLS-disabled tables, ordinary HTTP ownership checks can be bypassed for raw scores or unpublished result snapshots, and mutation risk depends on grants. The audit did not query the project, use a key against REST, or claim a confirmed deployed breach. Acceptance: inspect a disposable deployment's `pg_class.relrowsecurity` and table/function privileges; anonymous/authenticated direct reads/mutations across all sensitive tables fail, while service-role-only application operations succeed. The exact safe policy/grant migration should be approved after that inventory.

## Exports and independent workbook verification

The .xlsx service produces real OOXML with source identities, raw values/bounds, rational-engine cached totals, ordinary Excel normalization/contribution/ROUND formulas, worksheet lock revisions, rank/result matrices, rules, source digests and publication metadata. The focused workbook test exercised an XLSX write/read round trip, colors/formulas, tampering and stale metadata detection. Import verification compares against current server sources and is **verification only**; it does not overwrite score sources. See [competition-workbook.service.js](../../backend/src/services/competition-workbook.service.js), `buildWorkbook`, `compareWorkbook`, `exportWorkbook`, `verifyWorkbook`.

Spreadsheet formula recalculation by Excel/LibreOffice was **not exercised**. Excel uses its own floating-point calculations; a serialized round trip validates cached values/formula text, not external recalculation equivalence for every midpoint.

Workbook live matrices use current tabulation data, while `Final Results` uses the selected/latest saved snapshot. Export selects latest calculation by creation time, not necessarily the latest published one. These are distinct projections and must not be interpreted as always identical official matrices after newer provisional calculations/corrections. Report CSV/JSON/SpreadsheetML/PDF paths use the report DTO; PDF is browser print/Save as PDF, not a server PDF renderer.

**Medium export safety gap:** CSV helpers only quote/escape CSV syntax; they do not neutralize spreadsheet-formula prefixes in contestant names/text ([reports.service.js](../../backend/src/services/reports.service.js):19–22; [exportReport.js](../../frontend/src/utils/exportReport.js):53–57). A value beginning `=`, `+`, `-` or `@` can be interpreted by a spreadsheet when opened, depending on application settings. No harmful formula was opened. Acceptance: harmless formula-looking names export as literal text when opened; numeric score columns retain numeric usability.

## Readiness assessment and required decisions

| Capability | Status | Basis |
|---|---|---|
| Raw normalization, major weighting and complete judge totals | Working in exercised pure cases | Focused tests and probe. |
| Five numeric official aggregation methods | Working in exercised pure cases | Focused tests and probe; no real submission journey. |
| Missing-input detection, ties, per-division ranks | Working in exercised pure cases | Probe and official unit tests. |
| Draft/Lock atomicity, duplicates, stale scoring gates | Partially working / runtime not verified | SQL path traced; no PostgreSQL or simultaneous-browser test in this audit. |
| Protected Final qualification roster | Partially working / runtime not verified | Current JS/SQL roster guards traced; arithmetic Final scope remains defective for weighted aggregation. |
| Weighted championship field after elimination | Broken in exercised case | Eliminated B ranked first with ready=true. |
| Manual selected/overall scope and foreign round validation | Partially working | Server coverage validation exists; no explicit event-round assertion and UI/overall scope mismatch. |
| Verification/finalization/publication | Partially working | Current state/source gates connected; race gap and deployed-schema uncertainty. |
| Ordinary judge privacy via HTTP routes | Partially working / runtime not verified | Event/account/scope checks traced; direct database grants/RLS unverified. |
| XLSX roundtrip verification | Working in exercised serialization case | Existing workbook tests; external Excel recalculation unverified. |
| Published division-filtered reports | Broken by source | Filter discarded when published overall rows substituted. |

No formulas were redesigned during this audit. Before implementation, settle the weighted championship field, manual Final-result field, submission-window behavior after performance closure, judge-visible results policy, and any recusal/no-show-specific rules. These are proposed decision points, not assertions of existing competition policy.

See [03_GAPS_BUGS_AND_SECURITY_FINDINGS.md](./03_GAPS_BUGS_AND_SECURITY_FINDINGS.md) and [06_PRIORITIZED_IMPLEMENTATION_PLAN.md](./06_PRIORITIZED_IMPLEMENTATION_PLAN.md) for the consolidated repair priorities. This report records source facts and exercised pure results; it does not establish deployment readiness.
