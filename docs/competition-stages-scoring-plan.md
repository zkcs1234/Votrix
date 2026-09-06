# Competition — Stages & Scoring Flow Plan (Option B)

> Adopting the mockup `votrix-structure-scoring-revised.html` into the live competition module.
> Status: **In progress.** Locked decisions are in §1.

## Progress (as of 2026-09-07)

- [x] **Step 1 — Migrations** `069_competition_stages`, `070_judge_weights` (+ downs). *Apply in Supabase before using stages/weights.*
- [x] **Step 2 — Engine + validator + constants** — stages, trimmed/percentile/rank-based (derived), all tie-breaks, judge weighting. Unit-tested (backend suite green).
- [x] **Step 3 — Setup wizard** — `CompetitionWorkspacePage` rebuilt (Format → Stages & Rounds → Criteria → Divisions → Scoring → Review); criteria folded in; stage cut/carry persisted.
- [x] **Step 4 — Judges assign & weight** — per-judge weight (service + controller + route + `JudgeAssignmentPanel` UI); weights fed into `getRankings`.
- [x] **Step 5 — Live Control stage flow** — stage finalize/advance/carry (`previewStageAdvancement`, `finalizeStage`) + "Finalize stage & advance" control reusing the review modal. Carry only affects the advancement standing (final ranking already stage-weighted), so **no new table** was needed.
- [x] **Step 6 — Rankings hierarchy display** — `CompetitionRankingsPage` now labels the active method / tie-break / judge-weighting and shows a stage → round → criteria breakdown per contestant (flat criteria grid when there are no stages).

**All six steps complete.** Remaining before production use: apply migrations 069/070 in Supabase, then click-test the live path (stage finalize/carry, judge weighting) — those additions have unit/build coverage but no integration tests.

> Verified by `npm test` (backend) + `vite build`/ESLint (frontend). The live-path additions (stage finalize/carry, judge weighting) have **no integration tests** — verify in the running app after applying migrations 069/070.

---

## 1. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Stage model | **Option B — first-class stages** (Stage → Round → Criterion) |
| 2 | Scoring methods | **All mockup methods**: average, weighted average, sum, trimmed average, **rank-based**, **percentile** |
| 3 | Rank-based input | **Derived ranks** — judges keep entering numbers; engine converts each judge's numbers to ranks and combines them. **No drag-rank UI.** |
| 4 | Tiebreaks | All mockup options: `highest_round`, `countback`, `judges_majority`, `manual` |
| 5 | Judge weights | **Yes** — per-judge weight, with an "everyone counts equally" toggle |
| 6 | Awards | **Out of scope** — stays removed (commit `b2d5de8`) |
| 7 | Criteria page | **Folded into the Structure & Scoring flow** as a step (the original ask) |
| 8 | Database | **Reuse existing tables**; add columns/JSON only; new tables only if strictly needed |

---

## 2. Data-model mapping (mockup → existing tables)

The DB already has a three-level hierarchy, so Option B maps on almost 1:1 **without a new "stage" table**.

| Mockup concept | Existing table | Action |
|---|---|---|
| **Stage** (Prelims/Semis/Finals — weight, cut rule, carry rule) | `competition_categories` | Reuse; add cut/carry/finalize columns |
| **Round / major criterion** (weight within a stage) | `competition_rounds` (`category_id`, `weight`) | Reuse as-is |
| **Criterion / minor** (weight within a round) | `competition_criteria` + `competition_round_criteria` | Reuse as-is (already round-scoped, per-round 100% validation exists) |
| **Divisions + per-division custom rounds/criteria** | `competition_divisions` + `division_id` on rounds/criteria/categories | Reuse |
| **Judge weights** | `competition_judge_assignments` | Add one nullable `weight` column |
| **Scoring rules** (methods, tiebreaks, decimals, scale) | `events.scoring_config` (JSONB) | Extend JSON — no schema change |
| **Finalize snapshot + carry** | `competition_round_results` | Reuse; add stage-level roll-up if needed |

**Semantic shift:** today a *category* is an optional advanced grouping and advancement lives on the *round*. In Option B the **stage (category) is the primary phase** and the cut/carry rule moves **up to the stage**. Existing flat events (0 categories) keep working via the engine's legacy path (guard at `scoring-engine.js:215-219`).

---

## 3. Database changes (safe / additive / reversible)

New migrations start at `069` (latest existing is `068`). Every column is nullable or defaulted, so existing rows and flat events are untouched. Each migration ships with a `_down`.

### Migration 069 — promote `competition_categories` to "stage"
```sql
ALTER TABLE competition_categories
  ADD COLUMN advancement_type  VARCHAR(16)  NOT NULL DEFAULT 'none',   -- none|top_n|top_percent|threshold|manual
  ADD COLUMN advancement_value NUMERIC,
  ADD COLUMN carry_policy      VARCHAR(16)  NOT NULL DEFAULT 'reset',  -- reset|carry_50|carry_full
  ADD COLUMN finalized_at      TIMESTAMPTZ,
  ADD COLUMN is_stage          BOOLEAN NOT NULL DEFAULT FALSE;         -- TRUE = Option-B phase; FALSE = legacy optional category
```
- Reuses the enum values already proven on `competition_rounds` (see `058_round_advancement.sql`), plus the new `carry_50`.
- `is_stage` keeps old "advanced category" events and new stage events unambiguous. No backfill; defaults are inert.
- The existing per-round `advancement_type` / `score_policy` columns **stay untouched** (backward compat); the engine reads stage-level advancement only in Option B.

### Migration 070 — judge weights
```sql
ALTER TABLE competition_judge_assignments
  ADD COLUMN weight NUMERIC;  -- NULL = equal weighting (today's behavior)
```
Plus a `judgeWeightingEnabled` flag inside `scoring_config`. NULL weight everywhere = current equal average → a no-op until turned on.

### Migration 071 — stage finalize snapshot (build ONLY if needed)
- **First choice: no new table.** Reuse `competition_round_results`; a stage finalizes at its terminal round and carry reads those rows.
- Fallback: a small `competition_stage_results` (`category_id, contestant_id, division_id, rank, score, qualified`) mirroring `competition_round_results`, added only if per-round rows make carry math awkward during implementation.

### No migration — `events.scoring_config` (JSONB) additions
```
calculationMethod: + 'trimmed_average' | 'rank_based' | 'percentile'
tieBreaker:        'highest_round' | 'countback' | 'judges_majority' | 'manual'   (was null | 'highest_criterion')
carryDefault, judgeWeightingEnabled, ...
```
JSONB means new keys need no migration and default safely via `mergeScoringConfig` (`scoring-engine.js:27`).

**Net new tables: 0 (target), or 1 (only if carry requires it).**

---

## 4. Backend engine changes

Files: `backend/src/modules/scoring-engine.js`, `backend/src/modules/advancement.js`, `backend/src/validators/competition.validator.js`.

1. **Stage combination** — final score becomes
   `Σ(stage.weight × Σ(round.weight × Σ(criterion.weight × judgeReduced)))`.
   Extend `combineRoundsToFinal` (already does category→final) to honor stage weight on the `is_stage` path.
2. **Carry-over** — `reset` = current independent behavior; `carry_full` ≈ existing `cumulative`; `carry_50` is new (seed next stage with 50% of the finalized stage score). Implemented in the finalize/seed service reading `competition_round_results`.
3. **New methods:**
   - `trimmed_average` — nearly present as `lowest_removal`; align/label.
   - `percentile` — normalize each judge's scores before combining (pure math, **no judge-UI impact**).
   - `rank_based` — **derived**: convert each judge's per-contestant numbers to ranks, then combine (Borda-style). **No judge-UI or storage change.**
4. **Tiebreaks** — extend `assignRanks` and add resolvers for `highest_round`, `countback` (per-criterion head-to-head), `judges_majority`, `manual` (flag for organizer to resolve).
5. **Judge weights** — make `reduceScores` weight-aware (weighted mean across judges using assignment `weight`); fall back to equal when weights are NULL.
6. **Stage advancement** — `selectQualifiers` already handles top_n/top_percent/threshold/manual/none; reuse unchanged, but call it at **stage boundaries** instead of per-round.

All new behavior stays behind `is_stage` / config flags so flat events produce byte-identical numbers. Extend `backend/__tests__/modules/scoring-engine.test.js` to prove it.

---

## 5. Setup flow rebuild (criteria folded in — the core ask)

Rebuild `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx` into the mockup's stepped wizard:

**Format → Build Stages & Rounds → Define Criteria → Divisions → Scoring Rules → Review & Lock**

- **Build Stages & Rounds** — the mockup's stage builder: multiple-stages Yes/No, per-stage cut + carry + weight, then major criteria/rounds per stage.
- **Define Criteria** — **embeds** the existing `CompetitionCriteriaPage.jsx` logic (already round-aware) as a step. This is the consolidation requested.
- Retire the standalone `/criteria` step in `frontend/src/utils/eventStages.js` and its route in `frontend/src/routes/index.jsx:219` (keep a redirect for old links).
- **Review & Lock** — reuse `SetupReadiness` checks; "Lock" freezes structure once scoring starts (reuse `finalized_at` / publish state).
- Format picker reuses `listTemplates()` (`backend/src/modules/competition-templates.js`); add an `elim` (multi-stage) template.

---

## 6. Page-by-page impact

### Live Control — `CompetitionLiveControlPage.jsx` — **significant**
- "Switch round" → **Switch stage → switch round** (stage derived from `round.category_id`; **no new session column** — reuse `current_round_id`).
- "Finalize round & advance" → **"Finalize stage & advance"**, firing the cut at the stage's end and seeding the next stage per `carry_policy`. Reuse the existing preview/override modal; it reads the stage's combined standing instead of one round's.
- Add a stage pipeline strip (Prelims → top 10 → Finals) mirroring the mockup.

### Rankings / Results — `CompetitionRankingsPage.jsx` — **moderate**
- Breakdown UI gains a **stage → round → criteria** grouping level (today it's flat criteria).
- Display new methods (rank-based shows rank points; percentile shows normalized) and the active tiebreak.
- `ResultsAndAwards` block: **drop the awards path**; keep champion + division winners + finalized standings.

### Judges — `CompetitionJudgesPage.jsx` — **moderate**
- Split into **Invite** and **Assign & Weight** tabs (mockup). Invite/CSV flow unchanged.
- `JudgeAssignmentPanel.jsx` gains a per-judge `weight` input + "everyone counts equally" toggle + live "weights total 100%" check.

### Judge Scoring (voter) — `JudgeScoringPage.jsx` — **small**
- Numeric scoring driven by the active round's criteria; stages + criteria consolidation **do not change it** — it just shows stage context in the header.
- percentile / trimmed / rank-based (derived) / judge weights = **all engine-side, no UI change**.

---

## 7. Rank-based: locked as "derived ranks"

Judges keep the current grid (one row per contestant, one number box per criterion, auto-save). The engine converts each judge's numbers into per-judge ranks, then combines.

Example — Judge Ramos types 92 / 88 / 79 for Anna / Bea / Carla → engine reads that as 1st / 2nd / 3rd for that judge. A stricter judge typing 60 / 55 / 40 in the same order contributes the same 1-2-3. Only order counts across judges.

- Judge experience: identical to today (no retraining).
- Storage: unchanged (`competition_session_judge_scores` numeric).
- Build cost: engine-only. Zero change to `JudgeScoringPage.jsx` / `CompetitionScoringForm.jsx`.

The true drag-rank UI is explicitly **not** being built (it fights per-criterion scoring and the one-at-a-time live flow, and needs a parallel storage path). Revisit only as a separate future feature.

---

## 8. Safe rollout order

1. **Migrations 069 / 070** (+071 only if needed) — additive, reversible, verify on a copy first.
2. **Engine** — stages + weights + methods + tiebreaks, behind `is_stage` / config; extend `scoring-engine.test.js`.
3. **Setup wizard** (frontend) + criteria consolidation.
4. **Judges** Assign & Weight.
5. **Live Control** stage finalize/advance + carry.
6. **Rankings** hierarchy + method/tiebreak display.

Each step is independently shippable; if any stalls, earlier steps still run and old events are unaffected.

---

## 9. Key files reference

**Frontend**
- `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx` — setup wizard (rebuild)
- `frontend/src/pages/organizer/competition/CompetitionCriteriaPage.jsx` — criteria logic (embed)
- `frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx`
- `frontend/src/pages/organizer/competition/CompetitionRankingsPage.jsx`
- `frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx`
- `frontend/src/pages/voter/JudgeScoringPage.jsx`
- `frontend/src/components/voter/competition/CompetitionScoringForm.jsx`
- `frontend/src/components/organizer/competition/JudgeAssignmentPanel.jsx`
- `frontend/src/utils/eventStages.js` — setup step order

**Backend**
- `backend/src/modules/scoring-engine.js`
- `backend/src/modules/advancement.js`
- `backend/src/modules/competition-templates.js`
- `backend/src/validators/competition.validator.js`
- `backend/src/database/migrations/015_competition_scoring_foundation.sql` — base schema
- `backend/src/database/migrations/058_round_advancement.sql` — advancement columns
- `backend/src/database/migrations/023_competition_live_session.sql` — session tables
