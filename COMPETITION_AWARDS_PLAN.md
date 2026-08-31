# VOTRIX Competition — Optional Awards Feature: Safe Implementation Plan

> **This is a plan, not a modification.** It is grounded in the *actual* VOTRIX Competition module, and
> it corrects the parts of the request that don't match the current system. Awards are **fully optional**:
> if an organizer never adds one, nothing changes anywhere.
>
> **IMPLEMENTATION STATUS — ✅ Phases 1 & 2 DONE.**
> - Phase 1 (derived Score/Criteria + `awards_enabled` toggle + Awards page + wizard/footer/sidebar) — migration `066`.
> - Phase 2 (interactive Vote/Judge Selection: selections table, open/close/finalize, judge task card,
>   Live Control panel, tally, results surfacing) — migration `067`.
> - Eligibility for interactive awards = the event's active competition judges (no per-award judge table
>   in this build; can be added later). 362 backend tests green; frontend builds clean.
> - **Operator action:** apply migrations `066` and `067` in Supabase, then restart the backend.

---

## 0. Verification of the request against the current system

Before designing, here is what's **true**, **partly true**, and **not accurate** in the proposal:

| Claim in the request | Reality in your code | Verdict |
|---|---|---|
| Reuse Rounds / Criteria / Judges / Divisions / Categories / scoring | All exist and are reusable (`competition_rounds`, `competition_criteria`, `competition_judge_assignments`, `competition_divisions`, `competition_categories`, `scoring-engine.js`) | ✅ Accurate |
| Score & Criteria awards reuse existing scores (no double scoring) | Already precedented: `computeCategoryAwards` in `pageant.service.js` derives "Best in category" from `getLiveRankings` output | ✅ Accurate — extend this pattern |
| There is an Awards concept today | **None persisted.** Awards are only computed on the fly in the results view; no table, no lifecycle | ⚠️ Must be added (additively) |
| All four methods need a live lifecycle (DRAFT→READY→LIVE→…→COMPLETED) | Only **Vote** and **Judge Selection** need activation. **Score** and **Criteria** are pure computations over existing scores — they need **no live session** | ❌ Over-designed — simplify (see §3) |
| Vote vs Judge Selection are different mechanisms | In a controlled (judges-only) environment they are **mechanically identical**: a judge picks one contestant. They differ only by **label** and optional tally rule | ⚠️ Recommend one shared mechanism, two labels |
| Judges shouldn't score the same criterion twice for a criteria-award | Correct, and the derived approach guarantees it (the award reads the criterion the judge already scored) | ✅ Accurate |
| Public voting | Your system is organizer + assigned-judges only. **No public path exists or is wanted** | ✅ Keep it judges-only |

**Net:** the request's *architecture* fits VOTRIX well. The main correction is that awards fall into
**two families** — **derived** (no new interaction) and **interactive** (a new judge task) — and only the
interactive family needs Live Control activation. Designing all four as live sessions would add needless
complexity.

---

## 1. The core design: one Award, two families

```
AWARD  (optional, organizer-created)
│
├── DERIVED  (reuses existing scores — NO new judge interaction, NO live session)
│   ├── Score     → highest final score of a chosen ROUND
│   └── Criteria  → highest average of a chosen CRITERION (within a round)
│
└── INTERACTIVE (a new judge task — needs Live Control activation)
    ├── Vote            → each assigned judge picks one contestant (tally = most picks)
    └── Judge Selection → same mechanism, different label/rule (e.g. head-judge decides ties)
```

- **Derived awards** are computed the moment their source round has scores — exactly like the existing
  "Best in category." They add a *result*, not a new scoring step. Judges never see them as a task.
- **Interactive awards** are a genuinely new judge interaction (pick a contestant, not a number). These
  reuse the *pattern* of the live session store but on a small new table.

This split is what keeps the feature safe: 2 of the 4 methods require **zero** new judge-facing flow.

---

## 2. Data model (additive, reversible, optional)

All new tables; nothing existing is altered. If no awards are created, these stay empty and inert.

```sql
-- The award definition (all methods)
competition_awards (
  id UUID PK,
  event_id UUID NOT NULL REFERENCES events,
  name VARCHAR NOT NULL,
  description TEXT NULL,                 -- OPTIONAL, as requested
  method VARCHAR(16) NOT NULL,          -- 'score' | 'criteria' | 'vote' | 'selection'
  division_id UUID NULL REFERENCES competition_divisions,   -- optional scope
  category_id UUID NULL REFERENCES competition_categories,  -- optional scope
  source_round_id UUID NULL REFERENCES competition_rounds,     -- score/criteria
  source_criteria_id UUID NULL REFERENCES competition_criteria,-- criteria only
  status VARCHAR(16) NOT NULL DEFAULT 'draft', -- see §4 (interactive only uses live states)
  tie_break VARCHAR(24) NULL,           -- optional, reuse scoring_config style
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  finalized_at TIMESTAMPTZ NULL
)

-- Which judges may act on an INTERACTIVE award (derived awards reuse the round's judges)
competition_award_judges (
  award_id UUID REFERENCES competition_awards ON DELETE CASCADE,
  participant_id UUID REFERENCES event_participants ON DELETE CASCADE,
  UNIQUE (award_id, participant_id)
)

-- One row per judge's pick for an INTERACTIVE award (mirrors session_judge_scores)
competition_award_selections (
  id UUID PK,
  award_id UUID REFERENCES competition_awards ON DELETE CASCADE,
  judge_id UUID REFERENCES users ON DELETE CASCADE,
  contestant_id UUID REFERENCES competition_contestants ON DELETE CASCADE,
  is_locked BOOLEAN DEFAULT FALSE,
  locked_at TIMESTAMPTZ,
  UNIQUE (award_id, judge_id)           -- one pick per judge; edit replaces (no double count)
)
```

**Why this shape:**
- `competition_award_selections` mirrors `competition_session_judge_scores` (per-judge, lockable,
  `UNIQUE` so an edit replaces rather than adds — the same no-double-count guarantee you already have).
- Derived awards need **no** `award_judges` / `award_selections` — they read existing scores. Those
  columns simply stay null.
- `division_id` / `category_id` reuse your existing scoping so an award can be "Senior Female only."

**Migration:** additive tables + one down-migration that drops them. Zero change to existing tables.

---

## 3. How each method is computed (reusing the engine)

### Score award (derived)
"Highest final score in round R (within an optional division/category)."
- Read `getLiveRankings(eventId, { divisionId })` → each row's `perRound[R].value`. Winner = max.
- **Zero new scoring.** This is the existing `computeCategoryAwards` pattern applied to a round.

### Criteria award (derived)
"Highest average of criterion K (inside round R)."
- The engine already exposes `perCriterion[K].average` per contestant. Winner = max.
- **Zero new scoring** — the judge scored K once, during round R.

### Vote / Judge Selection award (interactive)
"Each assigned judge picks one contestant; tally the picks."
- Judge submits one `competition_award_selections` row (upsert → edit replaces).
- Winner = contestant with the most picks; ties resolved by the award's `tie_break` (default: flag a tie
  for the organizer, or head-judge pick). Vote and Selection share this mechanism; the only difference is
  the label and (optionally) whether one judge's pick is decisive.

**Result assembly:** extend `getCompetitionResults` to also return `awards[]` — each with method, scope,
winner, and the tally/score it was based on. Derived awards compute inline; interactive awards read the
selection tally. This slots next to the existing `categoryAwards` with no engine change.

---

## 4. Award lifecycle (only interactive awards need it)

```
DERIVED  (score / criteria):   no lifecycle — computed on demand once the source round has scores.
                               Organizer just marks it "published" when they want it shown.

INTERACTIVE (vote / selection):  draft → open → (paused) → closed → finalized
                                 └ judges can submit ONLY while `open`
```

Keep it minimal: `draft` (configured, not yet live), `open` (judges can pick), `closed` (submissions
locked), `finalized` (winner recorded, snapshot). No separate CANCELLED/CALCULATING states unless you
later need them — fewer states = fewer edge cases.

---

## 5. Live Control integration

Add an **Awards panel** to `CompetitionLiveControlPage` — but only as a switchboard, not a second config
screen (config lives on the Awards page). The panel adapts by family:

```
AWARDS
────────────────────────────────
Best in Talent            [Derived · Score]
  Auto-computed from "Talent" round.        → [View result]  (no activation needed)

Best Stage Presence       [Derived · Criteria]
  Auto-computed from Talent → Stage Presence. → [View result]

Best in Personality       [Interactive · Selection]   ● draft
  5 judges assigned.                          → [Open award]

Best Dressed              [Interactive · Vote]         ● open  (3/5 submitted)
  → [Close] [View progress]
```

- **Derived awards:** no Start/Stop — they show their computed winner (and gray out until the source
  round has scores). This is the key simplification vs the request.
- **Interactive awards:** the organizer gets Open / Close / (Reopen) / View progress / Finalize — reusing
  the exact control pattern of the live session (and the `session:*` WebSocket events, adding
  `award:status-changed` / `award:selection-submitted`).
- Pre-flight on **Open** (mirrors the session pre-flight you already have): award configured, ≥1 assigned
  judge, contestants eligible in scope, no conflicting open award if you want that rule.

---

## 6. Judge Scoring page integration

The judge should only ever see **what they must do now** — and derived awards are *not* something they do.

- **Derived (score/criteria):** the judge sees **nothing extra**. They score the Talent round once; the
  award is computed from those scores. This is the anti-double-scoring guarantee, and it needs no judge UI
  at all. (Optionally show a passive note: "Best in Talent is decided from this round.")
- **Interactive (vote/selection):** when the organizer opens the award, assigned judges get a task card on
  the existing judge page:

```
BEST IN PERSONALITY        ● live
Choose ONE contestant:
  ( ) #1 Contestant A
  ( ) #2 Contestant B
  ( ) #3 Contestant C
[ Submit selection ]      → after submit: "✓ Submitted — locked"
```

- Reuse the current judge page shell, the `useSocketEvent` wiring, and the lock-after-submit behavior.
  A selection is one contestant id, submitted to `competition_award_selections` (upsert → edit replaces).
- The judge **never** sees organizer controls, other judges' picks, or configuration.

---

## 6A. Step wizard & stage footer

Awards config is a **Setup** page, so it must appear in the step wizard and its footer. Both the stepper
(`components/ui/EventStepper.jsx`) and the footer next/prev (`components/ui/StageFooter.jsx`) render from
the **single** `EVENT_STAGES.competition` array in `utils/eventStages.js` — so **one entry drives both**;
there is no separate footer list to keep in sync.

**Placement:** last in the Setup group, after Judges, before Live Control (matches §0/§8 — Awards depend
on rounds/criteria/judges/divisions, so it comes after them):

```js
// utils/eventStages.js — competition[]
  { key: 'judges',  label: 'Judges',  path: 'judges' },
  { key: 'awards',  label: 'Awards',  path: 'awards' },   // NEW — optional, last in Setup
  // Run
  { key: 'live',    label: 'Live Control', path: 'live' },
```

Adding that one line means:
- the **stepper** shows an "Awards" step in order;
- the **footer** "Next" from Judges → Awards → Live Control, and "Previous" the reverse, automatically
  (both use `getNextStage`/`getPrevStage` over the same array);
- `stagePath('competition', 'awards', eventId)` resolves the route.

**Optionality in the wizard (important):** Awards is skippable, exactly like the Information Form step.
- It must **not** be a required completion gate — `useEventProgress` should treat Awards as optional
  (always "complete/skippable") so an event with no awards never shows as unfinished and the footer never
  blocks moving past it.
- The Awards page itself renders an empty state ("No awards — this competition doesn't use any") so
  landing on it without configuring anything is a valid, terminal state.
- If you prefer the step to appear **only when relevant**, the alternative is to keep the array static but
  hide/disable the step unless the organizer has toggled "use awards" — more logic, and not recommended;
  a skippable-but-visible step matches how Information Form already behaves and is the safer choice.

No change to the stepper or footer **components** is needed — they are data-driven; only the stages array,
a route, and the page are added.

---

## 7. Security & controlled environment (reuse existing guards)

- **Organizer-only config/activation:** `authorize(ORGANIZER)` + `assertOrganizerOwnsEvent` on every
  award create/update/open/close/finalize (same as sessions today).
- **Judge submit scope:** `requireEventParticipant(COMPETITION_JUDGE)` + the award must be `open` + the
  judge must be in `competition_award_judges` (or, for derived-from-round awards, assigned to that round
  via the existing `canJudgeScore`). Enforced **backend-side**, not by hiding buttons.
- **Isolation:** division/category scoping reuses existing filters, so a Senior-Female award can't be
  affected by other divisions.
- **No public surface:** nothing is added to any voter/public route; awards live entirely under
  `/organizer/competition` and the assigned-judge scoring page.

---

## 8. Optionality guarantee (the safety contract)

- If an organizer **creates no awards**, `competition_awards` is empty → the Awards panel, judge tasks,
  and results section all render nothing. **Every existing screen and calculation is byte-identical.**
- `description` is nullable → optional, as requested.
- Derived awards require no judge interaction, so enabling one never changes the scoring flow.
- All new tables are additive with down-migrations → fully reversible.

---

## 9. Phased implementation plan

Each phase ends with tests + a full-suite run. Derived awards first (lowest risk, reuse the engine),
interactive awards second (new interaction).

### Phase 1 — Award definitions + derived awards (Score, Criteria) · additive tables, no new judge flow
- **DB:** `competition_awards` (+ down-migration).
- **Backend:** award CRUD service/controller/routes under `/organizer/competition`; extend
  `getCompetitionResults` to compute `score`/`criteria` winners from existing `getLiveRankings` output
  (reuse the `computeCategoryAwards` approach).
- **Frontend:** an **Awards** setup page (list + add/edit form, method = score/criteria, optional
  description/division/category/source round/criterion); render derived winners in Results and a
  read-only Awards panel in Live Control. **Wizard wiring:** add the `awards` stage to
  `EVENT_STAGES.competition` (§6A), the `/organizer/competition/events/:id/awards` route, and a Setup
  sidebar entry; mark the stage optional in `useEventProgress` so it never blocks completion.
- **Judge page:** no change.
- **Risk:** Low (read-only computation). **Back-compat:** none created ⇒ nothing shows.

### Phase 2 — Interactive awards (Vote / Judge Selection) · new tables + judge task
- **DB:** `competition_award_judges`, `competition_award_selections` (+ down-migration).
- **Backend:** open/close/finalize award (organizer); submit-selection (judge, upsert → replace); tally +
  tie-break; `award:status-changed` / `award:selection-submitted` WebSocket events.
- **Frontend:** Live Control award controls (open/close/progress/finalize); judge task card on the
  scoring page (reuse `useSocketEvent`, lock-after-submit); winner in Results.
- **Security:** organizer-only controls; judge submit gated on `open` + assignment.
- **Risk:** Medium (new interaction) → mirror the session store's lock/upsert idempotency; audit
  submissions via existing `recordAudit`.

### Phase 3 — Polish (optional)
- Configurable tie-break per award; "published/hidden" toggle so winners can be revealed on cue;
  award ordering; per-award result snapshot on finalize for an immutable record.

---

## 10. Risks & back-compat

| Item | Risk | Mitigation |
|---|---|---|
| New tables | Low | Additive + reversible down-migrations; empty ⇒ inert |
| Derived award double-scoring | None | Reads existing scores; no second judge input by design |
| Interactive submit races/edits | Med | `UNIQUE(award_id, judge_id)` + upsert → replace (same guarantee as session scores) |
| Judge sees wrong award | Low | Backend gates on `open` + assignment, not UI hiding |
| Live Control clutter | Low | Derived awards are read-only rows; only interactive awards add controls |
| Scope leakage across divisions | Low | Reuse existing division/category filters |

**Back-compat guarantee:** with no awards created, the Competition module behaves exactly as it does
today across setup, Live Control, judge scoring, rankings, and results.

---

## 11. Affected files (for reference, when implementation begins)

- **DB:** `migrations/NNN_competition_awards.sql` (+ down), `NNN_award_interactions.sql` (+ down).
- **Backend:** new `services/competition-award.service.js`, `controllers/competition-award.controller.js`,
  routes in `routes/competition-organizer.routes.js` + judge submit in `routes/pageant-judge.routes.js`;
  extend `pageant.service.js#getCompetitionResults`; WebSocket emits in `websocket/ws-emitter.js`.
- **Frontend:** new `pages/organizer/competition/CompetitionAwardsPage.jsx`; Awards panel in
  `CompetitionLiveControlPage.jsx`; award task card in `JudgeScoringPage.jsx`; winners in
  `CompetitionRankingsPage.jsx`; **step wizard + footer** via one entry in `utils/eventStages.js`
  (`EventStepper.jsx` / `StageFooter.jsx` are data-driven — no component change); `useEventProgress.js`
  marks the stage optional; sidebar entry (Setup group) + route in `routes/index.jsx`.

No existing scoring, ranking, session, or judge-scoring logic is modified — only extended alongside.
