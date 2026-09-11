# Competition Module — Unified Redesign Plan

> Fixes the five reported problems as **one coherent redesign**, not five isolated patches.
> Two workstreams share one mental model: **Setup = one workspace**, **Run = round‑driven scoring**.

## Problems being solved

| # | Symptom | Root cause | Where it's fixed |
|---|---------|-----------|------------------|
| 1 | Structure & Scoring shows **two stage footers** | Both `ModuleStageLayout` and the page portal into `#stage-footer-portal` | Workstream A · A1 |
| 2 | **Score type defined twice** (Scoring config + minor criteria) | Legacy event‑level `scoreType` never removed after per‑minor score types shipped | Workstream A · A3 |
| 3 | Criteria lives **outside** the workspace | Criteria is a separate stage/page | Workstream A · A2 |
| 4 | Live Control / Judge scoring model is wrong; judge UI **not desktop‑friendly**; fairness concern | Run flow built around a *single active contestant*; judge page constrained to a narrow column | Workstream B · B1–B5 |
| 5 | With 2 contestants on stage, **only one records a score** | Stale‑closure in the debounced "auto‑save everything" path | **Absorbed by B3** (the whole mechanism is replaced) |

**Why #5 has no standalone task:** it is a bug *in the very mechanism B3 deletes* (debounced global auto‑save). Replacing it with explicit per‑row submit — each submit reads only its own row and sends an explicit `contestantId` (already supported by the backend) — makes the bug structurally impossible. #5 becomes a **regression test**, not a fix.

---

## Decisions (locked)

1. **Old `/criteria` route** — ✅ **Remove the stage entirely.** Drop the route, remove `criteria` from `EVENT_STAGES.competition` (so it leaves the stepper/sidebar), and repoint any in-page "Criteria" links to the workspace Criteria tab.
2. **Contestant spotlight** — ✅ **Drop per-contestant control entirely.** No spotlight/highlight; the whole round is on stage and every row is equal.
3. **Organizer unlock** — ✅ **Yes, audited.** Organizer can reopen a locked contestant's score; the action is logged (B5).

---

## End‑state architecture

### Setup — one workspace, four tabs
```
Structure & Scoring  (CompetitionWorkspacePage)
├── Rounds         define rounds, weights, advancement
├── Criteria       criteria + minor criteria      ← score type lives HERE (per minor), single source of truth
├── Divisions      optional grouping
└── Scoring rules  how scores COMBINE: calc method · decimals · drop high/low · overall ranking
     (Categories = advanced, unchanged)
```

### Run — round‑driven
```
Live Control (organizer)              Judge Scoring (judge)
├── active ROUND                      ├── full‑width table: every contestant in the round
├── open / close CRITERIA             ├── score each row against open criteria
├── division filter                   ├── "Submit & lock" per contestant  (explicit)
└── finalize & advance                └── locked rows become read‑only ✓
   (no Next / Prev / jump contestant)
```

### The scoring pipeline (why "Scoring rules" tab must stay)
```
Judge types a number
   │  range from  ►  MINOR score type          (Criteria tab)
   ▼
Normalize 0–100  =  value / minor.max × 100    ← score type used ONLY here
   ▼
Average minors → criterion value
   │  combined by ►  SCORING RULES             (Scoring rules tab)
   ▼  calc method · decimals · drop high/low · tie‑break
Criterion → Round → Final → Rank
```
`reduceScores`, `round2`, `assignRanks` in `backend/src/modules/scoring-engine.js` read `calculationMethod` / `decimalPlaces` / `dropHighest/Lowest` / `tieBreaker`. These have **no per‑criterion home** — only the *score type field* is redundant (the engine already reads `minor.scoreType`, never `config.scoreType`, when minors exist).

---

## Database

**No migration required.** Everything the redesign needs already exists:

| Table / column | Status | Used for |
|----------------|--------|----------|
| `competition_sessions.contestant_order` (jsonb) | exists | full round field = "on stage" set (B1) |
| `competition_sessions.active_contestant_ids` (jsonb) | exists | optional spotlight subset (B2) |
| `competition_sessions.active_criteria_ids` | exists | open‑criteria gate (unchanged) |
| `competition_session_judge_scores.is_locked` / `locked_at` | exists | per‑contestant lock (B3/B5) |
| `events.scoring_config.score_type` | **kept as fallback** | not‑yet‑migrated criteria without minors |
| `competition_criteria_minor.score_type / custom_min / custom_max` (mig. 071) | exists | the single source of truth for ranges |

Optional (only if decision #3 = yes): organizer unlock **reuses** `is_locked` — a boolean flip, still no schema change.

---

## Workstream A — Unify the Setup workspace  (fixes #1, #2, #3)

### A1 · Remove the duplicate footer  *(do first)*
**File:** `frontend/src/components/ui/ModuleStageLayout.jsx`

| Current | Updated |
|---------|---------|
| `PAGE_OWNS_FOOTER.competition = ['judges']` (line ~21) | `['judges', 'workspace']` |

The workspace already renders its own tab‑aware `WorkspaceStageFooter` (`CompetitionWorkspacePage.jsx:129`). Adding `workspace` to the ownership list stops the layout from portaling a second `StageFooter` into `#stage-footer-portal`. One‑line change, unblocks A2/A3 (which add a tab to that same footer flow).

### A2 · Move Criteria into the workspace  (#3)
**Files:** `CompetitionCriteriaPage.jsx`, `CompetitionWorkspacePage.jsx`, `routes/index.jsx`, `eventStages.js`

| Current | Updated |
|---------|---------|
| `CompetitionCriteriaPage` fetches its own `foundation` and renders full page | Extract the editor into `components/organizer/competition/CriteriaManager.jsx` that takes `{ foundation, reload }` props |
| Workspace tabs: `rounds / divisions / scoring` (+ Categories) | `rounds / criteria / divisions / scoring` — add a **Criteria** tab that renders `<CriteriaManager foundation={foundation} reload={load} />` |
| `WORKSPACE_TAB_FLOW = ['rounds','divisions','scoring']` | `['rounds','criteria','divisions','scoring']` |
| Route `events/:eventId/criteria` → `<CompetitionCriteriaPage/>` | **Remove the route** (decision #1). Delete `CompetitionCriteriaPage.jsx` once its editor is extracted to `CriteriaManager` |
| `EVENT_STAGES.competition` has a separate `criteria` stage | **Remove** the `criteria` stage — it leaves the stepper/sidebar automatically |
| In-page "Criteria" links (`CompetitionWorkspacePage.jsx:68`, `CompetitionLiveControlPage.jsx` PageHeader, `RoundAssignmentPanel` "Configure on the Criteria page") | Repoint to the workspace **Criteria tab** (`setActiveTab('criteria')` in-page; `…/workspace?tab=criteria` from other pages). Workspace reads `?tab=` on mount for these deep-links |

The workspace already loads the full `foundation` (rounds + criteria + minors), so `CriteriaManager` needs no extra fetch — it reuses the parent's `load()`. The Rounds tab's read‑only criteria summary (`RoundAssignmentPanel`, lines ~698–708) can then deep‑link to the Criteria tab instead of the old page.

### A3 · Collapse score type to one place  (#2)
**File:** `CompetitionWorkspacePage.jsx` (`ScoringTab`, lines ~876–1035)

| Current | Updated |
|---------|---------|
| Tab label **"Scoring config"** | Rename to **"Scoring rules"** |
| Fields: **Score type**, **Custom min**, **Custom max**, Calc method, Decimal places, Drop highest, Drop lowest, Overall ranking | **Remove** Score type / Custom min / Custom max. **Keep** Calc method, Decimals, Drop highest/lowest, Overall ranking |
| `setScoringConfig` payload includes `scoreType/customMin/customMax` | Stop sending them; backend keeps stored value untouched as fallback |
| `CriteriaManager` minor form (from A2) | Pre‑select the last‑used minor score type as the default for the next minor (quality‑of‑life) |

No backend or DB change: the `score_type` column stays and the engine keeps using it only for criteria without minors.

---

## Workstream B — Round‑driven live scoring + judge UI/UX  (fixes #4, absorbs #5)

### B1 · Put the whole round on stage  (backend)
**File:** `backend/src/services/competition-session.service.js` (`getSessionView`, lines ~1415–1418)

| Current | Updated |
|---------|---------|
| `stageIds = activeContestantIds?.length ? activeContestantIds : [activeContestantId]` | `stageIds = activeContestantIds?.length ? activeContestantIds : session.contestantOrder` (the full round field; falls back to `[activeContestantId]` only if order is empty) |
| `stageGroup: Boolean(activeContestantIds?.length)` | `stageGroup: true` whenever more than one contestant is on stage (round mode) |

`contestant_order` is already the round's full, division‑filtered order (`buildContestantOrder`, used by `setActiveRound`/`setActiveDivision`). Existing per‑contestant existing‑scores/lock lookup already uses `.in('contestant_id', stageIds)`, so it scales to the whole field with no other change.

**Also fix a latent bug here:** `pageant.service.js:276 getSessionView(eventId)` ignores a `divisionId` argument, but `JudgeScoringPage` calls `getSessionView(eventId, { divisionId })`. Add the query param on both the service and the `session-view` controller so division‑scoped judges actually get a filtered field.

### B2 · Strip per‑contestant control from Live Control  (#4)
**File:** `frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx`

| Current | Updated |
|---------|---------|
| "Current Contestant" card with **Previous / Next** buttons (lines ~495–535) | Removed |
| **Jump to contestant** select (lines ~537–558) | Removed |
| **Stage group builder** gated behind `divisions_enabled` (lines ~563–612) | **Removed entirely** — the whole round is on stage by default; no spotlight/highlight picker (decision #2) |
| Keeps: session start/pause/resume/complete, round switch, criteria open/close, division switch, finalize & advance | Unchanged — these become the *only* controls |
| "Judge Progress" table keyed to *current contestant* | Re‑key to **per‑contestant × per‑judge** grid: rows = contestants, cells = each judge's lock state, so the organizer sees the whole field's completion |
| Frontend service calls `nextContestant/prevContestant/setActiveContestant` | No longer called (endpoints kept for back‑compat) |

### B3 · Explicit per‑row submit & lock  (#4 + kills #5)
**File:** `frontend/src/pages/voter/JudgeScoringPage.jsx`

| Current | Updated |
|---------|---------|
| Debounced 2s **auto‑save everything** from a captured `scores` closure (lines ~284–383) → drops a contestant when scoring 2+ | **Removed.** Each contestant row owns a **Submit & lock** action that reads that row's inputs and calls `submitSessionScore(eventId, rowScores, contestantId)` |
| Retry queue built around the debounce | Keep the localStorage retry queue, but keyed per explicit submit (re‑used by the row submit handler) |
| `activeContestantId` drives which rows auto‑save | All on‑stage rows are scorable and equal; **no active/spotlight distinction** (decision #2) |
| Success toast only | Row transitions **Not started → In progress → Locked ✓ (HH:MM)**; submit disabled until all *open* criteria in the row are valid |

Backend `submitJudgeSessionScore` already validates "on stage" + "in round" and locks per `contestantId` (lines ~1211–1236, 1255–1267) — no backend change for the happy path.

### B4 · Judge scoring form redesign — desktop‑friendly  (#4)
**File:** `frontend/src/components/voter/competition/CompetitionScoringForm.jsx` + the `JudgeScoringPage` wrapper

**Current problems**
- Page wrapper is `mx-auto max-w-4xl` → the whole judge view is a **narrow column** on desktop.
- The desktop table (`hidden md:block`, `min-w-150`) is forced to scroll **inside that narrow column** → cramped, wasted screen, hard to read across many minor columns.
- No sticky header/first column → scrolling a wide table loses the contestant name and criterion labels.
- No per‑row status or action; scoring feels like a long form, not a scoresheet.

**Updated layout (desktop)**
```
┌───────────────────────────────────────────────────────────────────────────┐
│  ● LIVE   Round: Evening Gown        Division: Senior     Open criteria: 3  │  ← sticky toolbar
│  Progress: 4 / 8 contestants locked                       ⟳ connected · Saving… │
├─────────────┬───────────────┬───────────────┬───────────────┬─────────────┤
│ CONTESTANT  │ Poise (30%)   │ Gown (40%)    │ Q&A (30%)     │             │  ← sticky header
│ (sticky col)│ Grace │ Walk  │ Fit  │ Design │ Content│Deliv │   STATUS    │
├─────────────┼───────┼───────┼──────┼────────┼────────┼──────┼─────────────┤
│ #1  Maria   │ [ 8 ] │ [ 9 ] │ [85] │ [ 90 ] │ [  ]   │ [  ] │ In progress │  [Submit & lock]
│ #2  Ana  ✓  │  8.5  │  9.0  │  88  │   92   │   80   │  85  │ Locked 14:03│  (read‑only)
│ #3  Liza    │ [  ] …                                          │ Not started │  [Submit & lock] (disabled)
└─────────────┴───────────────────────────────────────────────┴─────────────┘
```

| Current | Updated |
|---------|---------|
| `JudgeScoringPage` wrapper `mx-auto max-w-4xl` | Full working width: `max-w-none px-4 md:px-8` (or `max-w-7xl` centered), table is the hero |
| Table `min-w-150` inside narrow column | Table in an `overflow-x-auto` region that uses the **full page width**; only overflows when minors are numerous |
| No sticky header/column | **Sticky** `<thead>` (`position: sticky; top: toolbar-height`) and **sticky first column** (contestant) so labels stay visible |
| Score cells: `ScoreInput` stepper only | Keep `ScoreInput`; add per‑cell min–max hint, invalid‑until‑in‑range styling, left→right **Tab order** across a row |
| No row status / action | Trailing **Status** column: chip + **Submit & lock** button (B3); locked row = green, read‑only |
| Per-row **"Active"** ring/badge driven by `isActive` (lines ~36–38, 71–75, 149–153) | **Removed** — with the whole round on stage and no spotlight (decision #2), every row is equal; the only per-row emphasis is the **lock/completion** state |
| Status banners stacked in narrow column | Consolidated into the **sticky toolbar** (round, division, open‑criteria count, progress, connection, saving) |
| Mobile cards exist (`md:hidden`) | Keep, but one contestant per card with a **sticky "Submit & lock"** at card bottom + optional **focus mode** (carousel) |

Result: on desktop the judge sees a real scoresheet that fills the screen; on mobile it stays a clean card flow.

### B5 · Fairness guarantees, surfaced  (#4)
| Mechanism | Current | Updated |
|-----------|---------|---------|
| Lock on submit | Backend already sets `is_locked` and rejects re‑submit with 409 (lines ~1265–1267) | Surfaced in UI as a read‑only, timestamped locked row |
| Round / criteria close | `setActiveRound` / `setActiveCriteria` already gate scoring | Judge table greys out when the round has no open criteria |
| Audit trail | `recordAudit('competition.score.submitted')` already logged (lines ~1326–1332) | Add `competition.score.unlocked` when an organizer reopens a row |
| Organizer unlock (decision #3) | none | New `POST /session/unlock-score` → flips `is_locked=false` for one `contestantId`, audited, emits `session:contestant-changed` so the judge's row re‑opens |

So: revising *before* commit is legitimate relative judging; *after* commit nothing changes without a logged organizer action.

---

## Files touched — summary

### Frontend
| File | Change | Workstream |
|------|--------|-----------|
| `components/ui/ModuleStageLayout.jsx` | add `workspace` to `PAGE_OWNS_FOOTER` | A1 |
| `pages/organizer/competition/CompetitionWorkspacePage.jsx` | add Criteria tab; rename Scoring tab; drop score‑type fields; read `?tab=` | A2, A3 |
| `pages/organizer/competition/CompetitionCriteriaPage.jsx` → `components/.../CriteriaManager.jsx` | extract editor to a prop‑driven component; **delete the page** after extraction | A2 |
| `routes/index.jsx`, `utils/eventStages.js` | **remove** the `criteria` route and stage; repoint in-page links to the workspace tab | A2 |
| `pages/organizer/competition/CompetitionLiveControlPage.jsx` | remove contestant nav / jump / stage‑group; per‑field judge‑progress grid | B2 |
| `pages/voter/JudgeScoringPage.jsx` | remove debounced auto‑save; per‑row submit; redesigned wrapper/toolbar | B3, B4 |
| `components/voter/competition/CompetitionScoringForm.jsx` | full‑width sticky scoresheet; status column; row lock states | B4 |
| `services/pageant.service.js` | `getSessionView(eventId, { divisionId })`; `unlockScore` (opt) | B1, B5 |
| `services/competition-session.service.js` | `unlockScore` wrapper (opt) | B5 |

### Backend
| File | Change | Workstream |
|------|--------|-----------|
| `services/competition-session.service.js` | `getSessionView` stageIds → full `contestantOrder`; `stageGroup` flag; divisionId support | B1 |
| `controllers/competition-session.controller.js` + `routes/competition-organizer.routes.js` | `POST /session/unlock-score` (opt) | B5 |
| `services/scoring-engine.js`, `validators/competition.validator.js` | **no change** (score‑type fallback retained) | A3 |

### Database
**No migration.** All required columns exist; `events.scoring_config.score_type` retained as fallback.

---

## Sequencing (two PRs)

**PR 1 — Setup (Workstream A):** A1 → A2 → A3. Self‑contained, no run‑time impact, easy to review/rollback.

**PR 2 — Run (Workstream B):** B1 → B2 → B3 → B4 → B5. Depends on A3's decision that score type = minors (the judge table reads minor bounds).

---

## Test checklist

**Setup**
- [ ] Workspace shows exactly **one** footer on every tab.
- [ ] Score type appears **only** under a minor criterion; Scoring‑rules tab has no range field.
- [ ] Criteria is a workspace tab; `/criteria` redirects; each round's criteria still total 100%.
- [ ] Existing events (criteria without minors) still rank identically (score‑type fallback works).

**Run**
- [ ] Live Control has **no** per‑contestant controls; round + criteria + division + finalize only.
- [ ] Judge sees the **whole round** as a table; division‑scoped judge sees only their division.
- [ ] **Score 3 contestants, lock each → all 3 recorded** (the #5 regression test).
- [ ] Locked row is read‑only; re‑submit rejected (409); audit log shows each submit.
- [ ] Organizer unlock (if enabled) reopens the row and is audited.

**UI/UX**
- [ ] Desktop: scoresheet fills page width; header + contestant column stay sticky while scrolling.
- [ ] Submit disabled until all open criteria in the row are valid; invalid cells flagged.
- [ ] Mobile: one card per contestant with sticky submit; focus mode works.

## Rollback / compatibility
- A‑changes are UI‑only and reversible; DB untouched.
- B1 stage change is a single fallback expression; reverting restores single‑contestant view.
- `score_type` column and engine fallback remain, so no data loss and no forced re‑configuration of existing events.
- `/criteria` route/stage removed (decision #1); in-page links repoint to the workspace Criteria tab. Contestant‑nav endpoints kept server-side for back‑compat even though the UI no longer calls them.
