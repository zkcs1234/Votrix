# Competition Minor-Criteria Plan

Adds a **minor-criteria** level beneath `competition_criteria`. Judges score the
minor criteria (not the criteria directly), and the score type (1-100, 1-10, …)
moves down to each minor criterion.

## Decisions (locked)

1. **Roll-up:** a criterion's score = **average** of its minor criteria (equal
   weight — minor criteria carry no percentage). Each minor is normalized to a
   percentage of its own scale first, so scales can be mixed.
2. **Score type:** lives **per minor criterion** (`score_type` + optional
   `custom_min`/`custom_max` on each minor row). No longer read from
   `events.scoring_config.scoreType` for scoring inputs.
3. **Existing data:** auto-migrate — each existing `competition_criteria` row
   gets **one default minor criterion** inheriting the event's current score
   type, and existing `competition_scores` rows re-point to it. No data lost.

## Structure

```
Round (weight %, rounds total 100)
└─ Criteria (percentage %, total 100 within a round)   ← keeps its weight
   └─ Minor criteria (NO percentage, equal weight)      ← NEW; judges score THESE
      └─ each minor criterion has its own score type (1-100, 1-10, decimal, custom)
```

Live control gains one thing (see below); it still shows Rounds + Contestants.

## Live control: per-round active-criteria gate

During a live session the organizer controls **which criteria of the active
round are currently open for scoring**. Decisions (locked):

- **Live toggle**, stored on the session (`competition_sessions.active_criteria_ids UUID[]`).
  It resets each session; when a round is opened/switched it initializes to
  **all** of that round's criteria, and the organizer can close individual ones.
- **Hidden until opened:** the judge's sheet shows only criteria whose id is in
  `active_criteria_ids`. A closed criterion (and its minor criteria) simply
  isn't shown, and score submissions for non-active criteria are rejected.

The gate is at the **criteria** level — opening a criterion exposes all of its
minor criteria for scoring. Minor criteria are never gated individually.

## Scoring math

Only the criterion value changes; everything above it is unchanged.

```
1. minorAvg(c, m)       = average over judges of the raw score on minor m
2. minorPct(c, m)       = minorAvg(c, m) / max_m × 100        (normalize by the minor's own max)
3. criterionScore(c, k) = average of minorPct over k's minor criteria   (equal weight)
4. roundValue(c)        = Σ_k criterionScore(c,k) × (percentage_k / Σ percentage)   (UNCHANGED)
5. finalScore(c)        = Σ_rounds roundValue × (round.weight / 100)                (UNCHANGED)
```

### Worked example
Round "Finals" (weight 100), criterion "Talent" (percentage 60), minors
*Technique* (1-100) and *Stage Presence* (1-10):
- Judge: Technique 80 → 80/100 = 80%; Stage Presence 7 → 7/10 = 70%.
- criterionScore(Talent) = avg(80, 70) = **75**.
- Feeds the round exactly like a criterion score does today: `75 × 60/100`.

### Note on display scale
Normalizing by `/max` keeps **1-100 events pixel-identical**. For 1-10 / decimal
events the final-score **display scale** becomes 0–100 (e.g. an old average of 8
shows as 80), but **rankings are unchanged** (monotonic transform).

## Implementation

### Phase 1 — Database
`071_minor_criteria.sql` + down (✅ reviewable SQL):
1. New `competition_minor_criteria` table (no `percentage` column, by design).
2. `competition_scores.minor_criteria_id` column; widen unique to
   `(judge_id, contestant_id, criteria_id, minor_criteria_id, round_id)`.
3. Backfill one default minor per criterion + re-point existing scores.

`072_session_active_criteria.sql` + down:
4. `competition_sessions.active_criteria_ids UUID[]` (default `{}`) — the live
   set of open criteria for the current round.

### Phase 2 — Backend
- `constants.js`: `COMPETITION_MINOR_CRITERIA` table name.
- `scoring-engine.js`: minor→criterion averaging with per-minor bounds; falls
  back to legacy per-criterion scoring for any criterion that has no minors
  (dual-read for the rollout window).
- `competition.service.js`: minor-criteria CRUD; nest minors under criteria in
  `getCompetitionFoundation`.
- `competition-session.service.js`: live scoreMap keyed by `minorCriteriaId`;
  bridge writes `minor_criteria_id`. Initialize `active_criteria_ids` to all of
  the round's criteria on round-open; add an endpoint to toggle them; filter the
  active-round criteria list to `active_criteria_ids` in the judge sheet
  ([competition-session.service.js:156](../backend/src/services/competition-session.service.js)); reject scores for non-active criteria.
- `competition.validator.js`: validate minor payloads + per-minor score bounds;
  validate the active-criteria toggle payload (ids belong to the current round).

### Phase 3 — Frontend
- `CompetitionCriteriaPage.jsx`: nested minor-criteria editor; score-type picker
  moves onto the minor criterion.
- `JudgeScoringPage.jsx` / `CompetitionScoringForm.jsx`: sheet groups
  Round → Criteria → Minor criteria; one input per minor (its own bounds);
  submit keyed by `minorCriteriaId`. Only shows criteria the session has open.
- `CompetitionLiveControlPage.jsx`: in the active round's panel, per-criterion
  open/close toggles that drive `active_criteria_ids`.

### Phase 4 — Rollout (migrations are applied manually in Supabase)
Deploy dual-read backend+frontend → run `071` then `072` in Supabase → verify → done.

## Additional adaptations (round-optional + workspace footer)

### Adapt everything when only criteria + minor criteria are configured (no rounds)
- **Scoring** already totals criteria only when no rounds exist — the engine
  collapses to a single implicit round (weight 100), so `finalScore` is the
  weighted criteria total. Verified by the characterization tests.
- **Live control** works without rounds: `getActiveSessionDetailed` returns a
  `criteriaControl` list (round criteria when a round is open, else event-wide),
  each with an `active` flag + minors. The page shows the criteria open/close
  toggles and a "Criteria scoring" stage label; the round switcher only appears
  when rounds exist. `setActiveCriteria` accepts event-wide criteria (no round
  required).
- **Judge scoring** already receives event-wide criteria (+minors) when no round
  is set; the header shows "Scoring" instead of a round name.
- **Rankings/results** already adapt: the division selector shows when divisions
  are enabled, division winners appear in Results & Awards, and finalized round
  standings only render when rounds exist.

### Competition Workspace stage footer (design parity with the event form)
- The Structure & Scoring workspace gets a sticky `StageFooter`-style footer that
  steps through its tabs: Information Form → **Rounds → Divisions → Scoring
  config** → Continue to Contestants.
- The event form's Information Form step now continues to **Structure & Scoring**
  (the workspace) rather than Contestants.

## Rollback
Run `071_down_minor_criteria.sql` (restores the prior unique constraint, drops
`minor_criteria_id`, drops the table). Deploy the pre-feature code first, then
roll back the DB — same order discipline as always.
