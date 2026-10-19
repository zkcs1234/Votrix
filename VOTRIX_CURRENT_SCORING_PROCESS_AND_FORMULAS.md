# VOTRIX Current Competition Scoring Process and Formulas

This report explains the current VOTRIX Competition Scoring working tree based on source inspection on October 12, 2026. It covers score entry, criterion contributions, judge totals, official methods, rankings, ties, advancement, rounds, and divisions.

**Subsequent implementation note:** The [Scoring Rules UI redesign](VOTRIX_SCORING_RULES_REDESIGN.md) preserves the calculation engine and formulas documented here. It also fixes the manual-results advancement limitation recorded in section 8: advancement now reads a current verified manual placement snapshot. The original analysis below is retained as the source-inspection record preceding that fix.

The current official workflow uses **raw scores → weighted total for each judge → the selected official method → contestant rankings**.

**Round participation update:** The [Final round progression fix](VOTRIX_FINAL_ROUND_PROGRESSION_FIX.md) preserves these formulas while connecting source-round eligibility to subsequent rosters. No Elimination continues eligible source entries without a qualification decision; elimination uses verified approved results. Numeric threshold qualification requires numeric official results. The analysis below records the earlier source inspection.

This is analysis only. No code, UI, database, API, routes, or application behavior was changed to produce this report. Only this Markdown file was created for this request. Examples describe the code's behavior, not a particular event's deployed configuration. The numerical examples were evaluated against the existing pure calculation function in memory; no application scoring submission or connected database operation was executed.

The main calculation source is [shared/competition-calculation.js](shared/competition-calculation.js), especially `calculateOfficial`. Events without published official rules still have a retained legacy ranking branch. The official-method options discussed here use the versioned workflow described below. The branch selection is implemented in [backend/src/services/pageant.service.js](backend/src/services/pageant.service.js), `getLiveRankings`.

## 1. How Judges Enter Scores

Judges normally enter a **raw numeric score for each minor criterion** beneath a major criterion. If a major has no minors, the implementation supports scoring that major directly using its saved bounds.

The available minor scales are:

| Configured scale | Minimum | Maximum |
|---|---:|---:|
| 1–100 | 1 | 100 |
| 1–10 | 1 | 10 |
| Decimal | 0 | 10 |
| Custom range | Saved custom minimum | Saved custom maximum |

Bounds come from the published rules. A **40% major criterion does not automatically give its inputs a maximum of 40**. Its inputs could instead use 1–100, 1–10, or a custom range.

Weights are represented as:

- **Major criterion:** `percentage`, such as `40` for 40%.
- **Minor criterion:** its own score range; minors contribute equally within their parent.
- **Round:** a separate `weight` used when combining round results.

The scoring input supplies a `0.5` step to the numeric control. Server validation checks finite numeric values against the frozen minimum and maximum; it does not enforce an exact half-point increment.

The current saving sequence is:

1. Typing updates local values and schedules draft saving after approximately **800 ms**.
2. **Lock** validates and commits all inputs belonging to one major criterion for one contestant.
3. After completing the required locks, the judge presses **Submit Round**.
4. That action creates a versioned submission containing the saved score sources.

**Official calculation reads submitted-round snapshots. Drafts and locks alone are not official round submissions.** The calculation receives the submitted score sources from `competition_round_submissions`, scoped to the current session and rules version.

Evidence:

- [Shared input bounds](shared/competition-criteria-readiness.js), `scoringInputBounds`.
- [Judge scoresheet](frontend/src/components/voter/competition/CompetitionScoringForm.jsx), `critColumns`, `boundsFor`, and `ScoreInputComponent`.
- [Judge scoring page](frontend/src/pages/voter/JudgeScoringPage.jsx), `onScoreChange`, `buildCriterionPayload`, `submitCriterion`, and the Submit Round action.
- [Judge draft saving](frontend/src/hooks/useJudgeScoreDrafts.js), `changed`, `save`, and `flush`.
- [Scoring persistence and round submission SQL](backend/src/database/migrations/087_competition_workflow.sql), `competition_scoring_write`.
- [Official source loading](backend/src/services/competition-workflow.service.js), `tabulationData`.

## 2. Individual Criterion Score Formula

For each scored minor, the actual formula is:

```text
MinorPercent = RawScore / MinorMaximum × 100
```

For a major containing several equally weighted minors:

```text
MajorAverage = arithmetic mean of its MinorPercent values
CriterionContribution = MajorAverage × MajorWeight / 100
```

When minor weights are configured as **overall-round percentages**, each minor's percentage is a direct share of the round. The minor percentages under a major must sum to the major's percentage:

```text
CriterionContribution = Σ (MinorPercent × MinorWeight / 100)
Σ MinorWeight = MajorWeight
```

For example, a 30% major with three minors weighted 10% each contributes 10% for each perfectly scored minor. A score of 80/100 on one minor contributes 8 points. The engine records the normalized major `average` and its weighted `contribution`. **The contribution is what enters the judge's total.**

For a directly scored major without minors, the engine uses one input with that major's saved maximum. The same normalization and weighting apply.

### Example: 40% Weight and a Score of 36/40

```text
Weight = 40%
Raw score = 36
Saved maximum = 40

MinorPercent = 36 / 40 × 100 = 90
CriterionContribution = 90 × 40 / 100 = 36
```

Therefore, the contribution is **36 points**, but the system obtains it through normalization and weighting.

The saved maximum matters:

| Raw input | Saved maximum | Major weight | Contribution |
|---:|---:|---:|---:|
| 36 | 40 | 40% | 36 |
| 36 | 100 | 40% | 14.4 |
| 90 | 100 | 40% | 36 |
| 9 | 10 | 40% | 36 |

The criterion weight and the score maximum are independent configuration values. The system does not automatically interpret a typed `36` as `36/40` merely because the major weight is 40%.

### Example: A Major with Multiple Minor Criteria

Suppose a 40% major contains scores of **8/10** and **90/100**, with direct round weights of **10%** and **30%**:

```text
Normalized minors = 80 and 90
Contribution = 80 × 10 / 100 + 90 × 30 / 100 = 35
```

The 10% + 30% minor weights equal the 40% major weight. Older frozen configurations without the overall-round minor-weight basis retain their original relative-weight calculation; editable legacy configurations are converted to equivalent direct percentages before saving.

The minimum restricts valid input. Normalization **divides by the maximum without subtracting the minimum**. The engine does not use `(RawScore − Minimum) / (Maximum − Minimum)`.

Evidence: [shared/competition-calculation.js](shared/competition-calculation.js), `calculateOfficial`, the criterion/minor loop containing `normalized.push`, `mean(normalized)`, and the `weighted` contribution.

## 3. One Judge's Total for One Contestant

The current formula is:

```text
JudgeTotal = round(sum of weighted CriterionContributions, decimalPlaces)
```

The engine sums the unrounded contributions, then rounds the judge total. Individual contribution values shown in the worksheet are also rounded for display.

The following example matches the implementation **when the saved input maxima actually are 40, 30, 20, and 10**:

| Criterion | Weight | Raw score / maximum | Weighted contribution |
|---|---:|---:|---:|
| Beauty of Face | 40% | 36/40 | 36 |
| Stage Projection | 30% | 27/30 | 27 |
| Answering Questions | 20% | 18/20 | 18 |
| Overall Appeal | 10% | 9/10 | 9 |
| **Judge total** | **100%** | | **90** |

```text
JudgeTotal = 36 + 27 + 18 + 9 = 90
```

The same contributions result from entering **90/100 for each criterion**, with those four weights.

With weights totaling exactly 100%, this is a 100-point judge total. Required active weights are checked against 100% with a **0.001 percentage-point tolerance**.

The official engine uses exact rational arithmetic for the contribution calculations. Decimal precision is configurable from zero through six places, with a two-place fallback. Judge totals are rounded before aggregation across judges. Round results and combined results are also rounded at their calculation stages. The rounding implementation rounds positive halfway values upward and negative halfway values away from zero.

Evidence:

- [Official arithmetic and judge worksheets](shared/competition-calculation.js), `Q`, `Q.rounded`, and `calculateOfficial`.
- [Criterion readiness and weight tolerance](shared/competition-criteria-readiness.js), `CRITERIA_WEIGHT_TOLERANCE` and `evaluateCriteriaReadiness`.

## 4. Multiple Judges

The engine first calculates each applicable judge's complete weighted total. It then applies the selected, published method to those totals.

For one contestant, assume:

```text
Judge 1 = 90
Judge 2 = 86
Judge 3 = 92
```

These totals are **equally weighted judges**; criterion weighting happens inside each judge's total. The published method determines whether the system averages, sums, selects the highest total, removes extreme totals before averaging, or converts totals into judge placements.

For numeric methods, a missing required judge submission or scoring input does not become zero. A contestant lacking complete required totals receives a **null score and null rank**. Other complete contestants may have provisional results while the overall calculation remains incomplete.

Only the scoring judges applicable to a contestant's scope are used. Judge and head-judge roles contribute scores; score-reviewer roles perform verification rather than contributing a scoring total.

Evidence: [shared/competition-calculation.js](shared/competition-calculation.js), `scopeAllows` and the judge-total/aggregation loop in `calculateOfficial`.

## 5. Official Scoring Methods Available in the UI

The examples below assume the complete judge totals **90, 86, and 92**, two decimal places, and no deductions.

| Current UI option | Stored method | Input and actual formula | Example result | Ranking direction |
|---|---|---|---|---|
| **Not yet decided — draft only** | `undecided` | No numeric official calculation. Publication rejects this choice. | No official score | No official ranking |
| **Score-based: average of weighted judge totals** | `weighted_average` | `sum(JudgeTotals) / JudgeCount` | `(90 + 86 + 92) / 3 = 89.33` | Higher is better |
| **Score-based: sum of weighted judge totals** | `sum` | `sum(JudgeTotals)` | `90 + 86 + 92 = 268` | Higher is better |
| **Rank-based: sum of tied judge placements** | `rank_based` | Rank contestants within each judge's totals, then sum those placements | Requires other contestants; example below | Lower is better |
| **Highest judge total** | `highest_score` | `max(JudgeTotals)` | `92` | Higher is better |
| **Average after removing extreme judge totals** | `lowest_removal` | Sort totals; remove configured lowest/highest counts; average the remainder | Drop one lowest and one highest: `[86, 90, 92] → [90] → 90` | Higher is better |
| **Manual official results with independent approval** | `manual` | Organizer supplies contestant ranks and a reason; no numeric aggregation formula | Enter B=1, A=2, C=3; these become the result ranks after approval | Lower entered rank is better |

The `sum` example produces **268 points**, potentially out of 300 for three judges each scoring out of 100. It is not converted back to a percentage.

A contestant's rank requires comparison with other contestants in the applicable ranking scope. Its own three judge totals establish its score, but do not establish its placement by themselves.

### Extreme-Score Removal

- `dropLowest` and `dropHighest` specify **counts of whole judge totals**.
- Zero removal counts produce the ordinary mean.
- Publication checks that removal retains at least one applicable judge.
- The engine rejects removal counts that exhaust the panel.

The removal takes place after each judge's weighted total has been calculated. It does not remove individual minor-criterion scores in this official path.

### Rank-Based Example

The placement assigned by each judge is:

```text
JudgePlacement = 1 + count of contestants with a strictly higher JudgeTotal
```

Consider these complete totals:

| Contestant | Judge 1: total → placement | Judge 2: total → placement | Judge 3: total → placement |
|---|---|---|---|
| A | 90 → 1 | 86 → 2 | 92 → 2 |
| B | 90 → 1 | 88 → 1 | 90 → 3 |
| C | 80 → 3 | 86 → 2 | 95 → 1 |

Equal judge totals share a placement. They do **not** receive fractional averaged placements.

```text
A = 1 + 2 + 2 = 5
B = 1 + 1 + 3 = 5
C = 3 + 2 + 1 = 6
```

Result:

```text
A: rank 1
B: rank 1
C: rank 3
```

The engine requires compatible judge panels within the ranking scope when publishing rank-based rules.

### Manual Official Results

Manual calculation stores the supplied positive integer ranks with `manual=true`; numeric score fields remain null. It requires every eligible entry in the selected scope, a recorded reason, and independent verification before finalization/publication. It does not require complete numerical judge totals.

The numeric engine does not recalculate manual ties or rank gaps. Supplied ranks are preserved.

Evidence:

- [Official-method UI](frontend/src/components/organizer/competition/CompetitionRulesEditor.jsx).
- [Judge-total aggregation and placement calculation](shared/competition-calculation.js), `calculateOfficial`.
- [Publication constraints and manual calculation](backend/src/services/competition-workflow.service.js), `freezeRules` and `calculate`.

## 6. Ranking and Official Publication

The numerical process is:

```text
Submitted Judge Raw Scores
  → Normalized Minor Scores
  → Weighted Major Contributions
  → Rounded Judge Total
  → Selected Official Method
  → Approved Deductions and Round Combination
  → Contestant Result
  → Ranking within the configured scope
```

Approved deductions affect the resulting score:

- **Score-based methods:** subtract approved deduction points.
- **Rank-based method:** add approved placement points.
- There is no zero floor.
- Round deductions affect their round; event-wide deductions apply once to the overall result.

The engine sorts:

```text
Score-based: highest finalScore first
Rank-based: lowest finalScore first
Incomplete: after complete results, with no rank
```

For example, with average-based scores of **89.33, 89.33, and 87**, the shared-rank policy gives ranks **1, 1, and 3**.

Calculation and publication are separate:

```text
Calculate → Verify → Finalize → Publish
```

Calculate creates a versioned result snapshot. Verification checks the calculation and its source versions. Finalization requires verification; publication requires finalization. Pending deduction or eligibility decisions prevent the official transition.

A published snapshot supplies the official results. Current versioned published ranks are preserved when read.

Evidence:

- [Result adjustment, sorting, and ranking](shared/competition-calculation.js), `calculateOfficial`.
- [Versioned calculation and transition checks](backend/src/services/competition-workflow.service.js), `calculate`, `transitionCalculation`, and `reviewerVerify`.
- [SQL publication transitions](backend/src/database/migrations/088_competition_operations.sql), `competition_result_transition`.
- [Published ranking lookup](backend/src/services/pageant.service.js), `getOfficialRankings`.

## 7. Current Tie Handling

For automatic numeric rankings, equality is tested using the calculated, rounded `finalScore` with exact equality. There is no additional ranking tolerance.

### Shared Tie Policy

With the **shared** tie policy, standard competition ranks are assigned:

```text
Scores: 95, 90, 90, 85
Ranks:   1,  2,  2,  4
```

The next position after two contestants tied for second is **fourth**.

### Highest Major Criterion Tie Policy

With **highest major criterion**:

1. Compare final scores.
2. For each contestant, average each major's normalized value across its complete judge worksheets.
3. Take the highest of those major averages.
4. Compare that value between tied contestants.
5. If both final score and tie value remain equal, retain the shared rank.

This uses the major's **normalized average**, rather than its weighted contribution or the best individual judge's score. The code's tie key has a zero floor: `Math.max(0, ...majorPanelAverages)`.

Example with two 50% majors:

```text
A: major averages 100 and 80 → total 90 → tie value 100
B: major averages  90 and 90 → total 90 → tie value  90
```

A ranks above B under that policy.

Rank-based scoring requires the shared tie policy. Manual results retain their entered ranks.

### Tie at an Advancement Cutoff

For Top 5:

```text
Ranks: 1, 2, 3, 4, 5, 5, 7
```

**Six contestants automatically qualify**, because both fifth-place contestants share the cutoff rank. If the configured highest-major policy has already broken a numeric tie, advancement uses the resulting distinct ranks.

Organizer overrides can explicitly add/remove eligible qualifiers with a recorded reason. Both cutoff ties advance in the **automatic selection**, subject to those explicit overrides.

Evidence:

- [Tie key and standard competition ranking](shared/competition-calculation.js), the final sorting and ranking portion of `calculateOfficial`.
- [Boundary-tie advancement](backend/src/modules/advancement.js), `cutoffRankForCount` and `selectQualifiers`.

## 8. Round Process and Advancement

The implemented numerical journey is:

```text
Preliminary Round
  → Judges enter scores, lock criteria, and Submit Round
  → Calculate and verify Preliminary standings
  → Confirm Top 5 qualifiers, including cutoff ties
  → Organizer activates Final

Final Round
  → Qualifiers receive the Final scoring scope
  → Judges enter new Final scores and Submit Round
  → Calculate, verify, finalize, and publish results
```

Confirmation stores the qualifier decision and replaces the next round's contestant membership with those qualifiers. Activating the next round is a separate organizer action. New round scores retain their own round context; selecting the next round does not automatically copy the previous raw scores into it.

### Advancement Formula

For Top N, the helper finds the rank at the **Nth contestant position**, then includes every contestant whose rank is at or above that cutoff:

```text
CutoffRank = rank of the Nth contestant
Advance when ContestantRank <= CutoffRank
```

Other implemented modes are:

| Advancement mode | Current selection |
|---|---|
| None | Everyone continues |
| Top percentage | Select `ceil(contestantCount × percentage / 100)` positions, including cutoff ties |
| Minimum score | Returned scoring result must meet the threshold |
| Manual selection | No automatic qualifiers; organizer selections supply the set |

Confirmation requires complete scoring sources and a verified round calculation.

Two current implementation details matter:

- Threshold selection receives the requested round's `finalScore`; with carry-forward progression, that returned score already includes earlier rounds.
- Manual **official scoring** currently does not pass the advancement handler's readiness check: its live tabulation state has `ready=false`, even when a manual calculation snapshot has been created and verified. Manual advancement selection for a numerical scoring method is a separate setting.

### Does Final Start from Zero or Carry Preliminary Scores?

Whether Preliminary points affect the final result depends on the saved **`progression`** value:

| Final progression | Current formula | Example: Preliminary 90, Final 80 |
|---|---|---:|
| **`back_to_zero`** | Use the selected Final round's result only | **80** |
| **`weighted`** | Combine included round results using stored round contributions | At 30% / 70%: `90×0.30 + 80×0.70 = 83` |
| **`carry_forward`** | Add applicable earlier round results and the Final result | `90 + 80 = 170` |

Carry-forward adds computed round results and ignores their round/category contribution weights in that final carry-forward branch. It retains contestants in the Final field.

For the weighted combination, the code applies:

```text
RoundContribution = RoundResult × RoundWeight / 100
```

A round belonging to a category also receives that category's weight:

```text
CategorizedContribution =
    RoundResult × RoundWeight / 100 × CategoryWeight / 100
```

Special-award rounds are excluded from the ordinary combined result. In the general combination branch, a round marked `carry_forward` uses a 100% round factor.

The Create Round form currently defaults to an independent result, represented by `back_to_zero`. Existing events use their published configuration. The selected overall-result round comes from `finalRoundId`, then Final-purpose fallback, or the sole round.

**The current official engine uses `progression`. It does not read the older `scorePolicy='cumulative'` field**, even though that field remains exposed in advancement settings.

Evidence:

- [Official round calculations](shared/competition-calculation.js), `calculateOfficial` and `carryTotals`.
- [Qualifier preview](backend/src/services/competition-session.service.js), `previewRoundAdvancement`.
- [Current advancement handler](backend/src/services/competition-workflow.service.js), `organizerAction`, action `advancement`.
- [Qualification selection and overrides](backend/src/modules/advancement.js), `selectQualifiers` and `applyQualifierOverride`.
- [Round activation and confirmed membership changes](backend/src/database/migrations/088_competition_operations.sql), `competition_operational_action` and `competition_confirm_advancement`.
- [Current Create Round defaults](frontend/src/utils/competitionRoundForm.js), `roundFormValues`.
- [Round progression and advancement settings](frontend/src/components/organizer/competition/CompetitionRoundSettings.jsx), `ProgressionForm` and `AdvancementForm`.

## 9. Divisions: Men and Women

Automatic division ranking is controlled by **`scoringConfig.perDivision`**:

| Setting | Current behavior |
|---|---|
| `false` or absent | Men and Women participate in one combined ranking |
| `true` | Rank numbers restart independently within each division |

With `perDivision=true`:

- Numeric scores are ranked separately for Men and Women.
- Rank-based judge placements are also calculated separately within each division.
- Top 5 advancement is evaluated per division—potentially five Men and five Women, plus cutoff ties.

Simply creating divisions does not enable separate rankings. Filtering a combined ranking to Men does not recalculate its existing global rank numbers.

For manual official results, the entered ranks are preserved; the flag does not automatically regroup and rerank those manual entries.

Evidence:

- [Division ranking and judge placements](shared/competition-calculation.js), `calculateOfficial`.
- [Division advancement groups](backend/src/services/competition-workflow.service.js), `organizerAction`, action `advancement`.
- [Official ranking filters](backend/src/services/pageant.service.js), `getLiveRankings` and `getOfficialRankings`.
- [Division-ranking configuration checkbox](frontend/src/components/organizer/competition/CompetitionRulesEditor.jsx).

## 10. Simple Formula Summary

| Item | Current VOTRIX behavior |
|---|---|
| **A. Criterion Score Formula** | Equal minors: `mean(RawMinor / MinorMaximum × 100) × MajorWeight / 100`. Overall-weighted minors: `Σ((RawMinor / MinorMaximum × 100) × MinorWeight / 100)`, where minor weights sum to the major weight. A direct-scored major uses one input. |
| **B. Judge Total Formula** | Round the sum of that judge's weighted criterion contributions. |
| **C. Multiple-Judge Formula** | Aggregate complete submitted judge totals using the published method. Required missing totals remain incomplete. |
| **D. Official Method Formula** | Average, sum, maximum, trimmed average, summed judge placements, or manually entered ranks. `undecided` produces no official result. |
| **E. Ranking Formula** | Higher adjusted numeric scores rank first; lower adjusted placement totals rank first. Apply within the configured scope. |
| **F. Tie Formula** | Equal final scores share standard competition ranks; optional highest-major comparison can break numeric ties. Manual ranks remain as entered. |
| **G. Advancement Formula** | Top N selects every contestant with `rank <= rank at the Nth position`, including cutoff ties, followed by explicit organizer overrides. |
| **H. Final Round Formula** | `back_to_zero`: Final only. `weighted`: weighted round combination. `carry_forward`: sum applicable round results through Final. |
| **I. Division Formula** | `perDivision=true`: separate automatic ranks, judge placements, and advancement per division. Otherwise, combined ranking. |

This report records the implemented behavior. It does not propose changes, redefine any method, or establish which configuration is saved for a particular deployed competition.
