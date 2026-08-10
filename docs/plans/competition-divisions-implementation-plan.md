# Competition Divisions — Complete Implementation Plan (Revised)

> **Status:** Revised — awaiting approval
> **Scope:** Add **optional competition divisions** as a first-class enhancement inside the existing Competition Module.
> **Do NOT:** create a second competition module, judge system, voter system, ranking system, or separate Male/Female events; do not redesign auth, admin, election, polling, or notifications except where shared participant/realtime security directly affects division access.

---

## 0. Hard Constraint — One Shared System, Not Parallel Male/Female Systems

This plan **must not** create separate, parallel systems per division. Divisions are a **grouping attribute** on the existing shared competition entities — **not** separate competitions, judges, or criteria.

### Explicitly Do NOT create separate systems

```
✗ Male Competition   +   Female Competition        — NO (one competition, two divisions)
✗ Male Judges        +   Female Judges             — NO (one judge pool, scoped by assignment)
✗ Male Criteria      +   Female Criteria           — NO (one criteria set, optionally division-tagged)
✗ Male Rounds        +   Female Rounds             — NO (one rounds structure, optionally division-scoped)
✗ Male Rankings      +   Female Rankings           — NO (one ranking engine, filtered by division)
```

### What "division" actually is

A division is a **single `division_id` column** stored on the existing shared tables. There is **one** `competition_contestants`, **one** `competition_criteria`, **one** `competition_rounds`, **one** `competition_scores`, **one** `competition_judges`, and **one** `competition_judge_assignments` table. A division simply _filters which rows a given judge/ranked view sees_.

| Entity      | One shared table                | Division role                                                              |
| ----------- | ------------------------------- | -------------------------------------------------------------------------- |
| Contestants | `competition_contestants`       | Each contestant may carry a `division_id` (nullable)                       |
| Criteria    | `competition_criteria`          | Each criterion may carry a `division_id` (nullable)                        |
| Rounds      | `competition_rounds`            | Each round may carry a `division_id` (nullable)                            |
| Categories  | `competition_categories`        | Each category may carry a `division_id` (nullable)                         |
| Scores      | `competition_scores`            | Each score row carries a `division_id` (denormalized)                      |
| Judges      | `competition_judges`            | **One** judge pool; access scoped via `competition_judge_assignments`      |
| Assignments | `competition_judge_assignments` | Adds a `scope='division'` option alongside existing `event/category/round` |
| Rankings    | `computeRankings` (one engine)  | Filtered by `division_id`; optional overall view                           |

### The existing architecture is the foundation

The current foundation (Event → Contestants → Criteria → Rounds → Categories → Judges → Assignments → Scores → Rankings) remains **completely intact**. Divisions are layered on top **without** introducing:

- A second competition module or separate Male/Female events.
- A second judge system or separate Male/Female judge pools.
- A second criteria/round/category system or duplicate structures.
- A second ranking system or duplicate ranking tables.

This is the single most important constraint of the plan. Every section below is written to satisfy it.

---

## 1. Role & Access Model (Clarification — Resolves Feedback #1 & #2)

This plan must **not** conflate authentication identity, event participation, judge assignment, or voting eligibility. The existing VOTRIX role model is:

```text
VOTRIX User (users.role = admin | organizer | voter)     ← authentication identity (global)
   │
   └── Event Participant (event_participants.participant_type)   ← event-scoped access
         ├── ELECTION_VOTER       → can cast votes in elections
         ├── COMPETITION_JUDGE    → can submit scores in competitions (the ONLY scoring role)
         └── POLLING_RESPONDENT   → can answer polls
              │
              └── Competition Judge (competition_judges + competition_judge_assignments)
                       │
                       └── Can score (scoping: event / category / round / [division])
```

Key facts verified in the codebase:

- `backend/src/services/participant.service.js` — `participant_type` is the event-scoped role; `resolveParticipantType()` maps `competition_scoring`/`pageant` events to `COMPETITION_JUDGE`.
- `backend/src/database/migrations/029_event_participant_roles.sql` — the unified `event_participants` table; `v_event_voters` is a **backward-compat view only**.
- `backend/src/routes/pageant-judge.routes.js` — judge scoring routes are guarded by `requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE)`.
- **There is no separate "public/event voter who votes in a competition" concept.** Competition scoring is done _only_ by `COMPETITION_JUDGE` participants. The `v_event_voters`/`event_voters.has_voted` surface is legacy for elections and is not used for competition scoring.

**Conclusion for this plan:** Division access is _judge assignment scope_, not a new voter concept. We extend `competition_judge_assignments` with a `division` scope. We do **not** introduce division-based voting for normal voters. If a future requirement adds public voting for Mr. & Ms. contests, that is a separate feature and out of scope here.

### Recommended Eligibility Model: Option C (explicit organizer-configured division access)

**Division access is decided by three explicit rules only. There is no "implicit all divisions via no assignment" behavior for division-enabled competitions.**

For **division-enabled** competitions (`divisions_enabled = TRUE`):

| Case                                      | Result                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **A — Explicit `event` assignment**       | Judge may score **ALL** divisions.                                                                        |
| **B — Explicit `division` assignment(s)** | Judge may score **ONLY** the assigned division(s).                                                        |
| **C — No assignment**                     | Judge has **NO division access** (safest). Organizer must explicitly grant Division or Event-wide access. |

For **division-disabled** competitions (`divisions_enabled = FALSE`): existing behavior is **unchanged** (event-wide scoring, no division gating).

**Legacy judges** (no first-class `competition_judges` row): treat as **event-wide for division-disabled** competitions only. For division-enabled competitions, do **not** auto-grant access to newly created divisions — require an explicit assignment (migrate/assign explicitly). This prevents a legacy judge from silently gaining access to divisions they were never scoped to.

---

## 2. Overall Architecture & Hierarchy

Divisions group **contestants** (Male, Female, Junior, Senior, Solo, Group). They are distinct from **categories** (scoring buckets) and **rounds** (temporal stages).

```text
              EVENT
                │
       ┌────────┴────────┐
       ↓                 ↓
     MALE             FEMALE
       │                 │
     ROUNDS            ROUNDS
       │                 │
    CRITERIA          CRITERIA
       │                 │
     SCORES            SCORES
```

- **Per-division ranking is the default.** An "overall" ranking only exists if the organizer explicitly enables it at the event level (see §6).
- Categories may be division-scoped or event-wide; rounds and criteria likewise.

### Optional Levels (not everything is required)

The hierarchy layers are **all optional** — organizers are never forced to configure every level:

```
Simple competition            Event → Criteria → Scores
Stage-based competition       Event → Round → Criteria → Scores
Male/Female + stages          Event → Division → Round → Criteria → Scores
Complex competition           Event → Division → Category → Round → Criteria → Scores
```

Only the levels the organizer actually configures are shown. Existing events (no division, no category, no round) keep working exactly as today.

### Backward Compatibility Rule

If an event has divisions **disabled** (or has zero divisions), all existing `NULL division_id` data behaves exactly as it does today. Existing competitions keep working unchanged.

---

## 3. Event-Level Division Configuration (Resolves "Division configurable at Event level")

Add an explicit flag so organizers can turn divisions on/off and understand the workflow.

### 3.1 `events` flag

Add column to `events`:

```sql
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS divisions_enabled BOOLEAN NOT NULL DEFAULT FALSE;
```

Behavior:

- `divisions_enabled = FALSE` (default): event is a single-division / no-division competition. All existing flows unchanged. Division UI is hidden.
- `divisions_enabled = TRUE`: organizer defines divisions; contestants, rounds, criteria become division-aware.

An event may also implicitly be considered "division-enabled" if it has one or more `competition_divisions` rows (guards against orphaned data). The flag is the authoritative switch.

> Organizer workflow when enabled:
> Create Event → Basic Info → Branding → Information Form → Workspace → **Divisions** → Contestants → Criteria/Rounds → Judges/Assignments → Live Control.

### 3.2 `scoring_config` addition

Add to the JSONB scoring config:

```js
{
  ...,
  "includeOverallRanking": false   // organizer explicitly opts into an overall ranking across divisions
}
```

Default `false` → per-division ranking only.

---

## 4. Database Plan (Migration `038_competition_divisions.sql`)

> Generate the SQL separately after approval. Run manually in the Supabase SQL Editor before deploying code.

### 4.1 New table `competition_divisions`

```sql
CREATE TABLE IF NOT EXISTS competition_divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,          -- deactivate instead of delete
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_competition_divisions_event_id ON competition_divisions(event_id);
CREATE INDEX idx_competition_divisions_event_order ON competition_divisions(event_id, display_order);
CREATE TRIGGER trg_competition_divisions_updated_at
  BEFORE UPDATE ON competition_divisions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 4.2 `division_id` columns — FK strategy (Resolves Feedback #4)

**Rule: a division that has associated data cannot be deleted — it is deactivated/archived instead.** Therefore:

- `competition_contestants.division_id` → `ON DELETE RESTRICT` (a division with contestants cannot be deleted).
- `competition_categories.division_id` → `ON DELETE RESTRICT`.
- `competition_rounds.division_id` → `ON DELETE RESTRICT`.
- `competition_criteria.division_id` → `ON DELETE RESTRICT`.
- `competition_scores.division_id` → `ON DELETE RESTRICT` (denormalized but historical; prevent orphaned ranking data).
- `competition_sessions.current_division_id` → `ON DELETE RESTRICT`.
- `competition_session_judge_scores.division_id` → `ON DELETE RESTRICT`.

```sql
ALTER TABLE competition_contestants
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES competition_divisions(id) ON DELETE RESTRICT;
-- ... analogous for categories, rounds, criteria, scores, sessions, session_judge_scores
```

All columns are nullable and `IF NOT EXISTS` safe. Existing rows keep `NULL` (event-wide behavior).

### 4.3 Delete-vs-Deactivate policy

- `DELETE /divisions/:id` returns **409** when any of the above tables reference the division (check counts first).
- Organizer instead uses **PATCH `{ isActive: false }`** to deactivate/archive. Deactivated divisions are hidden from judge-facing selectors and live control but remain for audit/ranking.
- Hard delete is only allowed for a division with **zero** associated data.

### 4.4 Extend assignment scope enum

```sql
ALTER TYPE competition_assignment_scope ADD VALUE IF NOT EXISTS 'division';
```

### 4.5 No new submission table (Resolves Feedback #3)

**Decision: Do NOT create `competition_division_submissions`.**

Rationale: per-division completion is already derivable from the existing scoring tables, which are the single source of truth:

- **Static path:** `competition_scores` — a judge has completed division D iff there is a score row for every `(contestant × criterion)` belonging to D where `competition_scores.division_id = D`. The existing unique constraint `(judge_id, contestant_id, criteria_id, round_id)` already prevents duplicate submissions; we widen/normalize it to also carry `division_id`, so a judge can submit Male and Female separately without a second state table.
- **Live session path:** `competition_session_judge_scores` — completion per `(session, round, contestant, judge)` is already tracked; adding `division_id` lets us derive per-division completion.

Derived helper (in service layer, no new table):

```
isDivisionComplete(judgeId, divisionId) =
  distinct(contestant × criterion for division) == distinct(scored cells for judge in division)
```

The event-level `event_participants.has_scored` flag is preserved for the **no-division** path (unchanged). For division-enabled events, `hasScored` at the event level = all **required allowed** divisions are complete (derived), while each division's own completion is derived from its scores.

---

## 5. Backend Plan

### 5.1 Constants (`backend/src/utils/constants.js`)

- Add `DIVISION` to `ASSIGNMENT_SCOPES`.
- Add `COMPETITION_DIVISIONS` to `DB_TABLES`.
- Add `includeOverallRanking` default handling to scoring-config merge.

### 5.2 Validators (`backend/src/validators/competition.validator.js`)

- `validateDivision(body)` — name required; optional description/displayOrder/isActive.
- `validateDivisionsToggle(body)` — `divisionsEnabled` boolean.
- Extend `validateContestant`, `validateCategory`, `validateRound`, `validateCriteria` to accept optional `divisionId`.
- Extend `validateAssignment` to accept `scope: 'division'`.
- Extend `validateJudgeScores` to accept optional `divisionId`.
- Extend `validateScoringConfig` to accept `includeOverallRanking`.

### 5.3 Division service (`backend/src/services/competition-division.service.js`)

Under existing competition event routes:

```text
GET    /api/organizer/competition/events/:eventId/divisions
POST   /api/organizer/competition/events/:eventId/divisions
PATCH  /api/organizer/competition/events/:eventId/divisions/:divisionId
DELETE /api/organizer/competition/events/:eventId/divisions/:divisionId
```

- `listDivisions`, `createDivision`, `updateDivision`, `deleteDivision` with `assertCompetitionEvent` ownership checks.
- `deleteDivision` enforces the delete-vs-deactivate policy (§4.3).
- `setDivisionsEnabled(eventId, organizerId, enabled)` — toggles `events.divisions_enabled`.

### 5.4 Contestants / Rounds / Categories / Criteria integration

- `createContestant`, `updateContestant` accept/return `divisionId`; validate division belongs to event.
- `listContestants` returns `divisionId`; supports `?divisionId=` filter.
- `listCategories`, `listRounds`, `listCriteria` return `divisionId`; support optional filtering.
- `createRound`/`createCategory` validate a supplied `divisionId`.
- `getCompetitionFoundation` returns `divisions`, `divisionsEnabled`, and `divisionId` on contestants/categories/rounds/criteria.

### 5.5 Judge eligibility and scoring (`backend/src/services/pageant.service.js`)

- **Fix (pre-requisite):** `registerJudge` and `inviteJudge` should also create/sync `competition_judges` rows (upsert on `event_id,user_id`) so the assignment UI and the visible Judges page stay consistent.
- Add `resolveAllowedDivisions(eventId, judgeId)`:
  - First-class judge with assignments → divisions from `scope='division'` assignments; **all** divisions if there is an `event` assignment or no assignments.
  - Legacy judge (no first-class row) → all divisions (event-wide).
- Extend `canJudgeScore` to accept `divisionId` and check `scope === 'division' && a.scope_id === divisionId`.
- `getJudgeScoringSheet(eventId, judgeId, { divisionId })`:
  - Enforce judge is allowed in the requested division (else `403`).
  - Return only contestants/criteria/rounds/categories belonging to that division (or event-wide when no division).
- `submitJudgeScores(eventId, judgeId, scores, { divisionId })`:
  - Validate `divisionId` server-side (never trust client only).
  - Reject disallowed division with `403`.
  - Store `division_id` on each score row.
  - Derive per-division completion from `competition_scores` (§4.5). Preserve global `has_scored` behavior on the **no-division path**.

### 5.6 Live session scoring (`backend/src/services/competition-session.service.js`)

- Add `setActiveDivision(eventId, organizerId, divisionId)`.
- `startSession`/`setActiveRound`/`nextContestant` respect the active division when building `contestant_order` (filtered to division; fall back to event-wide when disabled).
- `submitJudgeSessionScore` and `getJudgeSessionView` enforce the judge's allowed division and store `division_id` on `competition_session_judge_scores`.

### 5.7 Rankings/reports (`backend/src/services/pageant.service.js`)

- `getLiveRankings(eventId, organizerId, { divisionId })`:
  - **Default: per-division ranking.** Filter scores by `division_id` when provided.
  - **Overall ranking only when configured:** if `scoring_config.includeOverallRanking === true` and no division filter, return an overall view. Otherwise overall is not returned.
- `getCompetitionAnalytics` respects division filtering.
- Report service accepts optional `divisionId`.

### 5.8 Live Control endpoint

- `POST /session/set-division` → `setActiveDivision` in `competition-session.controller.js`.

### 5.9 Data Integrity & Cross-Entity Consistency (server-side enforcement)

Do **not** blindly add `division_id` everywhere. The backend must validate that every division relationship is consistent within the same competition context. The backend rejects mismatches at write time.

**Contestant**

```
contestant.event_id      → must match the event
contestant.division_id   → division must belong to the same event
```

**Round**

```
round.event_id           → must match the event
round.division_id        → division must belong to the same event
round.category_id        → if set, category must belong to the same event AND (if division-scoped) the same division
```

**Criteria**

```
criteria.event_id        → must match the event
criteria.division_id     → if set, must agree with the round/division relationship it is used in
```

**Score**

```
score.event_id
score.division_id
score.contestant_id
score.round_id
score.criteria_id
→ ALL must belong to the same competition context (event, division, round, contestant, criteria all consistent)
```

Concrete rules to enforce in services/validators:

- **Division belongs to the event** — every `division_id` supplied must resolve to a `competition_divisions` row with the same `event_id`.
- **Round ↔ Category ↔ Division agreement** — when a round is created/updated with both `categoryId` and `divisionId`, the category must belong to the same division (or be event-wide). Reject a round with `division_id = Male` whose category is `division_id = Female`.
- **Score ↔ Contestant/Criterion/Division agreement** — before inserting a score, verify the contestant and criterion belong to the same division (or are event-wide) as the score's `division_id`. Reject mismatched cells.
- **Round membership** — `competition_round_contestants` and `competition_round_criteria` must not link across divisions (a Male round cannot contain a Female contestant/criteria).

These checks live in the service/validator layer (Supabase service-role has no active RLS). Optional `CHECK` constraints / triggers can be added later as hardening, mirroring the existing `fn_validate_participant_event_type` pattern.

---

## 6. Frontend Plan

### 6.1 Service (`frontend/src/services/pageant.service.js`)

Add:

```js
listDivisions(eventId); // GET  .../divisions
createDivision(eventId, payload); // POST
updateDivision(eventId, divisionId, payload); // PATCH
deleteDivision(eventId, divisionId); // DELETE
setDivisionsEnabled(eventId, enabled); // PATCH .../divisions-enabled
```

Update contestant/category/round/criteria methods to pass `divisionId` where applicable.

### 6.2 Organizer UX — `CompetitionWorkspacePage.jsx`

- Add a **Divisions** tab (only shown when `divisionsEnabled`).
- `DivisionsTab`: create/edit/reorder/deactivate divisions; a **Enable divisions** toggle in event settings.
- **Structure tab**: category form gains optional Division selector.
- **Rounds tab**: round form gains optional Division selector.
- **Judge assignments tab**: scope dropdown gains `Division`; show `Division: <name>`.
- **Live Control** (`CompetitionLiveControlPage.jsx`): active Division selector, then Round, then Contestant ordering filtered by division.
- **Divisions disabled**: all division UI hidden; exactly current behavior.

### 6.3 Contestants / Criteria pages

- `CompetitionContestantsPage.jsx`: division column + filter; create/edit form includes division select (when divisions enabled).
- `CompetitionCriteriaPage.jsx`: optional division select.

### 6.4 Rankings/Reports

- `CompetitionRankingsPage.jsx`: **per-division tabs by default**; overall tab only when `includeOverallRanking` is enabled.
- `CompetitionReportPage.jsx`: division filter.

### 6.5 Judge UX (COMPETITION_JUDGE participant)

- Event card remains event-based (`VoterEventCard.jsx`).
- `JudgeScoringPage.jsx` / `CompetitionScoringForm.jsx`:
  - Divisions **disabled** → current scoring flow unchanged.
  - One allowed division → direct scoring sheet.
  - Multiple allowed divisions → division selector, then scoring sheet.
  - Forbidden divisions are not listed or returned by the API.
- Per-division completion derived from scores; overall `hasScored` true only after all **required allowed** divisions are submitted.

---

## 7. Scenario Behavior

| Scenario                                   | Behavior                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Divisions disabled                         | Existing competitions keep working unchanged; no division UI.                                                                                                                  |
| Male-only judge                            | Dashboard shows event; scoring API returns only Male data; Female contestants/rounds/criteria not returned; manual Female `divisionId` → `403`.                                |
| Female-only judge                          | Same, reversed.                                                                                                                                                                |
| Both divisions                             | Opens to division choices; each division tracks completion separately (derived from scores); overall `hasScored` true only after all required allowed divisions submitted.     |
| Divisions enabled, judge has no assignment | **No division access** (safest). Organizer must explicitly assign Division or Event-wide access.                                                                               |
| Assignment changed after scoring           | Access changes immediately; existing locked scores remain for audit/ranking unless an explicit future invalidation action is built. Do **not** silently delete/rewrite scores. |
| Delete a division with data                | **Blocked (409).** Organizer must deactivate (`isActive:false`) instead.                                                                                                       |
| Overall ranking                            | Only shown when `scoring_config.includeOverallRanking` is true; otherwise per-division rankings only.                                                                          |

---

## 8. Security Notes

- Project uses **Supabase service-role** with app-layer authorization, not active RLS enforcement. Enforce division security in **backend services first**.
- RLS policies can be added later as hardening but will not protect service-role backend queries by themselves.
- **Harden websocket room subscription** before division-specific realtime (current room subscription is too permissive). Add authorized event/division rooms or emit minimal invalidation events + filtered refetch.

---

## 9. Phased Implementation Steps

1. **Database design & migration draft** — `038_competition_divisions.sql` + down migration: `events.divisions_enabled`, `competition_divisions` table, `division_id` columns (RESTRICT FKs), assignment enum value, indexes. **No submission table.**
2. **Backend division service/routes/validators** — CRUD, ownership checks, delete-vs-deactivate policy, `divisionsEnabled` toggle, `scope='division'`.
3. **Contestants/rounds/criteria/categories integration** — division-aware validation and filtering.
4. **Judge eligibility & scoring** — `resolveAllowedDivisions`, division-scoped `canJudgeScore`, scoring-sheet filtering, derived per-division completion, `403` enforcement; judge-row sync fix.
5. **Live Control** — `setActiveDivision`, filtered contestant order, division-aware judge progress.
6. **Rankings/reports** — per-division ranking default; overall only when configured.
7. **Frontend organizer UX** — Divisions tab, enable toggle, selectors, assignments, live control.
8. **Frontend judge UX** — division selector, filtered scoring sheet, derived per-division completion.
9. **Realtime hardening** — authorized event/division rooms or minimal invalidation events + filtered refetch.
10. **Tests & migration verification** — unit + API tests; verify existing (non-division) competitions still load.

---

## 10. Manual Supabase Deployment Plan

> Generate SQL separately after approval. Steps:

1. Open Supabase SQL Editor.
2. Run the migration (`038_competition_divisions.sql`).
3. Verify new table, columns, indexes, enum value, `events.divisions_enabled`.
4. Verify existing competitions still load (divisions disabled → unchanged).
5. Create Male/Female divisions in a test competition.
6. Verify judge access and per-division rankings.
7. Verify deactivation (not deletion) of a division with data.
8. Only then deploy frontend/backend changes.

---

## 11. Testing Plan

- **Backend unit tests** (`backend/__tests__/services/`):
  - Division CRUD + ownership checks + delete-vs-deactivate.
  - `resolveAllowedDivisions` (event-wide / division / none).
  - `canJudgeScore` with `division` scope.
  - Derived per-division completion from `competition_scores`.
  - `403` on forbidden-division tampering.
  - Backward compatibility: divisions-disabled flows unchanged.
- **API tests** (`backend/__tests__/api/`):
  - Division routes + `divisionsEnabled` toggle.
  - Contestant/category/round/criteria with `divisionId`.
  - Assignment `scope='division'`.
  - Scoring-sheet filtering.
  - Per-division rankings; overall only when configured.
- **Frontend**: manual QA of Organizer Divisions tab, judge division selector, live-control division ordering, rankings division tabs.

---

## 12. Files to Be Modified/Created (Summary)

**New**

- `backend/src/database/migrations/038_competition_divisions.sql`
- `backend/src/database/migrations/038_down_competition_divisions.sql`
- `backend/src/services/competition-division.service.js`
- `backend/__tests__/services/competition-division.service.test.js`
- `backend/__tests__/api/competition-division.api.test.js`

**Modified (backend)**

- `backend/src/utils/constants.js` — scopes + DB tables + scoring-config default.
- `backend/src/validators/competition.validator.js` — division/divisionsEnabled validators + extend existing.
- `backend/src/routes/competition-organizer.routes.js` — division routes + `set-division` + `divisions-enabled`.
- `backend/src/controllers/competition.controller.js` — division handlers.
- `backend/src/controllers/competition-session.controller.js` — `setActiveDivision`.
- `backend/src/services/competition.service.js` — division-aware foundation / judges / assignments.
- `backend/src/services/pageant.service.js` — judge eligibility, scoring sheet, submit, rankings; judge-row sync fix.
- `backend/src/services/competition-session.service.js` — live control + division-aware scoring.

**Modified (frontend)**

- `frontend/src/services/pageant.service.js` — division + divisionId methods.
- `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx` — Divisions tab, enable toggle, selectors, assignment scope.
- `frontend/src/pages/organizer/competition/CompetitionContestantsPage.jsx` — division column/filter/form.
- `frontend/src/pages/organizer/competition/CompetitionCriteriaPage.jsx` — division select.
- `frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx` — active division.
- `frontend/src/pages/organizer/competition/CompetitionRankingsPage.jsx` — per-division tabs (+ optional overall).
- `frontend/src/pages/organizer/reports/CompetitionReportPage.jsx` — division filter.
- `frontend/src/pages/voter/JudgeScoringPage.jsx` — division selector.
- `frontend/src/components/voter/competition/CompetitionScoringForm.jsx` — division-aware completion.

---

## 13. Out of Scope (Do Not Change)

- No second competition module, judge system, voter system, ranking system, or separate Male/Female events.
- No public "voter votes in competition" feature (does not exist today; if required later it is a separate feature).
- No redesign of auth, admin, election, polling, or notifications, except where shared participant/realtime security directly affects division access.
