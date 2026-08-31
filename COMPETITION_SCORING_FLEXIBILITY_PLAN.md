# VOTRIX Competition Scoring — Flexibility Audit & Implementation Plan

> **This is a plan, not a modification.** It reports the *verified* current behavior of the scoring
> engine against a generic (non-pageant) set of requirements, then proposes safe, config-driven
> improvements using the existing architecture. Nothing here changes code yet.
>
> Findings below were **verified by running the actual engine** (`backend/src/modules/scoring-engine.js`),
> not read from memory or taken from the request as given.

---

## 1. How scoring works today (the real pipeline)

The engine already separates the levels the request recommends. Verified data flow:

```
SCORING SCALE          scoring_config.scoreType (1–10 / 1–100 / decimal / custom)  ─ resolveScoreBounds()
      ↓
CRITERION SCORE        judge scores each criterion (validated against the scale)
      ↓
JUDGE AGGREGATION      reduceScores(): per-criterion AVERAGE across judges (or sum / high / drop-N)
      ↓
CRITERIA WEIGHT        criterion.percentage, normalized WITHIN the round → each round's score
      ↓
ROUND WEIGHT           round.weight/100 → round contribution
      ↓
FINAL SCORE            Σ round contributions → rank
```

Core functions: `computeRankings` (entry), `computeScopedPerRound` (per-round criteria, the correct
path), `computeLegacyPerRound` (flat fallback), `combineRoundsToFinal` (rounds→final), `reduceScores`
(judge aggregation), `resolveScoreBounds` / `isScoreInBounds` (scale), `assignRanks` (ties).
Consumers: `pageant.service.js#getLiveRankings` (live rankings), `competition-session.service.js#computeRoundStanding`
(finalize snapshots), `assertScoringWeightsValid` + `startSession` pre-flight (validation).

**Important correction to the request's premise:** the "70.35 instead of 84.75" is not one number
being miscalculated. `84.75` is the *round score*; `16.95` is its *20% contribution*. `70.35` was the
*overall* produced in **legacy mode** (criteria not linked to rounds) where every round reused all
criteria and the score was multiplied by the sum of round weights. That specific defect is **already
fixed** (per-round isolation + legacy weight normalization). This plan covers what is *still* missing
for full multi-type flexibility.

---

## 2. Verified findings — requirement by requirement

Legend: ✅ correct · 🟡 works but limited · 🔴 defect/missing. "Verified" = run through the engine.

| # | Requirement | Status | Verified finding |
|---|---|---|---|
| 1 | Multiple judges, no double-count | ✅ | Per-criterion average across judges, then weight. Mathematically identical to "per-judge score then average" (linear), so **no double application**. Verified: 5 identical judges → 84.75; avg of (90,80,70,60,100) → 80. |
| 2 | Round + criteria weighting | ✅ | Criteria 100% *within* the round → round score → × round weight. Verified A: 84.75 → 16.95. |
| 3 | Different scales (1–10 / 1–100 / custom) | ✅ | Math is scale-agnostic; bounds from `resolveScoreBounds`; input validated by `isScoreInBounds`. **No 1–100 assumption.** Verified B (1–10): 8.45 → 1.69. |
| 4 | No round weights configured | 🔴 | Each round defaults to `weight 100`; scoped mode then **SUMS** them. Verified E (5 rounds, no weights, each 80) → **400** (should be equal-weight → 80). Legacy path normalizes, scoped does not — inconsistent. |
| 5 | Criteria-only competition | ✅ | Verified D (40/35/25 on 80/90/70) → **81.0** (correct; the request's "81.5" is wrong). |
| 6 | Round with one overall score (no criteria) | 🔴 | **Not supported.** A round with no criteria yields value 0 (verified). There is no "single score per round" concept. |
| 7 | Criteria without weights | 🔴 | Verified (two criteria, no `percentage`, 80 & 60) → **0** (should equal-weight → 70). |
| 8 | Weight validation / auto-distribution | 🟡 | `assertScoringWeightsValid` checks totals = 100% (scope-aware), but does **not** auto-distribute missing weights; the engine silently zeroes them (see #7) rather than falling back. |
| 9 | Different competition types | ✅ | Engine is generic — **no pageant hard-coding**. Verified across scales, criteria-only, multi-round. |
| 10 | Divisions/categories isolation | ✅ | `getLiveRankings` and `computeRoundStanding` filter contestants/scores per division; one division never affects another. |
| 11 | Judge assignment/eligibility | ✅ | `canJudgeScore` enforces event/division/category/round scope on submit. |
| 12 | Live recalculation, no dup | ✅ | Live submit writes through (delete-then-insert) to the ranking store; rankings recompute on read. No duplicate counting. |
| 13 | Incomplete judging (2 of 5) | 🟡 | Averages **only submitted** judges — missing judges are **not** treated as 0 (correct). But the ranking output doesn't clearly flag "pending vs a real 0"; `judgeCount` exists but isn't surfaced as an incomplete state. |
| 14 | Judge edits a score | ✅ | Live path updates the existing row and re-bridges (delete-then-insert) → uses the new value, not old+new. |
| 15 | Dropped/removed scores | ✅ | `LOWEST_REMOVAL` with `dropHighest`/`dropLowest`, applied only when that method is configured. |
| 16 | Ties, configurable | 🟡 | Equal-rank ("1224") + one optional tiebreaker (`highest_criterion`). Works but only a single tiebreak strategy. |
| 17 | Rounding / precision | 🟡 | `round2` is applied at **each** stage (per-criterion, per-round, final). Small accumulation is possible; precision should be kept until the final display. |
| 18 | Ranking uses final weighted score | ✅ | Ranks by `finalScore`; live rankings update on new scores. |
| 19 | Auditability | 🟡 | Engine returns `perCriterion` / `perRound` / `perCategory` + `debug` totals (traceable); `recordAudit` logs submit/finalize. No single "explain this score" object combining scale + weights + method + judges. |

### Test examples — actual engine output

| Example | Expected | Engine output | Verdict |
|---|---|---|---|
| A — 1–100, 1 judge (90,89,78,80) | round 84.75, contrib 16.95 | 84.75 / 16.95 | ✅ |
| B — 1–10 (9,8,7,10) | scale-correct | 8.45 / 1.69 | ✅ |
| C — 5 judges | aggregate once | 84.75 (identical); 80 (avg) | ✅ |
| D — criteria-only 40/35/25 | direct from criteria | 81.0 | ✅ (request's 81.5 is wrong) |
| E — 5 rounds, no weights | defined fallback | **400 (summed)** | 🔴 |
| F — round, one overall score | 85 becomes round score | **0 (unsupported)** | 🔴 |
| G — 3 of 5 judges | pending, not zero-filled | averages the 3 (not 0) | 🟡 (calc ok, state not surfaced) |
| H — edit 85→90 | uses 90 | replaces (uses 90) | ✅ |
| I — two divisions | isolated | isolated | ✅ |

**Bottom line:** the engine is already correct and generic for the *common* cases (multi-judge, scales,
criteria-only, divisions, edits, live recompute). The flexibility gaps are four specific behaviors:
**no-round-weight fallback (E)**, **criteria-without-weights (7)**, **round-with-one-score (F)**, and
robustness of **weight validation/auto-distribution (8)** — plus three polish items (rounding, ties, audit).

---

## 3. Gap analysis → what "flexible" requires

| Gap | Current | Required (flexible) | Priority |
|---|---|---|---|
| **G1 — Equal-weight round fallback** | Rounds w/o weights are summed (scoped) → can exceed scale | If round weights are absent/invalid, distribute **equally** across rounds | High |
| **G2 — Equal-weight criteria fallback** | Criteria w/o `percentage` → score 0 | Missing criteria weights → **equal** weights within the round | High |
| **G3 — Round with a single overall score** | Round with no criteria → 0 | Support a round scored by **one overall value** (no criteria), on the event scale, then round-weighted | High |
| **G4 — Weight validation & auto-distribution** | Totals checked; missing → silent 0 | Validate + optionally **auto-equalize** missing weights; never silently zero | Medium |
| **G5 — Precision / rounding** | Rounds at each stage | Full precision internally; round only at final/display | Medium |
| **G6 — Tie-break options** | One strategy | A small **configurable** set (e.g. decisive round/criterion, then head-judge) | Low |
| **G7 — Incomplete-state surfacing** | Correct average, no flag | Ranking output flags **pending** (judges submitted / expected) | Low |
| **G8 — Score explainability** | Breakdown exists | A single **trace** object per score (scale, per-criterion, weights, method, judges) | Low |

None of these require pageant-specific code — they make the *generic* engine handle more configurations.

---

## 4. Implementation plan (safe, config-driven, using existing architecture)

Every change is **feature-guarded** so existing, correctly-configured events produce identical numbers.
Each phase ends with engine unit tests + a full-suite run.

### Phase A — Equal-weight fallbacks (G1, G2, G4) · engine-only, no migration
- **G2 (criteria):** in `computeScopedPerRound` / `computeLegacyPerRound`, when a round's criteria all
  have missing/zero `percentage`, treat them as **equal** (`1/n` each) instead of dividing by 0.
  Formula: `effectiveWeight_i = percentage_i present ? percentage_i/Σpresent : 1/n`.
- **G1 (rounds):** in `computeRankings`, when `Σ round.weight` is 0 or all weights are absent, assign
  each round `100/n`. This generalizes the existing legacy normalization to the **scoped** path too, so
  Example E → 80 (equal) instead of 400. Guard: only when weights are absent/zero — a real weight set is untouched.
- **G4 (validation):** `assertScoringWeightsValid` gains a mode: if weights are **entirely absent**, pass
  (equal distribution will apply) instead of failing; if **partially** set and don't total 100%, keep
  failing (genuine misconfiguration). Mirror in the `startSession` pre-flight and the Workspace UI hint.
- **Files:** `scoring-engine.js`, `competition.service.js#assertScoringWeightsValid`,
  `competition-session.service.js` (pre-flight), Workspace 100% badges.
- **Tests:** E → 80; criteria-no-weight (80,60) → 70; partial weights still rejected; a fully-weighted
  event is byte-identical (snapshot).
- **Migration:** none. **Back-compat:** guarded on "weights absent" — configured events unchanged.

### Phase B — Round scored by one overall value (G3, Example F) · small additive column
- **Model:** add `competition_rounds.scoring_mode VARCHAR(16) DEFAULT 'criteria'` — `'criteria'`
  (today) or `'overall'` (one score per judge). Additive, nullable-safe, reversible.
- **Submit:** an `'overall'` round accepts a single score per judge (stored against a synthetic/implicit
  criterion or a dedicated `overall_score` on the session-score row), validated by the scale.
- **Engine:** for an `'overall'` round, the round score = judge-aggregate of the overall scores (no
  criteria weighting), then × round weight — the same combine step downstream.
- **Judge UI:** when the active round is `'overall'`, render one score box instead of the criteria grid
  (reuses the existing scoring form's inputs; no new page).
- **Files:** migration `NNN_round_scoring_mode.sql`, `scoring-engine.js`, `submitJudgeSessionScore` +
  `getJudgeSessionView`, `computeRoundStanding`, Workspace Rounds tab (mode selector),
  `CompetitionScoringForm`.
- **Tests:** F (85 → round 85 → × weight); mixed event (some criteria rounds + one overall round);
  aggregation of 5 judges' overall scores.
- **Migration:** yes (one additive column + down-migration). **Back-compat:** default `'criteria'` = today.

### Phase C — Precision & rounding (G5) · engine-only, no migration
- Carry **full precision** through per-criterion → per-round → final; apply `round2(dp)` **only** to the
  values returned for display (`average`, round `value`, `finalScore`). Keep raw internals unrounded so
  multi-round, multi-criteria sums don't accumulate error.
- **Files:** `scoring-engine.js`. **Tests:** a crafted case where staged rounding vs final rounding
  differ (assert the final-only result). **Back-compat:** results shift by ≤1 ulp at `dp`; snapshot-test
  and accept as a correctness improvement (guardable behind a flag if you want zero drift on old events).

### Phase D — Configurable tie-breaks & incomplete state (G6, G7) · mostly additive
- **G6:** extend `scoring_config.tieBreaker` from one option to a small ordered list
  (`highest_in_round:<id>` | `highest_criterion:<id>` | `highest_single` | `head_judge`), resolved in
  `assignRanks`. Default stays "equal ranks."
- **G7:** `getLiveRankings` already knows `judges.total`; add per-contestant
  `{ judgesSubmitted, judgesExpected, complete }` to each ranking row so the UI can show **pending**
  distinctly from a real 0. No math change.
- **Files:** `scoring-engine.js`, `getLiveRankings`, rankings UI. **Migration:** none (config in
  `scoring_config`). **Back-compat:** default behavior unchanged.

### Phase E — Score explainability (G8) · additive, read-only
- Add `explainScore(contestantId)` returning the full trace: scale, each criterion (raw judge scores →
  aggregate → weight → contribution), round score, round weight, final — built from data the engine
  already computes. Surfaced on demand (report/verify view). No scoring change.

---

## 5. Validation rules the engine should enforce (summary)

- **Scale:** every submitted score must satisfy `isScoreInBounds(scoreType)`; the **scale is the single
  source of truth** for range (per-criterion min/max are display-only / optional override within scale).
- **Criteria weights:** per round, present weights must total 100%; **all absent → equal**; **partially
  set but ≠100% → reject** with a clear message naming the round.
- **Round weights:** across the event (or within a category/division scope), present weights total 100%;
  **all absent → equal**; partially set but ≠100% → reject.
- **Never silently zero** a missing weight — either equal-distribute or reject.

---

## 6. Risks, sequencing, back-compat

| Item | Risk | Mitigation |
|---|---|---|
| Equal-weight fallbacks (A) | Changes only currently-broken configs (0 or summed) | Guard on "weights absent/zero"; snapshot-test a fully-weighted event = identical |
| Overall-score rounds (B) | New column + submit/UI branch | Additive column default `'criteria'`; reversible; feature-scoped to rounds that opt in |
| Precision (C) | Tiny numeric drift on old events | Snapshot before/after; optional flag to pin old events |
| Ties/incomplete (D) | Low — additive | Defaults preserve current behavior |
| Explain (E) | None (read-only) | — |

**Sequencing:** A → C (pure engine, highest value, no migration) → D → B (needs a migration + UI) → E.
Do A and C first: they fix the real correctness gaps (E=400, criteria-no-weight=0, rounding) with zero
schema change and the broadest benefit across competition types.

**Back-compat guarantee:** a properly-configured event today (criteria linked to rounds, weights total
100%, scale set) is **unaffected** by every phase — verified by keeping the existing snapshot tests green.

---

## 7. Alignment with the recommended design

The requested three-level separation (scale → criteria+weights → judge aggregation → round weight →
final) is **already how the engine is structured**; this plan doesn't rebuild it, it **completes** it by
handling the missing configurations (absent weights, single-score rounds) and hardening validation and
precision. One engine, config-driven, serves pageants, dance, singing, talent, sports-style, and simple
competitions without type-specific code — which the audit confirms is already true for the common cases.
