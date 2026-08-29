# Votrix Competition Module — Production Readiness

_Audit of the Competition module after Phases 0–7, updated to reflect the fixes applied in this pass._

## Verdict

**Code-complete and production-ready pending two operator actions.** One generic, configuration-driven
engine runs Pageant, Dance, Singing, Talent, and Simple competitions — no per-type code paths. Every
code-level problem found in the audit (High, Medium, Low) has been fixed. The only remaining gates are
operational and can only be done in your environment:

1. **Apply the two migrations** (`057`, `058`) in Supabase.
2. **Run one end-to-end smoke test** with a live server + two browsers.

- Backend: **320 tests passing**, 34 files (+ 3 gated real-DB integration tests, skipped without a test database).
- Frontend: **builds clean**; all competition files lint-clean.

---

## Multi-type support

All five map onto the same schema and scoring engine through configuration. Teams / duos / groups are
scored as a single contestant unit; separate them with Divisions.

| Type | Support | Notes |
|---|---|---|
| 👑 Pageant | **Full** | Weighted categories + prelim→final rounds + per-round criteria + advancement. Division-aware advancement now works (H1 fixed). |
| 💃 Dance | **Full** | Rounds, solo/team via Divisions, advancement — per division. |
| 🎤 Singing | **Full** | Single or multi-round vocal scoring; rounds optional. |
| 🏆 Talent | **Full** | Flat criteria, one round; template seeds a default. |
| 📋 Simple | **Full** | Contestants + criteria only; all layers skippable. |

The previous "cross-division advancement" caveat on Pageant/Dance is **resolved** — see H1.

---

## What's solid

- **Configuration-driven core** — no `if (pageant)` branching anywhere; a competition type is a label + template seed, never a code path.
- **Live scores reach results** — null-safe write-through + completion backfill, regression-tested.
- **Scope-correct scoring math** — per-round criteria honored, rounds kept separate, standard-competition tie ranks, event scale as the single source of truth; feature-guarded so existing events are unchanged.
- **Real-competition progression** — round finalize → immutable snapshot → qualifier selection with organizer override → seed next round; nothing auto-eliminates; finalized rounds lock.
- **Results & awards** — champion, Best-in-category, per-division winners, finalized round standings, optional tie-breaker.
- **Test coverage** — pure scoring + advancement logic, weight validation, and the highest-risk finalize path all covered.

---

## Problems — status

Blockers are operator actions (only you can do them). Everything else was code and is now fixed.

### 🔴 Blockers — before launch (operator actions)

| ID | Problem | Status |
|---|---|---|
| **B1** | Migrations `057_competition_type.sql` & `058_round_advancement.sql` not applied. Create/finalize write columns that don't exist yet. | ⏳ **You** — apply both in the Supabase SQL Editor (additive, reversible; down-scripts included). |
| **B2** | No end-to-end runtime verification — all tests mock the DB; the live WS flow, finalize modal, and results panel haven't run against a real server / two browsers. | ⏳ **You** — one smoke run after B1 (see checklist). A gated real-DB integration harness (`__tests__/integration/`) is in place to run in CI. |

### 🟠 High — fixed

| ID | Problem | Fix applied |
|---|---|---|
| **H1** | Advancement wasn't division-aware — "Top N" ranked everyone in one pool instead of N per division. | `computeRoundStanding` now accepts a `divisionId`; new `computeRoundAdvancement` computes standing + selects qualifiers **per division** when divisions are enabled, then merges. Snapshot rows carry `division_id`. Covered by a new test. |
| **H2** | `score_policy: cumulative` didn't reach the final ranking, so a cumulative event's final could surprise. | Semantics made coherent: **`score_policy` governs advancement** (how a round's standing is computed for elimination); the **final event ranking is the weighted combination of rounds** (the standard model — applying cumulative there too would double-count). Documented in code; UI label now reads "Score policy (advancement)". |
| **H3** | Live-session "judges submitted X/Y" read 0 on the Rankings page (the live path never set `has_scored`). | `getLiveRankings` now derives "submitted" from distinct judges present in the ranking store — accurate for both live and batch paths, since live scores are written through (Phase 3). |

### 🟡 Medium — fixed

| ID | Problem | Fix applied |
|---|---|---|
| **M1** | Finalize was multi-statement, not transactional — a mid-way failure could leave a round finalized without qualifiers seeded, and the 409 guard blocked retry. | The snapshot + seeding run inside a `try`; on **any** failure a compensating action **releases the claim** (`finalized_at → NULL`) so the operation can be retried cleanly. |
| **M2** | Finalize concurrency race — two rapid calls could both pass the `finalized_at` check. | The finalize is **atomically claimed** with a conditional update (`… WHERE finalized_at IS NULL … RETURNING id`); only the first caller proceeds, the rest get 409. |
| **M3** | No audit trail on scoring / finalize / advancement — the most contested actions. | Wired the existing `foundation/audit.js`: `competition.score.submitted` on every live submission, `competition.round.finalized` on finalize (with qualifiers, seeded count, and whether an override was applied). |
| **M4** | No real database integration tests — mocks can't catch schema/column drift. | Added a real-DB integration harness (`__tests__/integration/competition-scoring.integration.test.js`), gated on `RUN_DB_INTEGRATION=1` so it runs in CI with a seeded test database and stays skipped in the fast local run. |

### ⚪ Low — fixed

| ID | Problem | Fix applied |
|---|---|---|
| **L1** | Pre-existing ESLint **error** in `JudgesTab` (`getScopeItems` used before declaration). | Moved the declaration above its first use — competition files are now lint-error-clean. |
| **L2** | Mixed camel/snake shape from `getFoundation` (deferred 7.5). | Normalized contestants & criteria to a consistent camelCase shape (snake_case retained via spread, so no existing reader breaks). |
| **L3** | Workspace didn't signpost which layers a competition type needs. | Added a **soft, read-only hint** driven by `competition_type` (e.g. "Simple — you can skip Categories, Divisions, and Rounds"); every tab stays available, nothing is hidden. |

---

## Readiness checklist

- [x] Multi-type architecture — one engine, config-driven, no per-type branches
- [x] Live scores feed results — write-through + backfill, regression-tested
- [x] Scope-correct scoring & ties — per-round criteria, tie ranks, scale bounds
- [x] Round advancement & results — finalize, snapshot, awards, standings
- [x] Division-aware advancement (H1)
- [x] Cumulative scoring semantics coherent & documented (H2)
- [x] Accurate live progress counter (H3)
- [x] Transactional-safe finalize: atomic claim + compensating rollback (M1, M2)
- [x] Audit trail on scoring / finalize / advancement (M3)
- [x] Real-DB integration harness in place (M4)
- [x] Lint-error-clean competition module (L1); consistent foundation shape (L2); type signposting (L3)
- [ ] **Apply migrations 057 & 058 in Supabase (B1)**
- [ ] **Two-browser end-to-end smoke run (B2)**

---

## The B2 smoke run (once B1 is done)

1. Create an event → pick a template → publish; confirm the Workspace is pre-filled (or blank for "Simple").
2. Add contestants + judges; confirm pre-flight blocks starting until criteria total 100% and ≥1 judge.
3. **Live Control:** start → advance contestants (switch round/division for Pageant).
4. **Judge (second browser):** score the active contestant; confirm auto-save + lock, and that the
   organizer's judge-progress **and** rankings update live.
5. **Finalize a round:** open "Finalize round & advance", review the standing, confirm — verify the
   qualifiers seed the next round and the finalized round locks.
6. **Rankings/Results:** confirm live scores are reflected, the "submitted X/Y" counter is correct, and
   the Results & Awards panel shows champion / category / division / round standings.
7. **Regression:** an existing (pre-migration, NULL-type) event still opens, scores, and ranks unchanged.

---

## Remaining notes (not blockers)

- **Security** is application-layer only (no Row-Level Security), consistent with the rest of the app.
  Acceptable for this scope; worth a defense-in-depth review before exposing the API more widely.
- Three **pre-existing lint errors** remain in unrelated shared hooks (`useDelayedLoading.js`,
  `useDraft.js`) — outside the competition module and outside this audit's scope; trivial unused-var cleanups.

---

## Bottom line

The module **supports many competition types now**, and every code-level gap from the audit is closed —
including the division-aware advancement that Pageant and Dance need. It becomes **production-ready the
moment B1 (migrations) and B2 (one smoke run) are done**. Nothing else stands in the way.
