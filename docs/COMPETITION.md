# Phase 4 — Competition Scoring Foundation

Run migration `migrations/015_competition_scoring_foundation.sql` (down: `016_*`).

This phase turns the pageant-style competition scoring into a **dynamic scoring
engine** that supports unlimited **Categories**, **Rounds**, and **Criteria**
without code changes.

## Core modules

| Module | Purpose |
|--------|---------|
| Contestants | Existing `competition_contestants`; unchanged |
| Categories  | New `competition_categories` — top-level grouping |
| Rounds      | New `competition_rounds` — stages inside an event or a category |
| Criteria    | `competition_criteria` extended with `category_id` + `display_order` |
| Judges      | New `competition_judges` table (first-class judge model) |
| Rankings    | Computed live from `competition_scores` + criteria + round + category weights |

The legacy `event_voters.is_judge` flow still works via the
`v_legacy_competition_judges` view; existing invited judges are recognized
without a data migration.

## Dynamic structure

```
events
  ├── competition_categories  (n)
  │     ├── competition_criteria (n)   (each criterion belongs to ONE category or to the event)
  │     └── competition_rounds    (n)  (each round belongs to ONE category or to the event)
  │            ├── competition_round_contestants (n)
  │            └── competition_round_criteria    (n)
  ├── competition_criteria (n)  (criteria with NULL category_id apply event-wide)
  ├── competition_rounds   (n)  (rounds with NULL category_id apply event-wide)
  ├── competition_contestants (n)
  └── competition_judges  (n)
        └── competition_judge_assignments (n)  (event | category | round scope)
```

## Tables

| Table | Purpose |
|-------|---------|
| `competition_categories` | Optional grouping layer with its own weight (%) |
| `competition_rounds` | Stages of a competition (preliminary, finals, etc.) |
| `competition_round_contestants` | Many-to-many contestants ↔ rounds |
| `competition_round_criteria` | Many-to-many criteria ↔ rounds |
| `competition_judges` | First-class judge model (`role`, `is_active`, `has_submitted`) |
| `competition_judge_assignments` | Per-judge scope (event / category / round) |

`competition_criteria`, `competition_scores`, and `competition_contestants` are
extended in place with `category_id`, `round_id`, `display_order` columns.

## Constraints

- **Categories weight total = 100%** when scoring is open
- **Rounds weight total = 100%** when scoring is open
- **Criteria weight total = 100%** within their (event | category) bucket
  when scoring is open (existing rule)
- **Score uniqueness** widened: `(judge, contestant, criteria, round)` —
  one score per (judge, contestant, criterion, round) tuple

## API surface (Phase 4)

All routes are under the existing organizer base path
`/api/organizer/competition/events/:eventId/...`.

| Resource | Endpoints |
|----------|-----------|
| Categories | `GET/POST /categories`, `PATCH/DELETE /categories/:id` |
| Rounds     | `GET/POST /rounds`, `PATCH/DELETE /rounds/:id` |
| Round contestants | `POST/DELETE /rounds/:roundId/contestants/:contestantId` |
| Round criteria    | `POST/DELETE /rounds/:roundId/criteria/:criteriaId` |
| Judges (first-class) | `GET /judges-v2`, `POST /judges-v2/invite` |
| Judge assignments | `GET/POST/DELETE /judges-v2/:judgeId/assignments` |
| Rankings   | `GET /events/:id/rankings` (returns `rounds`, `categories`, `criteria` breakdown) |

The legacy `/judges`, `/criteria`, `/contestants`, `/rankings`, `/analytics`
endpoints keep working unchanged.

## UI routes (Phase 4)

- Organizer: `/organizer/competition`
- Categories: `/organizer/competition/events/:id/categories`
- Rounds:     `/organizer/competition/events/:id/rounds`
- Judges:     `/organizer/competition/events/:id/judges` (extended)
- Rankings:   `/organizer/competition/events/:id/rankings`
