# Competition Setup Workflow Redesign — Round-First, Safe Plan

_Goal: fix the real design smell (criteria configured before rounds; every round silently inherits all
criteria) and align the setup flow for **all** competition types with how real judging software works —
**without dangerous changes**. The scoring engine and database model are already correct and stay
untouched; this is a workflow / information-architecture redesign._

---

## Implementation status — Phases 0–5 DONE ✅ (sidebar regroup approved & shipped)

- ✅ **Phase 0** — `round-criteria-fallback.characterization.test.js` locks the S2 fallback.
- ✅ **Phase 1** — round-first "create criteria inside this round" editor in the Rounds panel (reuses existing APIs).
- ✅ **Phase 2 (UX-only)** — a round with no criteria now shows an explicit "falls back to all event criteria" warning instead of a silent surprise.
- ✅ **Phase 3** — sidebar regrouped into **Setup / Run / Results**; "Workspace" → **"Structure & Scoring"**; all routes unchanged (no redirects needed since paths kept).
- ✅ **Phase 4** — inline advancement helper (what each mode does + "finalize in Live Control"); **Setup readiness checklist** on the Structure & Scoring page (progressive validation, W1/W3/W4).
- ✅ **Phase 5** — Pageant/Dance templates now seed **rounds with nested criteria** (+ membership); template weight-invariant test added.
- ⏭️ **Phase 6 (strict mode)** — not needed yet; the UX-only Phase 2 covers the smell without any backend behavior change.

Verification: backend **323 tests passing** (+ template invariants), frontend builds clean, changed files lint-error-clean. No schema change; nothing dangerous. Still gated on operator actions B1 (apply migrations 057/058) + B2 (one smoke run).

---

## 1. The design smell (root causes)

| # | Smell | Why it happens today | Effect the organizer sees |
|---|---|---|---|
| S1 | **Setup order is inverted** | Criteria are created flat + event-wide on a standalone Criteria page, *then* re-associated to rounds in the Workspace. | You define criteria with no round context, then wire them up later. Unnatural for multi-round events. |
| S2 | **Silent all-criteria fallback** | If a round has **no** criteria assigned (`competition_round_criteria` empty for it), the judge view / submit **falls back to ALL event criteria**. | "Every round shows the same criteria." |
| S3 | **Ambiguous weights** | The flat Criteria page takes a single `percentage` with no signal whether it means *within a round* or *event-wide*. | Weights that sum to 300% across 3 rounds look broken until assigned. |
| S4 | **Scattered, undiscoverable config** | Advancement lives in the Rounds tab, finalize in Live Control, scoring rules in the Scoring tab — with no inline guidance. | "I don't understand how to configure advancement / scoring." |
| S5 | **Sidebar reinforces the smell** | "Criteria" is a top-level, event-global sidebar item, signalling criteria are global, not per-round. | Mental model points the wrong way from the start. |

### Other workflow problems found (same family — unguided setup)

Beyond S1–S5 (criteria/rounds), the setup has these related problems, all addressed by the same
round-first + guided-flow + regrouped-sidebar direction:

| ID | Problem | Fixed by |
|---|---|---|
| W1 | **Hidden ordering dependencies** — divisions before contestants; scopes before judge assignments; **scale before criteria** (§8C). None enforced or hinted. | ✅ **Done** — soft guardrails at each point: scale-first hint on the Criteria page, "create divisions first" hint on Contestants, "create a {scope} first" hint on Judge assignments (guide, never hard-block) + Review checklist (Phase 4) |
| W2 | **Split-brain IA** — setup split between standalone pages and Workspace tabs. | Sidebar regroup Setup/Run/Results (§4, Phase 3) — **approved** |
| W3 | **End-loaded validation** — nothing checks readiness until Start pre-flight. | Progressive validation + Review & Validate checklist (Phase 4) |
| W4 | **No "ready to go live" state** — an active event may be half-configured. | Readiness indicator on the Review step (Phase 4) |
| W5 | **Advancement configured (Rounds) vs executed (Live Control) in different places.** | Inline advancement helper + explicit "set here, finalize in Live Control" copy (Phase 4) |

### Evidence this is the wrong model (industry norm = round-first, criteria nested)
- *"Configuring your rounds first—before defining the specific scoring criteria—allows each round to have appropriately scoped criteria for its stage."* — [Award Force](https://awardforce.com/blog/articles/fairness-through-structure-planning-multi-round-judging-for-credible-award-outcomes/)
- *"Scoring forms should be tailored to each round; round one with a small number of clear questions, later rounds with more differentiated criteria."* — [Award Force best practices](https://awardforce.com/blog/judging-best-practices-for-awards-programs/)
- *"Judges score different criteria per round … custom weights, score scale, tie-breaks per segment."* — [ScoreJudge](https://scorejudge.com/judging-software/), [Pageant Planet](https://help.pageantplanet.com/hc/en-us/articles/15510278299419-How-to-Set-Up-Scoresheet-Tabulation)

**The critical point for safety:** the database already models exactly this (criteria rows + a
`round_criteria` membership table). The smell is entirely in the **setup order, defaults, and IA** — so
the fix is mostly frontend, and nothing about the scoring engine, live session, or schema must change.

---

## 2. Target model (works for every competition type)

**Rounds/segments are the primary container; each round holds its own criteria + weights.** A round with
no elimination is still a "segment." Competitions with no rounds collapse to a single implicit "Overall"
segment — so simple events stay trivial.

```
COMPETITION
└── SEGMENTS (rounds)                      ← primary container, defined first
    ├── Preliminary   → its own criteria (100% within the round) + advancement rule
    ├── Talent        → its own criteria (100% within the round)
    └── Final         → its own criteria (100% within the round)
```

### How each type maps
| Type | Segments | Criteria placement | Notes |
|---|---|---|---|
| 👑 Pageant | Talent / Gown / Q&A / Final | **per round** | The flow this redesign is built for |
| 💃 Dance | Prelim / Semi / Final (+ divisions) | **per round** | Advancement between rounds |
| 🎤 Singing | Prelim / Final, or **one** | per round, or flat if 1 | Rounds optional |
| 🎭 Talent | one segment | flat | Single implicit "Overall" |
| 📋 Simple | none | flat event-wide | **Unchanged** — today's flat Criteria page still works |

**Optionality is preserved:** rounds remain optional. A single-segment event never has to think about
rounds — it uses the flat criteria path exactly as today.

---

## 3. Workflow: before → after

**Before (current):**
```
Details → Criteria (flat, event-wide) → Contestants → Judges → Workspace{Categories│Divisions│Rounds│Assignments│Scoring}
                                                                    ↑ assign criteria to rounds here, after the fact
```

**After (round-first):**
```
Details + Type/Template
   ↓
Structure: define Segments/Rounds        ← "Single round" is the default for simple events
   ↓   (for each round, inline:)
      • add this round's Criteria + weights (must total 100% in the round)
      • set this round's Advancement rule (None / Top N / Top % / Threshold / Manual)
   ↓
Contestants
   ↓
Judges + Assignments
   ↓
Scoring rules (scale, tie-break) + Review checklist
   ↓
LIVE CONTROL → JUDGE SCORING → FINALIZE & ADVANCE → RESULTS
```

The change is **order + nesting + guidance**, not new capability. Criteria still live in the same tables;
they're just created *inside a round* instead of in a flat list first.

---

## 4. Sidebar / information-architecture change

**Today (per-event sidebar):** `Contestants · Criteria · Judges · Workspace · Live Control · Rankings · Analytics`
— "Criteria" as a standalone global item is S5.

**Proposed:** group the sidebar to match the flow and fold Criteria into a round-aware setup area.

```
SETUP
  ├── Structure & Scoring   ← Rounds/Segments, each with nested Criteria + Advancement  (absorbs "Criteria")
  ├── Divisions & Categories (optional)
  ├── Contestants
  └── Judges & Assignments
RUN
  ├── Live Control
  └── Judge Scoring (judge side)
RESULTS
  ├── Rankings
  └── Analytics / Reports
```

**Safety for the sidebar change:** the standalone **Criteria route is kept and 301-redirected** into the
new Structure & Scoring area (or kept as a "flat criteria" sub-view for no-round events). No route is
deleted; bookmarks and the existing `CompetitionCriteriaPage` keep working.

---

## 5. The one behavior-sensitive decision: the S2 fallback

Removing the silent all-criteria fallback is the **only** change that could affect existing events, so it
gets special handling. Two options — the plan **recommends A first**, with B as an optional later step.

**Option A — UX-only (recommended, zero backend risk).**
Keep the engine fallback exactly as-is. Prevent the surprise at the UI layer:
- When an event has rounds, each round shows an explicit **"No criteria yet — add criteria for this
  round"** empty state instead of quietly implying it inherits everything.
- The Review step **warns** if any round has no criteria.
- The round-first editor makes assigning per-round criteria the natural default.
Result: organizers stop hitting the fallback because the UI guides them — and **no live scoring behavior
changes at all**, so no existing event can break.

**Option B — Strict mode (optional, guarded).**
Add a nullable, additive flag `events.strict_round_criteria` (default `false`). New events set `true`;
when `true`, a round with no assigned criteria is treated as *unconfigured* (pre-flight blocks starting)
rather than inheriting all criteria. Existing events (`false`/NULL) keep the current fallback untouched.
Reversible down-migration. Only pursue B if A proves insufficient in real use.

---

## 6. Safe, phased implementation plan

**Guiding safety rules (every phase):**
- **No schema rebuild.** The model already supports round-nested criteria. At most one additive, nullable,
  reversible column (Option B), and only if chosen.
- **Backward compatible.** Existing events keep working; no route deleted (redirects only); the flat
  Criteria path stays for no-round events.
- **Engine untouched.** Phase-4 scoring correctness stays exactly as-is.
- **Guard behavior changes.** The only behavior-sensitive change (S2) is UX-only by default.
- **Regression tests + a two-browser smoke run after every phase.**

### Phase 0 — Safety net (no user-visible change)
- Characterization test locking today's fallback: *a round with no `round_criteria` → judge view returns
  ALL event criteria*. This makes any later fallback change detectable, never silent.
- **Risk: none.**

### Phase 1 — Round-first criteria editor (frontend, additive)
- In the Rounds area, add an inline **"Criteria for this round"** editor that creates a criterion **and**
  its `round_criteria` membership in one step (reuses existing `createCriteria` + `addCriteriaToRound`
  APIs). Shows the live **per-round 100%** total (already computed in the Workspace).
- The old flat Criteria page **remains** and is unchanged.
- **DB: none. Behavior: none** (purely a new, easier way to do what the APIs already allow).
- **Risk: low.**

### Phase 2 — Fix the S2 surprise (UX-only, Option A)
- Each round with no criteria shows the explicit empty-state + a Review-step warning.
- Weight labels clarified: "totals 100% **within this round**."
- **DB: none. Engine: none.** The fallback still exists; users simply stop relying on it unknowingly.
- **Risk: low** (display + validation copy only).

### Phase 3 — Sidebar / IA reorganization (frontend routing)
- Regroup the sidebar (§4); fold Criteria into "Structure & Scoring"; **keep old routes as redirects**.
- **DB: none.**
- **Risk: low-medium** (navigation change) → mitigated by redirects + keeping every page mountable.

### Phase 4 — Advancement & scoring discoverability (frontend)
- Inline helper text on each round's advancement controls (what Top N / Top % / Threshold / Manual do,
  and that "Finalize & advance" happens later in Live Control).
- A **Review & Validate** checklist screen before going live (contestants ≥1, judges ≥1, each round's
  criteria = 100%, advancement set where intended).
- **DB: none. Risk: low.**

### Phase 5 — Template alignment
- Update the Pageant/Dance/etc. templates to seed **rounds with nested criteria** so a template lands
  correctly in the new round-first flow. Simple/blank still seeds nothing.
- **DB: none** (templates are code). **Risk: low.**

### Phase 6 (OPTIONAL) — Strict mode (Option B), only if needed
- Additive nullable `strict_round_criteria` flag + guarded pre-flight. Existing events unaffected.
- **DB: one additive, reversible migration.** **Risk: medium** → guarded, opt-in, off by default.

---

## 7. What must NOT change (protect these)

- The **scoring engine** (`scoring-engine.js`) and its Phase-4 scope-aware math.
- The **schema**: `competition_criteria`, `competition_round_criteria`, `competition_rounds`,
  `competition_scores` — all stay. No column drops, no renames.
- The **live session / write-through / advancement** logic (Phases 3, 5, 6).
- The **flat criteria path** for no-round / simple competitions.
- Existing **routes** (redirect, never delete).

---

## 8. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Removing the fallback breaks events relying on it | High (only if Option B) | Default to **Option A (UX-only)**; Option B is opt-in via a flag, existing events untouched |
| Sidebar reorg confuses returning users / breaks bookmarks | Medium | Keep every page, redirect old routes, ship IA change in one clearly-communicated phase |
| Round-first editor double-writes criteria/membership | Low | Reuse existing idempotent APIs; the membership table has a unique constraint |
| Templates seed into the wrong shape | Low | Template validation test (weights total 100% per round) before shipping Phase 5 |
| Organizers with in-progress drafts mid-migration | Low | No schema change in Phases 0–5; drafts keep working |

---

## 9. Rollback

- Phases 0–5 are **frontend + copy only** → rollback = revert the frontend commit; nothing in the DB or
  engine to undo.
- Phase 6 (if pursued) ships behind a nullable flag with a reversible down-migration; disable by leaving
  the flag `false`.

---

## 10. Bottom line

The design smell is real and matches what every established judging platform avoids: **rounds first, then
criteria nested inside each round.** Because your schema already supports that exact model, the fix is a
**safe, mostly-frontend workflow + IA redesign** — reorder setup, nest the criteria editor inside rounds,
guide the organizer, and fold the standalone Criteria page into a round-aware "Structure & Scoring" area.
The scoring engine, live session, advancement, and database stay exactly as they are. Recommended path:
**Phases 0–5 (no dangerous changes at all)**, with strict-mode Phase 6 held in reserve only if needed.

**Sources:**
[Award Force — multi-round structure](https://awardforce.com/blog/articles/fairness-through-structure-planning-multi-round-judging-for-credible-award-outcomes/) ·
[Award Force — judging best practices](https://awardforce.com/blog/judging-best-practices-for-awards-programs/) ·
[ScoreJudge](https://scorejudge.com/judging-software/) ·
[Pageant Planet — scoresheet setup](https://help.pageantplanet.com/hc/en-us/articles/15510278299419-How-to-Set-Up-Scoresheet-Tabulation)
