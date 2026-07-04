# Phase 6 — Election module

Run migration: `migrations/004_election_module.sql`

## Organizer API (`/api/organizer/election`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Summary stats |
| GET/POST | `/events` | List / create election events |
| GET/PATCH | `/events/:eventId` | Get / update event |
| PATCH | `/events/:eventId/voting` | `{ "votingEnabled": true }` |
| POST | `/events/:eventId/banner` | multipart `banner` |
| GET/POST | `/events/:eventId/positions` | Positions CRUD |
| PATCH/DELETE | `/events/:eventId/positions/:positionId` | |
| GET | `/events/:eventId/candidates` | List all candidates |
| POST | `/events/:eventId/positions/:positionId/candidates` | Add candidate |
| POST | `/events/:eventId/candidates/:candidateId/photo` | multipart `photo` |
| GET | `/events/:eventId/voters` | Enrolled voters |
| POST | `/events/:eventId/voters/invite` | Single invite + email |
| POST | `/events/:eventId/voters/import` | CSV multipart `file` |
| GET | `/events/:eventId/analytics` | Turnout + vote counts |

## Voter API (`/api/voter/election`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | Enrolled elections |
| GET | `/events/:eventId/ballot` | Ballot + status |
| POST | `/events/:eventId/vote` | `{ "selections": { "positionId": ["candidateId"] } }` |

## Voting rules

- One ballot per voter per event (`event_voters.has_voted`)
- Voting only when `voting_enabled` is true
- Per-position `min_vote`, `max_vote`, `allow_skip` enforced server-side
- Votes stored in `election_votes` (locked after submit)

## CSV format

```csv
email,firstname,lastname
voter1@school.edu,Juan,Dela Cruz
```
