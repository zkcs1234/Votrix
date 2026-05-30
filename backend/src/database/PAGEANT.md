# Phase 7 — Pageant module

Run migration: `migrations/005_pageant_module.sql`

## Concepts

- **Judges** are **voter** accounts with `event_voters.is_judge = true`
- **Scoring** opens via `events.scoring_enabled` (criteria must total **100%**)
- **One submission** per judge — `event_voters.has_scored` locks scores
- **Rankings** = weighted average: `Σ (criteria_avg × percentage / 100)`

## Organizer API (`/api/organizer/pageant`)

| Area | Endpoints |
|------|-----------|
| Events | `GET/POST /events`, `PATCH /events/:id`, `PATCH .../scoring` |
| Contestants | CRUD + `POST .../photo` |
| Criteria | CRUD (Beauty, Talent, etc.) |
| Judges | `GET /judges`, `POST /judges/invite`, `POST /judges/import` (CSV) |
| Rankings | `GET /events/:id/rankings` (live, auto-refresh on UI) |

## Judge API (`/api/voter/pageant`)

| Method | Path |
|--------|------|
| GET | `/events` |
| GET | `/events/:eventId/score` |
| POST | `/events/:eventId/score` — `{ scores: [{ contestantId, criteriaId, score }] }` |

## CSV judges

```csv
email,firstname,lastname
judge1@example.com,Maria,Santos
```

## UI routes

- Organizer: `/organizer/pageant`
- Judge scoring: `/voter/pageant/events/:eventId/score`
