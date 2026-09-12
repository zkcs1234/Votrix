# Competition Module — Unified Improvement Plan

_Last updated: 2026-09-12_

Five requested improvements, organized **by the surface (page) each one touches** rather
than by request number — because several land on the same page and should be built
together to avoid re-editing the same file five times.

**No database changes are required for any item.** Every gate/mechanism reuses columns
that already exist.

---

## 1. Requests → surfaces map

| # | Request | Primary surface(s) |
|---|---------|--------------------|
| 1 | Cap weights at 100% (criteria, and the identical gap in rounds/categories) | Workspace: Criteria tab, Rounds tab, Categories tab + Backend |
| 2 | Adapt cleanly when only criteria are configured (no rounds) | Live Control + (copy only) |
| 3 | Clarify / decide what Categories are for | Workspace: Categories tab + Backend validator |
| 4 | Organizer gates which **contestants + criteria** are scorable; judges see all but score only what's open | Live Control + Judge Scoring + Backend |
| 5 | Surface & clarify the existing **elimination/advancement** system | Workspace: Rounds tab + Live Control (+ small backend) |

Overlap that makes this "unified":
- **Rounds tab** carries both #1 (weight cap) and #5 (elimination surfacing).
- **Live Control** carries #2 (roundless copy), #4 (contestant gate) and #5 (close-round + finalize clarity).
- **Judge Scoring** is only touched by #4.
- **Backend** carries pieces of #1, #3, #4, #5.

---

## 2. Source-of-truth decisions (already true in the code)

- **Score type / range** lives on each **minor criterion** (`minor_criteria.score_type`). The
  event `scoring_config` only holds how scores *combine*.
- **Weight budget** = 100% per scope (per round when rounds carry criteria, else event-wide).
  Authoritative check is [`assertScoringWeightsValid`](backend/src/services/competition.service.js:461).
- **Live "open for scoring" gate** = an id list where **empty means all-open**:
  - Criteria: `active_criteria_ids` (exists, wired).
  - Contestants: `active_contestant_ids` (column exists but is currently **ignored** —
    [see comment](backend/src/services/competition-session.service.js:1416)). #4 repurposes it.
- **Elimination** = per-round `advancement_type` / `advancement_value` / `score_policy`
  (all exist), run via finalize → snapshot → seed next round.

---

## 3. Workstreams (by surface)

### A. Workspace — Criteria tab  ·  _(request #1)_
**File:** [`frontend/src/components/organizer/competition/CriteriaManager.jsx`](frontend/src/components/organizer/competition/CriteriaManager.jsx)

- **Current:** [`handleCreate`](frontend/src/components/organizer/competition/CriteriaManager.jsx:255)
  checks only name + `percentage > 0`. `previewTotalPct` is computed
  ([:253](frontend/src/components/organizer/competition/CriteriaManager.jsx:253)) but never enforced.
  `attachExisting` ([:293](frontend/src/components/organizer/competition/CriteriaManager.jsx:293)) can push a round over 100%.
- **Change:**
  - Compute `remaining = 100 − totalPct`.
  - Disable the Add button + show "This round is full (100%)" when `remaining ≤ 0.01`.
  - Set the weight input `max={remaining}`; reject in `handleCreate` if `percentage > remaining + ε`.
  - Guard `attachExisting` against the attached criterion's own percentage exceeding `remaining`.

### B. Workspace — Rounds tab  ·  _(requests #1 + #5)_
**File:** [`frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx`](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx)

- **#1 — weight cap (Current):** `RoundsTab` shows a weight total
  ([:449](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx:449)) but lets you exceed 100%.
  - **Change:** same "remaining budget" guard as A (disable Add + clamp input at 100%).
- **#5 — elimination surfacing (Current):** the rule is buried in each round's
  "Assign contestants & criteria" expander → "Advancement & scoring"
  ([:711-788](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx:711)). Users can't find it.
  - **Change:**
    - Add a rule **badge on the round row**: e.g. `Top 5 advance · cumulative` / `No elimination`.
    - Lift the advancement config into its own always-visible **Elimination** section per round
      (not hidden inside the assignment expander).
    - Label the last round *"Final round — produces final standings, no advancement."*

### C. Workspace — Categories tab  ·  _(request #3)_
**Files:** [`CompetitionWorkspacePage.jsx`](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx) (StructureTab + Advanced reveal), [`competition.service.js`](backend/src/services/competition.service.js)

- **What categories actually are:** an optional **third weighting tier above rounds**. The engine
  ([`combineRoundsToFinal`](backend/src/modules/scoring-engine.js:597)) groups a category's rounds,
  weights them internally, then combines categories by `category.weight`. Use only when multiple
  rounds belong under one weighted heading (e.g. Talent 40% = Prelim + Final talent rounds).
- **⚠️ Latent bug:** round-weight validation is **global** — all rounds across the event must total
  100% ([competition.service.js:481](backend/src/services/competition.service.js:481)) — but the
  engine weights rounds **within each category**. Using categories today blocks a correct setup.
- **DECIDED → Option A: hide Categories for now.** Remove the Advanced (Categories) reveal +
  tab ([:88, :106-118](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx:88)).
  Leaves DB + engine intact for later. No backend validator change now; the round-weight-vs-category
  mismatch (§7) is deferred with the feature, not fixed.

### D. Live Control page  ·  _(requests #2 + #4 + #5)_
**File:** [`frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx`](frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx)

- **#2 — roundless copy (Current):** the module already adapts (stage shows "Criteria scoring",
  round-switch + finalize hidden when `!session.hasRounds` —
  [:328, :449](frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx:328)). Only the
  right-panel copy is wrong: "On stage **this round**" / "in {round}"
  ([:477-483](frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx:477)).
  - **Change:** round-aware labels; a one-line "No rounds — judges score all contestants on the
    event-wide criteria" note.
- **#4 — contestant gate (Current):** the roster is **read-only**
  ([:485-502](frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx:485)). Criteria
  toggles already exist ([:411](frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx:411)).
  - **Change:** turn each roster row into an **open/close toggle** (mirroring the criteria toggles) +
    "Open all / Close all", calling the new `setOpenContestants` (backend, §F).
- **#5 — finalize clarity (Current):** finalize needs the round **closed**
  ([backend :1902](backend/src/services/competition-session.service.js:1902)); there's no obvious
  close control here.
  - **Change:** add a **"Close round"** action next to "Finalize round & advance" so the organizer
    isn't stuck on the "Close the round before finalizing" error.

### E. Judge Scoring  ·  _(request #4)_
**Files:** [`JudgeScoringPage.jsx`](frontend/src/pages/voter/JudgeScoringPage.jsx), [`CompetitionScoringForm.jsx`](frontend/src/components/voter/competition/CompetitionScoringForm.jsx)

- **Current:** judges see **all** round contestants and submit-and-lock each row. Closed criteria are
  **hidden** (via [`loadActiveScoringCriteria`](backend/src/services/competition-session.service.js:100)).
- **Change (#4) — contestants:**
  - Accept an `open` flag per contestant (from the backend gate).
  - When a contestant is **closed**: keep the row **visible**, **disable its score inputs only**
    (no row-greying — DECIDED #3), hide the "Submit & lock" button, show a "Waiting for organizer" badge.
  - `JudgeScoringPage` blocks submit for closed rows (backend also rejects — defense in depth).
- **Change (#4) — criteria (DECIDED: show-but-lock, same as contestants):**
  - Stop hiding closed criteria. The judge sheet renders **all** scope criteria; closed ones show
    **disabled inputs** with a "Not open yet" hint (the column/section stays visible).
  - This requires the backend to return every scope criterion with an `open` flag instead of omitting
    closed ones (see §F #4). The form disables closed criteria's `ScoreInput`s; submit ignores them.

### F. Backend  ·  _(requests #1, #3, #4, #5)_
**Files:** [`competition.service.js`](backend/src/services/competition.service.js),
[`competition-session.service.js`](backend/src/services/competition-session.service.js),
[`competition.validator.js`](backend/src/validators/competition.validator.js),
[`competition-organizer.routes.js`](backend/src/routes/competition-organizer.routes.js)

- **#1 weight budget (authoritative):** reject create/attach when the scoped total would exceed
  100% + ε, returning remaining budget. Add to `createCriteria`, `addRoundCriteria`, `createRound`,
  `createCategory`. (A shared `assertWeightBudget(scope)` helper.)
- **#3:** none (Option A hides the feature; validator left as-is).
- **#4 contestant gate:**
  - Repurpose `active_contestant_ids` as **open contestants** (null/empty = all open). Add
    `setOpenContestants(eventId, ids)` (reuse the existing `/session/stage-group` route + its
    order validation; rename semantics). Reset to null on round change / session start.
  - Session snapshot: add an `open` flag per `roundContestants`
    ([~:257](backend/src/services/competition-session.service.js:257)) and in the judge session-view
    ([~:1474](backend/src/services/competition-session.service.js:1474)).
  - `submitJudgeSessionScore`: reject when the target contestant isn't in the open set
    ([~:1231](backend/src/services/competition-session.service.js:1231)) — this is the submit-lock tie-in.
- **#4 criteria gate → show-but-lock (DECIDED):**
  - [`loadActiveScoringCriteria`](backend/src/services/competition-session.service.js:100) currently
    **omits** closed criteria. Change the judge session-view to return **all** scope criteria, each
    with an `open` flag (closed = not in the `active_criteria_ids` gate). Keep the omit-behavior only
    for the *score-map build* in `submitJudgeSessionScore` so closed criteria are never required or
    accepted at submit time.
- **#5 threshold → per-round (DECIDED):** in
  [`computeRoundStanding`](backend/src/services/competition-session.service.js:1691), apply the
  `threshold` comparison against the **per-round** score, before the cumulative sum is added
  ([:1774](backend/src/services/competition-session.service.js:1774)). Cumulative still affects
  ranking/Top-N; only threshold becomes per-round. Rest of the elimination engine is unchanged.

---

## 4. Build order & dependencies

1. **A + B(#1)** — weight caps across Criteria, Rounds (+ backend §F #1). Small, prevents bad setups.
2. **C(#3)** — hide categories (Option A, decided). Frontend-only, quick.
3. **D(#2)** — roundless copy polish. Tiny, no dependencies.
4. **B(#5) + D(#5)** — elimination surfacing (badges + config lift) and close-round/finalize clarity.
5. **F(#4) → D(#4) → E(#4)** — contestant gate: backend first (repurpose column + submit gate),
   then Live Control toggles, then judge show-but-lock. Largest item; do last.

A, B, C, D(#2) are independent and safely shippable on their own. #4 spans D + E + F and should ship together.

---

## 5. Decisions (confirmed 2026-09-12)

1. **#3 Categories → Option A: hide** the feature for now (DB/engine untouched).
2. **#4 Closed criteria → show-but-lock** (render all criteria; disable closed ones — same as contestants).
3. **#4 Closed contestants → disable inputs only** (no row-greying).
4. **#5 Threshold → per-round always** (compare per-round score, before cumulative sum).

---

## 6. Verification checklist

- [ ] Cannot add a criterion/round/category that pushes its scope over 100% (FE disabled + BE 400).
- [ ] Attaching an existing criterion to a full round is rejected.
- [ ] A 0-round (criteria-only) event: judge sheet shows all contestants + event-wide criteria; Live Control copy reads correctly; rankings compute.
- [ ] Categories tab/reveal is hidden; existing category data (if any) is untouched.
- [ ] Organizer closes a contestant → judges still SEE the row but its inputs are disabled and it can't be submitted; reopening restores it.
- [ ] Organizer closes a criterion → judges still SEE that criterion but its inputs are disabled; it isn't required to submit an open contestant.
- [ ] Backend rejects a score submit for a closed contestant.
- [ ] Threshold advancement uses the per-round score even when score policy is cumulative.
- [ ] Each round shows its elimination rule; "Close round" then "Finalize & advance" works from Live Control; qualifiers seed the next round; finalized round rejects further scoring.

---

## 7. Latent bugs found during review

- **Category vs round-weight validation mismatch** (§C / [competition.service.js:481](backend/src/services/competition.service.js:481)) — global round-weight check contradicts the engine's per-category grouping. **Deferred** with the feature (Option A hides categories); revisit if categories are re-enabled.
- **Threshold under cumulative policy** (§F #5) — compares the running total, not the per-round score. **Being fixed** as part of #5 (threshold → per-round).

---

## 8. Item #6 — Per-criterion locking (follow-up to #4)

**Why:** #4's lock is per **contestant** — "Submit & lock" freezes the whole row across every open
criterion. That clashes with progressively opening criteria over time (score Talent now, Q&A later,
same contestant): once locked, the later criterion can't be scored without an organizer unlock. #6
moves the lock to the **criterion** level so a judge commits one criterion at a time and newly opened
criteria stay scorable.

**Decisions (confirmed 2026-09-12):** per-contestant "Submit open criteria" button · criterion-level
granularity · per-criterion unlock in Live Control included.

### Data model (one additive, reversible migration)
- Add `locked_criteria JSONB NOT NULL DEFAULT '[]'` to `competition_session_judge_scores` — the set of
  **criterion ids** locked for that (judge, session, round, contestant) row.
- `is_locked` becomes **derived**: `true` when `locked_criteria` covers all the round's criteria (kept
  for compat + fast "fully done" queries).
- Backfill: for existing `is_locked = true` rows, set `locked_criteria` to the criteria they already
  have scores for. Down migration drops the column.

### Backend ([competition-session.service.js](backend/src/services/competition-session.service.js))
- **`submitJudgeSessionScore`**: submit only the *open, not-yet-locked* criteria; **merge** minor scores
  into `scores` (today it replaces); append those criterion ids to `locked_criteria`; recompute
  `is_locked`. Reject re-scoring an already-locked criterion.
- **`getJudgeSessionView`**: return a per-criterion `locked` flag per (contestant, criterion) alongside
  the existing `open` flag and prefilled scores.
- **`unlockSessionScore` (B5)**: accept an optional `criteriaId` to reopen a single criterion; no id =
  clear the whole contestant (today's behavior).
- **`getJudgeProgress`**: report partial progress (locked/total criteria) instead of submitted/waiting.
- Verify **`bridgeSessionScoresToRankingStore`** mirrors the merged full scores, not just the subset.

### Frontend
- **[CompetitionScoringForm.jsx](frontend/src/components/voter/competition/CompetitionScoringForm.jsx)**:
  each cell is **locked** (committed, read-only) / **open** (scorable) / **waiting** (not opened). Row
  action = **"Submit open criteria"** (locks just those); row shows `locked/total`, fully "Locked" only
  when all criteria are in.
- **[JudgeScoringPage.jsx](frontend/src/pages/voter/JudgeScoringPage.jsx)**: payload builder submits only
  open-and-unlocked criteria; consume per-criterion `locked` flags.
- **[CompetitionLiveControlPage.jsx](frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx)**:
  progress grid shows per-criterion locked counts; unlock offers "one criterion" vs "whole contestant."

### Verification
- [ ] Judge scores criterion A, submits → A locks, B/C stay scorable.
- [ ] Organizer opens criterion B later → judge scores & submits B without any unlock.
- [ ] Row shows "Locked" only when every round criterion is committed.
- [ ] Per-criterion unlock reopens exactly one criterion; whole-contestant unlock still works.
- [ ] Rankings reflect the merged scores; existing (pre-migration) locked rows still rank.

> **Note:** #6 is the first item that needs a DB migration — the "no DB changes" note in the header
> applies to items #1–#5 only.
