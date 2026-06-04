# Phase 5 — Scoring Configuration Engine

The scoring engine is **dynamic**: every rule lives in the database
(`events.scoring_config` JSONB, plus `competition_categories.weight`,
`competition_rounds.weight`, `competition_criteria.percentage`) — there
are no hardcoded business rules in the application code.

## Score types

| Value | Min | Max | Notes |
|-------|-----|-----|-------|
| `range_1_10` | 1 | 10 | Integer-friendly pageant |
| `range_1_100` | 1 | 100 | Default; matches the legacy flow |
| `decimal` | 0 | 10 | Allows fractional scores |
| `custom_range` | `customMin` | `customMax` | Organizer picks bounds |

`customMin` and `customMax` must be numbers and `customMax >= customMin`.
The default is `range_1_100`.

## Calculation methods

| Value | Behaviour |
|-------|-----------|
| `average` | Mean of all judge scores for a (contestant, criterion) cell |
| `weighted_average` | Default; per-criterion averages combined with `criteria.percentage` |
| `sum` | Sum of judge scores (no weighting) |
| `highest_score` | Max of judge scores |
| `lowest_removal` | Average after dropping `dropLowest` and `dropHighest` judge scores |

`dropLowest` and `dropHighest` are non-negative integers. The submission
validator and rankings engine both consult the configured method.

## Weight validation

| Layer | Rule |
|-------|------|
| Categories | When scoring is opened: Σ `competition_categories.weight` = 100 |
| Rounds | When scoring is opened: Σ `competition_rounds.weight` = 100 |
| Criteria | When scoring is opened: Σ `competition_criteria.percentage` = 100 |

`POST /api/organizer/competition/events/:id/scoring-config` persists the
config. `PATCH /events/:id/scoring` runs the weight validator before
flipping `events.scoring_enabled` to true.

## Engine

`backend/src/modules/scoring-engine.js` is a pure-function module:

- `mergeScoringConfig(raw)` — apply defaults, coerce numeric fields
- `resolveScoreBounds(config)` — derive `{ min, max }` from `scoreType`
- `isScoreInBounds(value, config)` — boolean check used at submission
- `reduceScores(scores, config)` — apply calculation method to a list
- `computeRankings({ scores, contestants, criteria, rounds, categories, config })`
  — produce final ranking with `rounds` × `categories` layers

The rankings endpoint (`GET /events/:id/rankings`) calls `computeRankings`
and returns:

```json
{
  "rankings": [
    {
      "contestantId": "...",
      "rank": 1,
      "finalScore": 85.0,
      "weightedScore": 85.0,
      "criteriaBreakdown": [{ "criteriaId": "...", "average": 90, "percentage": 50, "judgeCount": 3 }],
      "perRound": [{ "roundId": null, "roundName": "Overall", "weight": 100, "value": 85 }],
      "perCategory": []
    }
  ],
  "criteriaTotalPercentage": 100,
  "roundWeightTotal": 0,
  "categoryWeightTotal": 0,
  "scoringConfig": { ... },
  "judges": { "total": 5, "submitted": 3 }
}
```

## UI

The Organizer → Competition workspace (`/organizer/competition/events/:id/workspace`)
has a **Scoring config** tab that exposes all of the above. There are no
hardcoded UI defaults — the form initializes from the current
`scoringConfig` and saves back through the API.

## Tests

`__tests__/modules/scoring-engine.test.js` covers:

- Defaults, numeric coercion, custom-range fallbacks
- Each calculation method (average, sum, highest, lowest-removal)
- Empty and non-numeric input handling
- Ranking computation with and without categories / rounds
- Non-weighted methods bypassing criterion weights
- Decimal-place rounding
