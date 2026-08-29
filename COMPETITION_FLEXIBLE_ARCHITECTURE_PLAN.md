# VOTRIX Competition Module → Flexible, Config-Driven Judged-Competition System

> **Deliverable note:** On approval, this document will be saved into the repo as
> `COMPETITION_FLEXIBLE_ARCHITECTURE_PLAN.md` (the user asked for the plan as an `.md` file).
> This is an **analysis + plan only** — no code is changed until the plan is approved.

---

## Context

The Competition module today is a **live-session judge-scoring engine** that was renamed from
"pageant" to "competition". After reading the frontend, backend, database, scoring engine, and
live-session code directly, the central finding is: **the architecture is already
configuration-driven and generic** — unlimited Categories / Divisions / Rounds / Criteria, a
JSONB `scoring_config`, a JSONB `participant_info_fields`, and a pure scoring engine with **no
pageant/dance/singing/talent-specific business logic anywhere**.

So the goal is **not** a rebuild. It is a thin **flexibility layer** (a competition *type* label +
starter *templates* that seed structure), plus fixing **integrity gaps** that would otherwise make
results unreliable (a live-scores↔rankings store disconnect, real-time event-name mismatches, and
weight math that doesn't match the live scoring page), plus adding the **real-competition behaviors**
the user requires so rounds / categories / divisions work like an actual judged competition — most
importantly **round advancement/elimination** (top-N advance), score carryover policy, and proper
per-round / per-category / per-division results (§8B, Phases 6–7). The schema already represents the
*structure*; what's missing is *progression over time* and *correct scoring/results*.

**Decisions locked with the user:**
1. Competition *type* = **label + template seed** only (seeds editable structure; **no** runtime branching).
2. Scope = **flexibility layer + integrity fixes** (not full security/naming hardening).
3. Leave the leftover `pageant` naming (`PageantLayout`, `pageant.service.js`, `PageantScoringForm`) **as-is**.
4. Rounds/categories/divisions must behave like a **real competition** — add advancement/elimination and proper results (§8B, Phases 6–7).
5. **Score carryover = per-round choice** (`independent` vs `cumulative`) — support both, set on each round.
6. **Advancement = auto-computed cutoff + organizer confirm/override** (real head-judge discretion; nothing auto-eliminates).
7. **Score range has ONE source of truth = the event scale** (`scoreType`); criteria carry only a weight, not their own range (§8C).
8. **Teams/duos/groups are scored as a single unit** (one contestant row); separate them with Divisions. **No** roster, per-member scoring, or entrant-kind field — no change needed (§8D).

---

## 1. Current System Architecture Summary

**Frontend (React, Vite).** Pages under `frontend/src/pages/organizer/competition/*` + judge page
`frontend/src/pages/voter/JudgeScoringPage.jsx`. Sidebar/layout `frontend/src/layouts/PageantLayout.jsx`
(labels say "Competition Scoring"). Routes in `frontend/src/routes/index.jsx` (organizer 203–224, judge 288–295).
Data access via `frontend/src/services/pageant.service.js` (exported as **both** `pageantService` and
`competitionService`) and `competition-session.service.js`, over the axios wrapper `services/api.js`.
**No react-query / no Zustand for competition data** — hand-rolled `useState` + manual `reload()`.
`react-hook-form`+`zod` is used **only** in the event-creation wizard; every other form is raw `useState`.

**Backend (Node/Express).** Thin controllers → services (all logic + DB) → pure `modules/scoring-engine.js`.
Organizer routes at `/api/organizer/competition` (`routes/pageant-organizer.routes.js` +
`routes/competition-organizer.routes.js`); judge routes at `/api/voter/competition`
(`routes/pageant-judge.routes.js`). Core service is `services/pageant.service.js` (delegated to by
`competition.service.js`, `competition-session.service.js`, `competition-division.service.js`).
Type gating uses `COMPETITION_SCORING_EVENT_TYPES = {'pageant','competition_scoring'}`
(`utils/constants.js`). New events are always created as `competition_scoring`.

**Database (PostgreSQL, no Supabase RLS).** Generic scoring schema built across migrations `005`,
`011` (pageant→competition rename with back-compat views), `015` (dynamic foundation), `023` (live
session), `038` (divisions), `041` (unify judges into `event_participants`), `055` (perf indexes).
All authorization is **application-layer** (no RLS).

**Real-time.** Custom **WebSocket** server (`ws`) in `backend/src/websocket/*` with rooms
(`event:{id}`, `event:{id}:organizer`, `event:{id}:voters`). Frontend has `services/socket.service.js`
+ `hooks/useSocketEvent.js`. **No socket.io, no Supabase realtime.**

---

## 2. Current Feature Inventory

| Feature | Where | Reusable across types? | Limitation / Note |
|---|---|---|---|
| Sidebar/nav | `PageantLayout.jsx` | ✅ generic | Labeled "Competition Scoring"; file still named Pageant |
| Dashboard | `CompetitionDashboardPage.jsx` → `GET /dashboard` | ✅ | Live via `rankings:updated`, `session:status-changed` |
| Events list + draft resume | `CompetitionEventsPage.jsx`, `useDraft('competition')` | ✅ | Robust localStorage+server draft |
| Creation wizard | `CompetitionEventFormPage.jsx` (3 steps: details→branding→judge info-form) | ✅ | **No type/template step** |
| Branding | wizard step 2, `uploadBanner` | ✅ | — |
| Contestants | `CompetitionContestantsPage.jsx` → `getFoundation` | ✅ | Division-aware auto-numbering, photo dedup |
| Judges + info form | `CompetitionJudgesPage.jsx` (`judges-v2`), `DynamicParticipantTable`, `ParticipantInformationGate` | ✅ | Info form is for **judges**, stored in `event_participants.metadata` |
| Categories / Divisions / Rounds / Assignments / Scoring config | `CompetitionWorkspacePage.jsx` (1205 lines, tabbed) | ✅ | Single `getFoundation` load; live 100% checks |
| Criteria | `CompetitionCriteriaPage.jsx` (+ Workspace) | ✅ | min≤max, weights total 100% |
| Scoring config | `ScoringTab` → `scoring-config` | ✅ generic | scoreType, calcMethod, decimals, dropHi/Lo, includeOverallRanking |
| Live Control | `CompetitionLiveControlPage.jsx` → `competition-session.service.js` | ✅ | start/pause/resume/complete, next/prev, set round/division |
| Judge Scoring | `JudgeScoringPage.jsx` + `CompetitionScoringForm.jsx` | ✅ | live-session-only; 2s debounce auto-save; localStorage retry queue |
| Rankings | `CompetitionRankingsPage.jsx` → `getRankings` | ✅ | division filter; `rankings:updated` |
| Analytics | `CompetitionAnalyticsPage.jsx` → `useModuleAnalytics`; metrics in `modules/competition/views/competitionMetrics.js` | ✅ | 30s polling |
| Scoring engine | `backend/src/modules/scoring-engine.js` | ✅ fully generic | No tie-breaking; ignores per-round criteria in batch path (see §7) |

**Dead / duplicate code (leave as-is per decision):** `components/voter/competition/PageantScoringForm.jsx`
(unused), `legacyPageantService` (`/organizer/pageant`, `/voter/pageant`), `validators/pageant.validator.js`
(stale copy of `competition.validator.js`), `modules/pageant/index.js`.

---

## 3. Current Workflow (discovered from code)

```
Create event  ──►  Details ─► Branding ─► Judge Information-Form  ──►  publish (draft→active)
     │
     ▼  (sidebar, per event)
Contestants  ─  Criteria  ─  Judges (invite/CSV)  ─  Workspace{Categories│Divisions│Rounds│Assignments│ScoringConfig}
     │
     ▼
Live Control:  start ─► auto-enable scoring ─► pick first open round ─► build contestant order
               ─► [next/prev contestant │ set round │ set division] ─► judge-progress table ─► complete
     │                                            ▲
     ▼                                            │ WebSocket
Judge Scoring page (/voter/competition/events/:id/score): sees ACTIVE contestant only,
   fills all criteria ─► 2s debounce auto-save ─► lock
     │
     ▼
Rankings / Analytics
```

Order is **not** rigidly enforced — Categories/Divisions/Rounds are optional; a minimal event needs
only contestants + criteria. `startSession` already runs pre-flight validation (≥1 contestant, ≥1
active judge, ≥1 criterion, criteria=100%, and if rounds exist ≥1 open round with contestants).

---

## 3A. Recommended Workflow (after this plan)

The recommended flow keeps every existing page and step — it only **adds an optional Type/Template
entry point** and makes the **optional layers visibly optional**, then closes the live→results loop.
Nothing below is a new page; templates just pre-fill the existing Workspace/Criteria data.

```
CREATE EVENT
   │
   ▼
① Type / Template  ◄── NEW, OPTIONAL (Phase 1–2)
   │   pick Pageant / Dance / Singing / Talent / Simple  ─ or ─  "Start blank"
   │   → seeds editable Categories / Rounds / Criteria / scoring_config
   ▼
② Details  ─►  ③ Branding  ─►  ④ Judge Information-Form (optional fields)
   │                                        (unchanged 3-step wizard)
   ▼
   publish (draft → active)
   │
   ▼  ── SETUP (sidebar, per event — order flexible, layers optional) ──────────────
   │
   ├─ Participants / Contestants        (required)
   ├─ Criteria + weights + score range  (required; must total 100%)
   ├─ Judges (invite / CSV)             (required: ≥1 active)
   └─ Workspace (only what the type needs — "Simple" can skip all of these):
        • Divisions      (optional · off by default)
        • Categories     (optional · pre-filled for Pageant)
        • Rounds         (optional · pre-filled Prelim→Final for Pageant/Dance)
        • Judge Assignments (optional · default = event-wide)
        • Scoring Config    (pre-seeded by template; editable)
   │
   ▼  ── REVIEW & VALIDATE ────────────────────────────────────────────────────────
   │   pre-flight (already enforced on Start): contestants ≥1 · judges ≥1 ·
   │   criteria =100% · if rounds exist, ≥1 open round with contestants
   │
   ▼  ══════════════════════ LIVE COMPETITION ENGINE ═══════════════════════════════
   │
   ▼
LIVE CONTROL  ──►  ACTIVE SCORING CONTEXT = status + [division?] + [round?] + current contestant
   │                (all optional layers collapse gracefully when unused)
   │   start → auto-enable scoring → build contestant order
   │   [ next / prev contestant │ set round │ set division ]
   │                    │
   │                    ▼  WebSocket (unified event names — Phase 5)
   │            JUDGES SCORE IN REAL TIME  (/voter/competition/events/:id/score)
   │              sees ACTIVE contestant → fills criteria → auto-save (2s) → LOCK
   │                    │
   │                    ▼  write-through to competition_scores  ◄── FIX (Phase 3)
   │            Organizer sees live judge-progress (submitted / pending)
   │                    │
   ▼                    ▼
Complete round / advance contestants  ─►  Complete session
   │
   ▼  ═════════════════════ RESULTS & ANALYTICS ════════════════════════════════════
   │
   ▼
Rankings (per-round criteria honored + tie handling — Phase 4)  ─►  Analytics  ─►  Reports
```

**What changed vs the current workflow (§3):**

| Step | Now | After this plan |
|---|---|---|
| Type / Template | none — always blank | **optional first step**; seeds editable structure per type |
| Optional layers | present but not signposted | Workspace surfaces only what the chosen type needs; "Simple" skips all |
| Judge live scoring → results | **broken** (live scores don't reach rankings) | **write-through** so live scores rank immediately (Phase 3) |
| Real-time updates | partly silent (event-name mismatch, `window.socketClient`) | unified `useSocketEvent` + correct names (Phase 5) |
| Multi-round rankings | ignores per-round criteria; arbitrary tie order | per-round criteria honored + stable ties (Phase 4) |

**Unchanged on purpose:** the 3-step create wizard, all setup pages, Live Control controls, the single
Judge Scoring page, and the Rankings/Analytics/Reports surfaces. The workflow is the *same spine* — just
with an optional templated on-ramp and a repaired live→results path.

---

## 4. Current vs Target Gap Analysis

Legend: ✅ implemented · 🟡 partial · 🔴 missing · 🔵 handled differently

| Target capability | Status | Evidence / Note |
|---|---|---|
| Competition details + branding | ✅ | wizard steps 1–2 |
| **Competition Type / Template** | 🔴 | no type field, no templates; `event_type` only distinguishes module, not sub-type |
| Categories (optional) | ✅ | `competition_categories`, nullable FKs |
| Divisions (optional) | ✅ | `competition_divisions` + `divisions_enabled` toggle |
| Rounds (optional) | ✅ | `competition_rounds` + open/close + round↔contestant/criteria joins |
| Participants/Contestants | ✅ | `competition_contestants`, division-aware |
| Judges | ✅ | `event_participants` (`COMPETITION_JUDGE`); `competition_judges` is now a view |
| Optional judge information | ✅ | `events.participant_info_fields` + `event_participants.metadata` |
| Criteria / weights / score range / result rules | ✅ | criteria table + `scoring_config` JSONB |
| Judge assignments (event/division/category/round) | ✅ | `competition_judge_assignments` |
| Live Control + active scoring context | ✅ | `competition_sessions` (round + contestant + division + order) |
| Judge Scoring page (dynamic) | ✅ | one page, driven by session view |
| Real-time progress | 🟡 | works, but **event-name mismatches + two socket clients** (see §7) |
| Score validation | ✅ | client + server bounds, per-cell |
| Rankings | 🟡 | works, but **no tie-breaking** and **ignores per-round criteria** in batch path |
| Results feed from live scores | 🔴 | **live-session scores are NOT read by rankings** (store disconnect, see §7) |
| Reports | ✅ | `/organizer/reports/competition/:eventId` |
| Audit logging | 🔴 | facility exists elsewhere, not wired here (out of scope this round) |

---

## 5. Multi-Type Support Analysis (Pageant / Dance / Singing / Talent / Simple)

All four map onto the **existing generic model via configuration** — no separate modules needed:

| Type | Divisions | Categories | Rounds | Criteria | How it's expressed today |
|---|---|---|---|---|---|
| 👑 Pageant | optional (M/F) | Talent/Gown/Q&A (weighted) | Prelim→Final | per-category | categories + rounds + weights |
| 💃 Dance | teams/solo via divisions | style categories | Prelim→Final | dance criteria | divisions + rounds |
| 🎤 Singing | optional | optional | 1–N rounds | vocal criteria | rounds optional |
| 🏆 Simple | off | off | off (implicit "Overall") | flat criteria | contestants + criteria only |

The **only missing piece** is a way to (a) label the event's type and (b) **seed** the right starter
structure so an organizer isn't staring at a blank Workspace. That is the template layer.

---

## 6. Recommended Future Architecture (thin flexibility layer)

**A. Competition Type (label).** Add one **additive, nullable** column `events.competition_type`
(`VARCHAR`, nullable, default `NULL` = "Simple/blank"). Values are open text validated against a
backend catalog (`'pageant' | 'dance' | 'singing' | 'talent' | 'simple' | ...`). Purely for
display/filtering/template-selection — **never branched on** in scoring or live logic. (Chosen over
stuffing it into `scoring_config` to keep scoring config focused and to allow a plain indexed filter.)

**B. Templates (code catalog, not a table).** New backend module
`backend/src/modules/competition-templates.js` exporting static presets, e.g.:
```
{ key:'pageant', label:'Pageant',
  scoringConfig:{ scoreType:'range_1_100', calculationMethod:'weighted_average', decimalPlaces:2 },
  categories:[{name:'Talent',weight:40}, {name:'Evening Gown',weight:30}, {name:'Q&A',weight:30}],
  rounds:[{name:'Preliminary',weight:50},{name:'Final',weight:50}],
  criteria:[...] }
```
`GET /organizer/competition/templates` lists them; creating an event with `templateKey` seeds
categories/rounds/criteria/scoring_config **as editable rows** (organizer can change everything after).
`'simple'`/none seeds nothing. No new table → no duplicate source of truth; templates are versioned in code.

**C. Everything else stays.** Categories/Divisions/Rounds/Criteria/Assignments/Scoring-config, live
session, judge scoring, rankings — reused unchanged. One core pipeline for all types.

---

## 7. Live Control, Judge Scoring & Real-Time — Integration Findings (the integrity fixes)

These are verified defects, not speculation, and they matter for **every** competition type:

**7.1 — Live scores never reach rankings (store disconnect). 🔴 HIGH.**
- `submitJudgeSessionScore` (`competition-session.service.js:600`) writes **only** to
  `competition_session_judge_scores` (JSONB blob).
- `getLiveRankings` (`pageant.service.js:1427`, scores read at `:1460`) reads **only** from
  `competition_scores` (`DB_TABLES.JUDGE_SCORES`).
- `completeSession` (`:564`) recomputes rankings but does **not** bridge the two stores.
- **Effect:** when judges score through the *live session* (the primary flow the Judge Scoring page
  uses), those scores do not appear in rankings/analytics. Only the separate batch endpoint
  (`submitJudgeScores` → `competition_scores`) feeds rankings.
- **Fix (recommended, write-through):** in `submitJudgeSessionScore`, after locking the session-score
  row, upsert the flattened per-criterion values into `competition_scores`
  (`judge_id, contestant_id, criteria_id, round_id, category_id, division_id, score`) using the existing
  unique key `(judge_id, contestant_id, criteria_id, round_id)`. Keeps `competition_scores` the single
  source of truth for the ranking engine; no engine changes needed. Add a backfill in `completeSession`
  as a safety net for any pre-existing session rows.

**7.2 — Batch ranking path ignores per-round criteria. 🟡 MEDIUM.**
`scoring-engine.js` (comment at `:213`) treats every round as covering ALL criteria, even though
`competition_round_criteria` exists and the live path respects it. For multi-round types (pageant/dance
prelim→final with different criteria per round) this skews weighted results. **Fix:** pass round→criteria
membership into `computeRankings` and narrow per-round criteria accordingly.

**7.3 — No tie-breaking in rankings. 🟡 MEDIUM.**
`computeRankings` (`:305`) assigns `rank=i+1` after a plain sort; equal finals get arbitrary distinct
ranks. **Fix:** assign equal ranks for equal `finalScore` (dense/standard competition ranking) and expose
a configurable tiebreaker (e.g., highest single category) later.

**7.4 — Real-time event-name mismatch + two socket clients. 🟡 MEDIUM.**
- Backend emits: `session:status-changed`, `session:contestant-changed`, `session:round-changed`,
  `session:division-changed`, `session:judge-score-submitted`, `rankings:updated`.
- `CompetitionLiveControlPage.jsx` listens for `session:state-changed` / `session:judge-submitted`
  (**names don't exist** → those live updates silently never fire; page relies on polling).
- `JudgeScoringPage.jsx` uses a **different** `window.socketClient` (socket.io-style) that this module
  never defines, instead of the module's own `services/socket.service.js` + `useSocketEvent`.
- **Fix:** standardize all competition pages on `useSocketEvent` (raw WS) with the backend's actual
  event names; migrate `JudgeScoringPage` off `window.socketClient`; ideally route both LiveControl and
  JudgeScoring through the existing-but-unused `hooks/useCompetitionSession.js`.

**7.5 — `getFoundation` mixed camel/snake shapes. 🟡 LOW.**
Pages defensively read `contestantNumber ?? contestant_number`, `divisionId ?? division_id`, etc.
Latent fragility; normalize the mapper in `pageant.service.js` (backend) so one shape is returned.

---

## 8. Categories / Divisions / Rounds / Criteria — recommended structure

**Keep the current model; make optionality explicit in the UI.** The schema already nails this
(nullable FKs, `ON DELETE RESTRICT`, `divisions_enabled` toggle). The improvement is UX-level:

- Drive Workspace tab visibility/onboarding from the chosen **template** (e.g. "Simple" hides
  Categories/Rounds by default; "Pageant" pre-fills them). No schema change.
- Criteria remain attachable at event / category / division / round level (already supported). Templates
  choose the sensible default per type.
- No structural change to Categories vs Divisions vs Rounds — they are already independent, optional layers.

---

## 8A. Exact combination rules — how Categories / Divisions / Rounds / Criteria weight and score

> This section answers the recurring "how do the weights actually work / does each round contain 100%
> criteria?" question. It documents **current (as-coded) behavior** and the **intended behavior** the
> plan moves to. The two differ — that gap is real and is why Phase 4 exists (now expanded).

### What each layer means
- **Division** — partitions **contestants** into independently-ranked pools. Not a weight; a filter.
- **Category** — a **weighted grouping** of rounds/criteria (Talent 40% / Gown 30% / Q&A 30%).
- **Round** — a **weighted stage** (Prelim / Final) with its own contestant list and its own criteria list.
- **Criterion** — the scored item (0…max) carrying a `percentage`; attachable at event/category/division/round.

### CURRENT weight validation (authoritative gate — `competition.service.js:381 assertScoringWeightsValid`)
Three **flat, event-wide** sums must each equal 100 before scoring opens:
```
Σ ALL categories.weight   (whole event) == 100
Σ ALL rounds.weight       (whole event) == 100
Σ ALL criteria.percentage (whole event) == 100      ← ONE flat pool for the entire event
```
**Implication:** criteria are validated as a single 100% pool for the whole event — **not per round**.
Per-round criteria sets (Talent[50/50] + Gown[60/40] = 200% event-wide) are **rejected** today. Division-
specific criteria hit the same wall (two divisions × 100% each = 200% event-wide → rejected).

### CURRENT ranking math (`modules/scoring-engine.js#computeRankings`)
1. Per criterion: average a contestant's scores across judges (grouping key = `contestant|criteria`,
   **`round_id` is dropped** → the same criterion scored in two rounds is merged).
2. Criteria → round (weighted_average): loops over **ALL** event criteria for **every** round
   (**ignores** `competition_round_criteria`), so **every round yields the same value**.
3. Round → final: `final = Σ(roundValue × round.weight/100)`; since round values are identical and
   weights sum to 100, **`final` collapses to the single event-wide weighted-criteria score**.

**Net current reality:** rounds are effectively a **live-control / staging** device; in the batch
ranking they do **not** change the number. The **live scoring page**, by contrast, **does** respect
`round_criteria` (a judge only scores the active round's assigned criteria) — so setup+live and the
ranking math disagree. (This is defect **7.2**; combined with the store disconnect **7.1**, live
scores may not even reach this math.)

### INTENDED rules (target — Phase 4)
Scope-nested totals that match the live page and an organizer's mental model:
```
Criteria total 100%  WITHIN their round      (or within the event if no rounds)
Rounds   total 100%  WITHIN their category   (or within the event if no categories)
Categories total 100% WITHIN the event       (or within a division, if division-scoped)
Divisions: each ranks independently; every total above is validated within the division's scope
Engine: honors round↔criteria membership and keeps round_id separate (no cross-round merge)
```
Example (Pageant, no divisions): Talent round = [Technique 50% + Artistry 50%] = 100% *of that round*;
round weights Talent 50% + Final 50% = 100%; `final = 0.5·TalentScore + 0.5·FinalScore`. With categories,
rounds total 100% *within each category*, and categories total 100% across the event.

### Two changes this requires (both land in Phase 4)
1. **`scoring-engine.js` + `getLiveRankings`:** thread `competition_round_criteria` into the engine;
   normalize criteria within their round; group scores by `contestant|criteria|round` so rounds stay
   separate and genuinely contribute.
2. **`assertScoringWeightsValid` → scope-aware:** validate criteria per-round, rounds per-category,
   categories per-event/division — instead of three flat event-wide sums. Fall back to the flat rule
   only when the finer scope is unused (e.g. no rounds ⇒ criteria total 100% event-wide), so simple
   competitions are unaffected. Mirror the same scope logic in the Workspace/Criteria UI 100% checks.

**Backward-compat / migration risk:** existing events were built under the flat rule (all criteria =
100% event-wide, no per-round criteria). Guard the new engine path on the **presence** of
`round_criteria` rows so those events keep their current numbers; snapshot-test before/after (Phase 0).

---

## 8B. Real-Competition Behavior Model (target) — rounds, categories, divisions as they actually work

> Goal (user): rounds / categories / divisions should behave **exactly like a real judged
> competition**. This section defines the real-world semantics of each, states what the system does
> today, and lists the concrete changes required. The changes here are **additive** and become
> **Phases 6–7** in §14. §8A (weight math) is the prerequisite.

### The three axes are independent (this is how real competitions are structured)
- **Division = a separate contest.** Contestants in different divisions **never** compete against each
  other (Male/Female, Junior/Senior, Age groups, Solo/Group). Each division has its **own standings and
  its own winner**. An optional **overall/grand champion** may be chosen across divisions.
- **Category = a weighted segment every contestant performs.** (Pageant: Talent 30% / Swimsuit 20% /
  Gown 20% / Q&A 30%.) Final score = weighted sum of category scores. Real competitions also announce
  **special/“Best in Category” awards** per category, independent of the overall placement.
- **Round = an elimination stage over time.** (Prelim → Semifinal → Final.) After a round, only the
  **top performers advance**; the rest are eliminated. Finals may use **different criteria** and may
  **carry** prelim scores or **reset**. Each round has an **official standing** used to justify who advanced.

Divisions and categories are *scoring structure*; rounds are *progression over time*. A real pageant
uses all three at once, and the current schema (`division_id`, `category_id`, `round_*` joins) can
already represent the structure — what's missing is **round progression** and **correct scoring/results**.

### Real-world rules → current state → required change

| Real-competition rule | Current state | Required change | Phase |
|---|---|---|---|
| Contestant belongs to exactly one division; divisions ranked separately | ✅ `division_id` single FK; `getLiveRankings` per-division | Validate division weights within scope | 4 |
| Optional overall/grand champion across divisions | 🟡 `scoring_config.includeOverallRanking` (flag only) | Compute + surface an explicit overall standing & champion | 7 |
| Category = weighted segment; each contestant gets a per-category sub-score | 🟡 engine computes `perCategory`, but weight math flat (§8A) | Fix weight math (§8A) + expose per-category sub-scores | 4, 7 |
| “Best in Category” / special awards | 🔴 none | Compute per-category winners; show in results/report | 7 |
| Round = elimination stage; **top N advance**, rest eliminated | 🔴 **none** — contestants placed in rounds **by hand**; “advance” = next *contestant* only | **Advancement engine**: per-round policy → compute standing → select advancers → seed next round | 6 |
| Advancement policy (top-N / top-%/ threshold / manual) | 🔴 none | Config on the round; applied at round finalize | 6 |
| Score carryover: cumulative vs final-only vs weighted | 🔴 engine merges all rounds into one number (§8A) | Per-round `score_policy` (`independent` \| `cumulative`); engine honors it | 6 (+4) |
| Different criteria per round (finals ≠ prelims) | 🟡 `round_criteria` exists; **batch ranking ignores it** | Engine honors `round_criteria` (§8A) | 4 |
| Official per-round standings (who advanced and why) | 🔴 none | Snapshot round results on finalize (`competition_round_results`) | 6 |
| Explicit tie-break rule (head-judge / decisive category / highest single) | 🔴 sequential ranks only | Configurable tiebreaker in `scoring_config` | 7 |
| Lock a completed round so scores can’t change after advancement | 🟡 `is_open` toggle only | Mark round finalized; block edits to finalized rounds | 6 |

### Proposed data model (additive, reversible)
- `competition_rounds.advancement_type VARCHAR(16) DEFAULT 'none'` — `none | top_n | top_percent | threshold | manual`.
- `competition_rounds.advancement_value NUMERIC` — N, percent, or threshold score (nullable).
- `competition_rounds.score_policy VARCHAR(16) DEFAULT 'independent'` — `independent | cumulative`.
- `competition_rounds.finalized_at TIMESTAMPTZ` — set when the round is closed & advancement computed.
- **New table `competition_round_results`** — official per-round snapshot written on finalize:
  `id, round_id, contestant_id, division_id?, rank, score, qualified BOOLEAN, created_at`,
  `UNIQUE(round_id, contestant_id)`. Advancement reads this to seed the next round’s
  `competition_round_contestants`. Gives real competitions an auditable, immutable round standing.

### New flow (Live Control): finalize a round & advance
```
Round in progress ─► organizer clicks "Finalize round"
   → compute standing for this round (engine, division-aware, honoring round_criteria + score_policy)
   → write competition_round_results (rank, score, qualified per advancement_type/value)
   → mark round finalized_at; lock its scores
   → seed next round's competition_round_contestants with the qualifiers
   → broadcast; Live Control switches active round to the next round
Manual override: organizer can add/remove qualifiers before confirming (real head-judge discretion).
```
This reuses the existing `buildContestantOrder` (already prepends round-assigned contestants), the
existing ranking engine, and the existing WebSocket — no new subsystems.

### What stays optional (Simple competition still trivial)
`advancement_type='none'` + `score_policy='independent'` + one round (or no rounds) = today's behavior.
Divisions/categories off. Nothing above is required for a one-round, flat-criteria competition.

---

## 8C. Score range — ONE source of truth (the scale)

> Decision: the **event scale (`scoring_config.scoreType`) is the single source of truth** for the valid
> score range. Criteria differ only by **weight**, not by range — as in a real 1–10 competition where
> every criterion is scored 1–10. This removes a genuine two-sources-of-truth bug.

### The bug today (two overlapping range definitions that can conflict)
- **Criterion `min_score`/`max_score`** (per-criterion, typed on the Criteria page, default 0–100) drives
  the **judge UI** (`CompetitionScoringForm.jsx:168`) and the **live submit** (`submitJudgeSessionScore`
  validates criterion range only — scale ignored).
- **`scoreType` scale** (event-wide) is only a fallback default + an extra gate in the **batch submit**
  (`submitJudgeScores:1301–1313` checks criterion range **and** `isScoreInBounds(scale)` — the intersection).
- **Consequence:** set scale=1–10 but leave a criterion at 0–100 → judge UI allows 100, live submit
  accepts 100, batch submit rejects >10. The two paths disagree; the scale is half-wired.

### Target (scale wins everywhere)
- The organizer sets the range **once** in Score Config (`scoreType`: 1–10 / 1–100 / decimal / custom).
- Every criterion inherits that range automatically; the Criteria page shows the scale **read-only** and
  keeps **only the weight (%)** as input. (Optional advanced per-criterion override may be kept behind a
  flag for the rare "one criterion out of 20" case — off by default.)
- **Judge UI + live submit + batch submit all resolve bounds from `resolveScoreBounds(scoreType)`** so a
  score is validated identically on every path.

### Changes (folded into Phase 4)
- **Backend:** `submitJudgeSessionScore` (live) must also enforce `isScoreInBounds(scoreType)` so it
  matches the batch path; treat criterion `min_score`/`max_score` as an **optional override that must fit
  inside** the scale (validated), otherwise derive from the scale.
- **Frontend:** `CompetitionScoringForm` uses scale-derived bounds (+ `decimalPlaces`) for the input;
  `CompetitionCriteriaPage` drops the required min/max inputs, shows the scale read-only, keeps weight.
- **DB/migration:** none required — keep `min_score`/`max_score` columns (now optional override; default =
  scale). No destructive change; existing rows (0–100) already match the default `range_1_100` scale.

---

## 8D. Contestants / entrants — solo, duo, team, group (no change required)

> Decision: teams/duos/groups are scored **as a single unit**, and Divisions separate the kinds. The
> current model already supports this — **no schema, engine, or judge-UI change is needed.**

- A **contestant is an entrant-agnostic scored unit**: `{ id, name, photo, contestantNumber, divisionId }`.
  There is no `contestant_type`, no member roster, no team size in the schema or code.
- **Live scoring is identical for every kind:** `getJudgeSessionView` hands the judge one active
  contestant + the round's criteria; the judge submits **one set of scores for that unit**. A team is
  scored exactly like a solo.
- **How to model each kind (today, no changes):** Solo = the person; Duo = one contestant named e.g.
  "Duo — Ana & Ben"; Team/Group = one contestant named e.g. "Team Alpha" (team photo). Use **Divisions**
  (e.g. "Solo" vs "Team") to rank each kind in its own pool.
- **Explicitly out of scope** (only revisit if requirements change): member rosters, per-member scoring
  with team aggregation, and a stored entrant-kind label. None are needed for unit-level team scoring.

---

## 9. Authentication & Security Impact

Current posture is sound and **unchanged** by this plan: role separation (`authorize(ORGANIZER|VOTER)`),
`requireEventParticipant(COMPETITION_JUDGE)`, service-layer `assertOrganizerOwnsEvent` /
`assertCompetitionEvent`, judge-scope enforcement via `canJudgeScore` + `resolveAllowedDivisions`,
score locking, HTTP-only cookies. No RLS (app-layer only) — acceptable for this scope.

Security touch-points introduced by the plan:
- New template/type endpoints are organizer-guarded and only seed the organizer's own event.
- Write-through in 7.1 must reuse the **same** `canJudgeScore`/division validation already applied on the
  session-score path (it does — the bridge writes what was already validated).
- Out of scope this round (documented, not done): rate-limit tuning, CSRF on session controls, audit logging.

---

## 10. Risks & Dependencies

| Risk | Severity | Mitigation |
|---|---|---|
| Write-through (7.1) double-writes or races with batch path | Med | Use existing unique key upsert; idempotent; cover with tests |
| Per-round criteria change (7.2) alters existing event results | Med | Feature-flag via presence of `round_criteria`; snapshot-test rankings before/after |
| Event-name/socket refactor (7.4) breaks working polling fallback | Low | Keep polling as fallback; ship listeners additively |
| `competition_type` column migration | Low | Purely additive, nullable — no backfill, reversible down-migration |
| Template seeding creates rows organizer didn't expect | Low | All seeded rows are editable/deletable; "Simple" seeds nothing |
| Naming left as-is keeps `pageant`/`competition` ambiguity | Low | Accepted per decision; document in code comments |
| **Round advancement (Phase 6) eliminates the wrong contestants** | **High** | Snapshot `competition_round_results`; require organizer confirm step + manual override before seeding next round; nothing auto-deletes contestants |
| Advancement seeds next round while judges still scoring | Med | Finalize requires the round closed (`is_open=false`) + all eligible judges submitted, or explicit organizer override |
| `score_policy=cumulative` double-counts prior rounds | Med | Engine sums prior finalized-round snapshots, not raw scores; covered by Phase 0 fixtures |
| New `competition_round_results` table + round columns | Low | Additive, reversible; `advancement_type='none'` default preserves current behavior |

**Dependencies:** 7.1 (store bridge) should land before/with 7.2–7.3 so ranking changes are tested against
real live data. Template layer (Phase 1–2) is independent of the integrity fixes and can proceed in parallel.
**Phase 6 (advancement) depends on Phase 4** (correct per-round scoring) and Phase 3 (live scores in the
ranking store). **Phase 7 (results/awards) depends on Phase 4 and 6.**

---

## 11–13. Changes Required (Frontend / Backend / Database)

**Database (all additive, reversible):**
- Migration `NNN_competition_type.sql`: `ALTER TABLE events ADD COLUMN IF NOT EXISTS competition_type VARCHAR(32);`
  + partial index `WHERE competition_type IS NOT NULL`; down-migration drops both. No data backfill.
- Migration `NNN_round_advancement.sql` (Phase 6): add `competition_rounds.advancement_type VARCHAR(16)
  DEFAULT 'none'`, `advancement_value NUMERIC`, `score_policy VARCHAR(16) DEFAULT 'independent'`,
  `finalized_at TIMESTAMPTZ`; create `competition_round_results` (`round_id, contestant_id, division_id?,
  rank, score, qualified, created_at`, `UNIQUE(round_id, contestant_id)`, indexes on `round_id`). Defaults
  preserve current behavior. Reversible down-migration.
- 7.1 reuses existing `competition_scores`; 7.2/7.3/§8A are code-only.

**Backend:**
- New `modules/competition-templates.js` (static catalog) + `GET /organizer/competition/templates`.
- Extend event create (`pageant.service.js` create path) to accept `competitionType` + optional
  `templateKey`; seed categories/rounds/criteria/scoring_config in a transaction when a template is chosen.
- `validators/competition.validator.js`: validate `competitionType`, `advancement_type`, `score_policy`
  against catalogs; ignore/branch nothing else.
- `competition-session.service.js#submitJudgeSessionScore`: **write-through** to `competition_scores` (7.1);
  `completeSession`: backfill safety net.
- `scoring-engine.js` + `getLiveRankings`: honor per-round criteria + `round_id` separation + `score_policy`
  (7.2, §8A); equal-rank + configurable tiebreak (7.3, Phase 7).
- **`assertScoringWeightsValid` → scope-aware** (criteria per-round, rounds per-category, categories
  per-event/division; §8A, Phase 4).
- **New round-finalize/advancement service** (Phase 6): compute round standing → write
  `competition_round_results` → select qualifiers per `advancement_type/value` → seed next round's
  `competition_round_contestants` → lock finalized round. New route `POST .../session/finalize-round`
  (and/or `POST .../rounds/:roundId/finalize`).
- **Results service (Phase 7):** per-round / per-category / per-division standings, overall champion,
  and per-category special awards, built on the same engine output.
- Normalize `getFoundation` output shape (7.5).

**Frontend:**
- Add an **optional "Type / Template" selection** to the creation wizard (`CompetitionEventFormPage.jsx`)
  — a new first sub-step or an inline picker on Details; call `getTemplates()`, pass `competitionType`+`templateKey` on publish.
- New service methods `getTemplates()` in `services/pageant.service.js` (both aliases).
- Optionally surface the type as a badge on Events list/Dashboard (reuse existing card components).
- **Workspace Rounds tab (Phase 6):** add per-round advancement settings (type + value + score policy);
  add a **"Finalize round & advance"** action in `CompetitionLiveControlPage.jsx` with a qualifier
  review/override modal before confirming. Reuse existing tables/modals.
- **Rankings/Results (Phase 7):** show per-round standings, per-division winners, per-category awards,
  and overall champion in `CompetitionRankingsPage.jsx` + the report page. Reuse existing components.
- Real-time cleanup (7.4): fix event names in `CompetitionLiveControlPage.jsx`; migrate
  `JudgeScoringPage.jsx` to `useSocketEvent`; consider adopting `hooks/useCompetitionSession.js`.
- No new *modules*; new UI is additive tabs/actions on existing pages.

---

## 13A. Admin & Voter Surfaces — Impact

**Bottom line: this plan requires _no mandatory_ changes to the Admin dashboard or the Voter
dashboard.** The one voter-side change that *is* required (real-time on the judge scoring page) is
already captured in Phases 3 & 5 and lives on `JudgeScoringPage.jsx`, **not** the dashboard. Everything
else here is an **optional, low-effort display enhancement** so the new competition *type* label shows
up where events are listed. Each enhancement is one added column in a `select` + a small badge render.

### Admin

| Surface | File(s) | Required? | What (if anything) changes |
|---|---|---|---|
| **Admin Dashboard** (platform stats) | `pages/admin/AdminDashboardPage.jsx`; stats via `services/admin.service.js` + `platform:stats-updated` | ❌ **No change** | Shows only platform aggregates (organizers, events, voters, active events, votes). No per-type logic to touch. |
| Global Events list | `pages/admin/GlobalEventsPage.jsx` (badge at `:250–257`, type filter at `:169`); `services/admin.service.js#getGlobalEvents` (`select` at `:104`) | 🟡 **Optional** | Today the badge prints the raw `event.event_type` string ("competition_scoring") with a Trophy icon (already handles `pageant`+`competition_scoring`). Enhancement: add `competition_type` to the `getGlobalEvents` select and render a friendly sub-label (e.g. "Competition · Pageant"). No filter change needed. |
| *(Optional)* per-type breakdown | admin stats service | 🟡 **Optional / low value** | If desired, group platform stats by `competition_type`; needs a backend aggregation + a card. Not recommended for the first pass. |

### Voter (Judge)

| Surface | File(s) | Required? | What (if anything) changes |
|---|---|---|---|
| **Voter Dashboard** (role groups + assigned events) | `pages/voter/VoterDashboardPage.jsx`; backend `services/voter.service.js#classifyCompetition` (`:42`) via `listJudgeCompetitionEvents` | ❌ **No mandatory change** | Groups events by participant type; competition events already show as **"Judge"** (Trophy), with status "Scoring open / Waiting / Scores submitted" → action to the scoring page. Its `useSocketEvent('competition:scoring-toggled')` listener already matches a real backend event, so it keeps working. |
| Voter Dashboard — type badge | same + `components/voter/VoterEventCard.jsx` | 🟡 **Optional** | Surface the sub-type on the judge's event card. Requires `classifyCompetition` to pass `competitionType` and `listJudgeCompetitionEvents` to `select` the new column; then render a badge. |
| **Judge Scoring page** | `pages/voter/JudgeScoringPage.jsx` | ✅ **Required — already in plan** | Real-time fix (Phase 5): move off the undefined `window.socketClient` to `useSocketEvent` with the backend's real event names; benefits from the live→rankings write-through (Phase 3). This is the actual voter-side work — it is **not** a dashboard change. |

### How this folds into the phases (no new phases needed)

- **Phase 1** already adds `events.competition_type` and persists it. Extend that phase's *display*
  work to (optionally) include the two one-line `select` additions + badges:
  `admin.service#getGlobalEvents` and `voter.service#classifyCompetition` /
  `listJudgeCompetitionEvents`. Mark these as **optional display polish**, safe to defer.
- **Phase 5** already covers the only required voter-side change (judge scoring real-time).
- **No admin-side change is required** by either the flexibility layer or the integrity fixes; the
  admin dashboard's `platform:stats-updated` path is untouched.

**Risk:** these are additive reads/renders on `NULL`-tolerant fields — an existing event with no
`competition_type` simply shows the current generic "Competition" badge. No migration or auth impact.

---

## 14. Phased Implementation Plan

> Each phase ends with regression tests + a manual smoke run (see §15). Phases 1–2 (flexibility) and
> Phase 3 (integrity) are independent and may be parallelized; do Phase 3 before Phase 4.
>
> **Execution order (locked with user): correctness-first.** Milestone A = Phase 0 → 3 → 4 → 5
> (fix bugs affecting current users), then Milestone B = Phase 6 → 7 → 1 → 2 (new capability).
>
> **Implementation status:**
> - ✅ **Phase 0 — DONE.** `__tests__/modules/scoring-engine.characterization.test.js` (5 tests locking
>   per-round-merge / tie / drop-N / no-division behavior) + `__tests__/services/live-scores-store-disconnect.test.js`
>   (table-tracking proof of the §7.1 disconnect). Baseline: full backend suite green.
> - ✅ **Phase 3 — DONE.** Write-through bridge in `competition-session.service.js`
>   (`bridgeSessionScoresToRankingStore`, null-round-safe delete-then-insert) wired into both submit
>   branches; best-effort backfill (`backfillLiveScoresToRankingStore`) on `completeSession`. The Phase 0
>   disconnect test was flipped to assert the fix (live submit now writes BOTH stores). Suite: 275 green.
> - ✅ **Phase 4 — DONE (backend + frontend).** Engine (`scoring-engine.js`) has a **scoped per-round
>   path** (honors `roundCriteria`, keeps `round_id` separate) feature-guarded on round-criteria presence,
>   plus **standard-competition equal-rank ties** (`assignRanks`, "1224"); `getLiveRankings` threads
>   `round_criteria` in. **§8C** live submit enforces `isScoreInBounds(scoreType)` and `getJudgeSessionView`
>   resolves criterion bounds from the scale (+ returns `scoringConfig`). **Scope-aware criteria
>   validation** in both `assertScoringWeightsValid` and the `startSession` pre-flight. **Frontend:**
>   Criteria page shows the scale read-only + weight-only (sends scale bounds) and its 100% badge is
>   scope-aware; Workspace Rounds panel shows a **per-round criteria total** indicator. Tests: engine
>   characterization (9) + `scoring-weights-scope.test.js` (3) → **282 backend green**; frontend builds clean.
> - 🟡 **Phase 5 — 7.4 DONE (real-time), 7.5 deferred.** `CompetitionLiveControlPage` now subscribes to
>   the backend's ACTUAL event names (`session:status-changed` / `contestant-changed` / `round-changed` /
>   `division-changed` / `judge-score-submitted`) instead of the non-existent `session:state-changed` /
>   `session:judge-submitted`; `JudgeScoringPage` migrated off the undefined `window.socketClient` onto the
>   module WS client via `useSocketEvent` (+ `ws:connected`/`ws:disconnected`, seeded from new
>   `socket.service#isConnected`). Confirmed vs `ws-server` room model: organizers/voters are auto-joined
>   to their `event:{id}` rooms on connect, so no manual room-join is needed. Frontend builds clean; lint
>   clean on changed files. **Runtime (two-browser) verification still pending — needs the app running.**
>   _7.5 (getFoundation camel/snake normalization) intentionally deferred:_ low value, high blast radius
>   across many pages that read the shape defensively, and no frontend test harness to catch regressions.
> - ✅ **Phase 1 + 2 — DONE (pending manual migration apply).** Migration `057_competition_type.sql`
>   (+ down) adds the nullable `events.competition_type` label + partial index. New
>   `modules/competition-templates.js` (pageant/dance/singing/talent/simple, weight-valid);
>   `GET /organizer/competition/templates`; create/update persist `competitionType`; `createCompetitionEvent`
>   seeds editable categories/rounds/criteria/scoring_config from `templateKey` (best-effort);
>   `mapEvent` surfaces `competitionType`; validator whitelists both against the catalog. Frontend:
>   `getTemplates()` service + an optional **type/template picker** on the create wizard's Details step,
>   threaded through the draft payload → publish. Tests: `competition-templates.test.js` (23) → **305 backend
>   green**; frontend builds clean. **⚠️ ACTION REQUIRED: apply `057_competition_type.sql` in the Supabase
>   SQL Editor before deploying** — create/update now write `competition_type`.
> - ✅ **Phase 6 — DONE (pending manual migration apply).** Migration `058_round_advancement.sql`
>   adds `competition_rounds.{advancement_type,advancement_value,score_policy,finalized_at}` + new
>   `competition_round_results` snapshot table (defaults preserve current behavior). New pure
>   `modules/advancement.js` (`selectQualifiers` top_n/top_percent/threshold/manual/none with boundary-tie
>   inclusion; `applyQualifierOverride`). `competition-session.service.js`: `computeRoundStanding`
>   (honors round criteria + `score_policy` cumulative), `previewRoundAdvancement` (no-commit review),
>   `finalizeRound` (snapshot → qualifiers+override → lock round → seed next round, idempotent, gated on
>   closed+not-finalized), `getRoundResults`; submit now rejects scoring a finalized round. Routes +
>   controller added; `updateRound`/`mapRound`/`validateRound` thread the new fields. **Frontend:**
>   Workspace Rounds panel gets advancement/score-policy settings; Live Control gets a **"Finalize round &
>   advance"** review modal (preview standing → toggle qualifiers → confirm). Tests: `advancement.test.js`
>   (9) + `round-finalize.test.js` (3) → **317 backend green**; frontend builds clean.
>   **⚠️ ACTION REQUIRED: apply `058_round_advancement.sql` in Supabase before deploying.**
> - ✅ **Phase 7 — DONE (no migration).** Engine gains an **opt-in tie-breaker**
>   (`scoring_config.tieBreaker: 'highest_criterion'`; default null = unchanged equal-rank behavior),
>   validated + tested. New `getCompetitionResults` (pageant.service) assembles the announce-ready view:
>   overall **champion**, **Best-in-category** awards (from per-category sub-scores), **per-division
>   winners**, and **finalized per-round standings** (from the Phase 6 snapshots). Route
>   `GET /organizer/competition/events/:eventId/results` + controller. **Frontend:** a **Results & Awards**
>   panel on `CompetitionRankingsPage`. Tests: 2 tie-breaker cases → **319 backend green**; frontend builds clean.
> - **All plan phases delivered (0–7).** Remaining are the two consciously-deferred items:
>   Phase 5·7.5 (getFoundation shape normalization) and the optional admin/voter type-badge polish (§13A).
>   **Two migrations still need manual apply: `057_competition_type.sql`, `058_round_advancement.sql`.**
>   Runtime (two-browser live) verification of the live/finalize/results UIs is still pending — needs the
>   app running with both migrations applied.

### Phase 0 — Safety net & baseline (no behavior change) — ✅ DONE
- **Objective:** Lock current behavior before touching ranking math.
- **Work:** Add characterization tests for `computeRankings` (0/1/N rounds, categories, divisions, drop-N)
  and an end-to-end "live session → rankings" test that **demonstrates the 7.1 disconnect** (currently live
  scores → empty rankings).
- **DB/migration:** none. **Security:** none. **Risk:** none. **Deps:** none.
- **Regression:** the new tests are the baseline; snapshot ranking outputs.

### Phase 1 — Competition Type (label) + template catalog (read-only) — ✅ DONE (apply migration 057)
- **Objective:** Store a type and expose templates, without seeding yet.
- **Backend:** migration `events.competition_type`; `modules/competition-templates.js`;
  `GET /organizer/competition/templates`; accept & persist `competitionType` on create/update;
  validator entry. **Frontend:** wizard type picker (defaults to none/Simple); type badge (optional).
- **Optional display polish (see §13A):** add `competition_type` to `admin.service#getGlobalEvents`
  select + friendly badge on `GlobalEventsPage`; pass `competitionType` through
  `voter.service#classifyCompetition` / `listJudgeCompetitionEvents` + badge on the judge's event card.
  Safe to defer; no admin/voter **dashboard** change is required.
- **DB/migration:** yes (additive, reversible). **Security:** organizer-guarded read of static catalog.
- **Risk:** Low. **Deps:** none.
- **Regression:** create event with/without type; existing events (NULL type) unaffected; wizard draft/resume still works; admin Global Events + voter dashboard still render NULL-type events with the generic "Competition" badge.

### Phase 2 — Template seeding on create — ✅ DONE
- **Objective:** Selecting a template pre-fills editable structure.
- **Backend:** transactional seed of categories/rounds/criteria/scoring_config from `templateKey`;
  idempotent (only on create). **Frontend:** template preview + "start blank" path; after publish, Workspace
  shows seeded rows.
- **DB/migration:** none. **Security:** seeds only into caller's own new event. **Risk:** Low (all rows editable).
- **Deps:** Phase 1.
- **Regression:** each template seeds valid 100%-weight sets; "Simple"/none seeds nothing; seeded rows editable/deletable; pre-flight validation still passes/fails correctly.

### Phase 3 — Integrity fix: live scores feed rankings (7.1) — ✅ DONE
- **Objective:** Live-session scores appear in rankings/analytics.
- **Backend:** write-through in `submitJudgeSessionScore` → `competition_scores` (reuse existing unique key &
  validated context); backfill in `completeSession`. **Frontend:** none.
- **DB/migration:** none (reuses `competition_scores`). **Security:** reuses existing judge-scope validation.
- **Risk:** Med (double-write/races) → covered by Phase 0 tests + upsert idempotency. **Deps:** Phase 0.
- **Regression:** Phase 0 e2e test now shows live scores in rankings; batch path unchanged; re-submit locked (409).

### Phase 4 — Integrity fix: scope-aware weights + per-round criteria + tie-breaking (7.2, 7.3, §8A) — ✅ DONE
- **Objective:** Make the ranking math and the weight validation match the live scoring page and an
  organizer's mental model (criteria 100% *within a round*, rounds 100% *within a category*, categories
  100% *within event/division*); accurate multi-round scoring; stable ranks.
- **Backend:**
  - `computeRankings` + `getLiveRankings`: thread `competition_round_criteria` in; normalize criteria
    within their round; group by `contestant|criteria|round` (stop cross-round merge); honor round weights.
  - **`assertScoringWeightsValid` → scope-aware** (criteria per-round, rounds per-category, categories
    per-event/division), falling back to the flat event-wide rule when the finer scope is unused.
  - Equal-rank handling for tied `finalScore`.
  - **Score range = scale (§8C):** make the live submit enforce `isScoreInBounds(scoreType)` like the
    batch path; treat criterion min/max as an optional override validated to fit inside the scale.
  - **Frontend:** mirror the scope-aware 100% checks in the Workspace/Criteria tabs (currently event-wide);
    Criteria page keeps weight only + shows the scale read-only; scoring form derives bounds from the scale.
- **DB/migration:** none. **Security:** none. **Risk:** Med (changes existing numbers) → **feature-guard
  on presence of `round_criteria`** so pre-existing flat-model events keep their numbers; snapshot tests
  (Phase 0) before/after. **Deps:** Phase 3.
- **Regression:** flat single-round event unchanged; pageant 2-round/3-category fixture with per-round
  criteria totals; division-scoped weights validate within each division; ties produce equal ranks.

### Phase 5 — Real-time consolidation (7.4) + shape normalization (7.5) — 🟡 7.4 DONE, 7.5 deferred
- **Objective:** Reliable live updates without polling reliance; consistent data shapes.
- **Frontend:** correct event names in LiveControl; move JudgeScoring to `useSocketEvent`; optionally adopt
  `useCompetitionSession`. **Backend:** normalize `getFoundation` mapping.
- **DB/migration:** none. **Security:** none. **Risk:** Low (keep polling fallback). **Deps:** none (can run anytime).
- **Regression:** two-browser live test (organizer advances → judge sees contestant; judge submits → organizer progress + rankings update live).

### Phase 6 — Real-competition round progression: advancement, elimination & score policy (§8B) — ✅ DONE (apply migration 058)
- **Objective:** Rounds behave like real elimination stages — finalize a round, rank it, advance the top
  performers, carry or reset scores per policy, and lock the finalized round.
- **DB/migration:** `competition_rounds.advancement_type/advancement_value/score_policy/finalized_at`
  + new `competition_round_results` table (additive, reversible; defaults preserve current behavior).
- **Backend:** round-finalize/advancement service (compute standing → snapshot results → select qualifiers
  → seed next round's `competition_round_contestants` → lock scores of finalized round); engine honors
  `score_policy` (`independent` vs `cumulative`); new route(s) `POST .../session/finalize-round`.
- **Frontend:** per-round advancement settings in the Workspace **Rounds** tab; **"Finalize round & advance"**
  action + qualifier review/override modal in **Live Control**; broadcast switches active round.
- **Security:** organizer-owns-event on finalize; judges unaffected. **Risk:** **High** (eliminates
  contestants) → mandatory confirm + manual override, no auto-delete, snapshot is immutable audit.
- **Deps:** Phase 4 (correct per-round scoring) + Phase 3 (live scores in ranking store).
- **Regression:** top-N / top-% / threshold / manual policies each seed the right qualifiers; `cumulative`
  carries prior-round snapshot (no double count); `independent` uses only current round; finalized round
  rejects score edits; `advancement_type='none'` leaves current one-round behavior unchanged.

### Phase 7 — Real-competition results: standings, winners & special awards (§8B) — ✅ DONE
- **Objective:** Announce results the way real competitions do — per-round standings, per-division winners,
  per-category ("Best in …") awards, overall/grand champion, and configurable tie-breaks.
- **DB/migration:** none (reads `competition_round_results` + engine output); tiebreak stored in
  `events.scoring_config`.
- **Backend:** results service assembling per-round / per-category / per-division standings + overall
  champion + category awards; configurable tiebreaker in `computeRankings`.
- **Frontend:** results/awards sections on `CompetitionRankingsPage.jsx` + the report page (reuse components).
- **Security:** none new. **Risk:** Low. **Deps:** Phase 4 + Phase 6.
- **Regression:** category winners match per-category sub-scores; per-division winners isolated to division;
  overall champion honors `includeOverallRanking`; tiebreak resolves a crafted tie deterministically.

---

## 15. Verification (end-to-end)

**Automated (backend):** run the existing test runner (`npm test` in `backend/`); add/execute
`scoring-engine` characterization tests (Phase 0), the live→rankings e2e (Phases 0 & 3), and the
multi-round/tie fixtures (Phase 4).

**Manual smoke (per type — do at least Pageant + Simple):**
1. Create event → pick a **template** → publish; confirm Workspace pre-filled (or blank for Simple).
2. Add contestants + judges; verify pre-flight blocks starting until criteria total 100% and ≥1 judge.
3. **Live Control:** start → advance contestants (and switch round/division for Pageant).
4. **Judge Scoring** (second browser / `/voter/competition/events/:id/score`): score active contestant;
   confirm auto-save + lock, and that the organizer's judge-progress + rankings update **live** (Phase 5).
5. Complete session → open **Rankings/Analytics** and confirm the live scores are reflected (Phase 3).
6. Regression: an **existing** (pre-migration, NULL-type) event still opens, scores, and ranks unchanged.

**Tooling:** the app can be launched with the `/run` skill or the Browser preview to drive steps 3–5
in two tabs; WebSocket traffic is visible via the browser network tools if event names need confirming.

---

## Implementation Rules honored
- ✅ One core architecture for all types (no per-type modules).
- ✅ Reuse existing pages/APIs/services/tables; templates only pre-fill existing structures.
- ✅ No duplicate sources of truth (7.1 keeps `competition_scores` canonical for rankings).
- ✅ Categories/Divisions/Rounds stay optional; "Simple" needs none.
- ✅ Configuration-driven; the type is a label, never a code branch.
- ✅ Additive, reversible migration only.
- ✅ Regression tests after each phase.
