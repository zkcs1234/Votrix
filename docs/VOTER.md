# Phase 9 — Voter system

Unified voter dashboard and role-specific experiences for elections, pageant judging, and polls.

## Dashboard API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/voter/overview` | Assigned, active, and completed events |

### Event buckets

| Bucket | Meaning |
|--------|---------|
| **active** | User can act now (vote, score, or respond) |
| **assigned** | Enrolled but voting/scoring/poll not open |
| **completed** | Vote cast, scores submitted, or poll response finished |

### Per-type rules

- **Election**: active when `voting_enabled` and not `has_voted`; completed when voted.
- **Pageant** (judge): active when `scoring_enabled` and not `has_scored`; completed when scored.
- **Polling**: active when poll is open and (no prior response or multiple submissions allowed); completed when responded and cannot submit again.

## Experience APIs (unchanged)

| Module | Ballot / form |
|--------|----------------|
| Election | `GET/POST /api/voter/election/events/:id/ballot` · `vote` |
| Pageant | `GET/POST /api/voter/pageant/events/:id/score` |
| Polling | `GET/POST /api/voter/polling/events/:id` · `submit` |

## UI routes

| Route | Experience |
|-------|------------|
| `/voter` | Dashboard (assigned / active / completed) |
| `/voter/events/:eventId` | Election ballot — positions, candidates, vote controls |
| `/voter/pageant/events/:eventId/score` | Judge grid — contestants × criteria |
| `/voter/polling/events/:eventId` | Poll — questions and response controls |

## Frontend components

- `VoterEventCard` — dashboard list item with type and status
- `ElectionPositionSection` / `CandidateVoteControl` — ballot UI
- `PageantScoringForm` — desktop table + mobile cards
- `PollQuestionField` — all question types with styled controls
