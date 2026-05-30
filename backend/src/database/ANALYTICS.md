# Phase 12 — Analytics & reports

Unified reporting API for organizers across election, pageant, and polling modules.

## API (`/api/organizer/reports`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/overview` | All events with quick stats |
| GET | `/election/:eventId` | Turnout + vote summary by position |
| GET | `/pageant/:eventId` | Judge turnout + weighted rankings |
| GET | `/polling/:eventId` | Response summary + question charts |

All routes require organizer authentication.

## Report contents

### Election report

- **Turnout**: total voters, voted, not voted, turnout %
- **Vote summary**: votes per candidate (overall)
- **Position summaries**: per-position leader, vote counts, percentages

### Pageant report

- **Judge turnout**: submitted vs total judges
- **Ranking report**: weighted scores, criterion breakdown, ranks

### Polling report

- **Response summary**: submissions, enrolled respondents, response rate
- **Question charts**: choice/rating distributions with percentages; text samples

## Module analytics (legacy)

These endpoints remain available inside each module:

- `GET /api/organizer/election/events/:id/analytics` (includes `positionSummaries`)
- `GET /api/organizer/pageant/events/:id/rankings`
- `GET /api/organizer/polling/events/:id/analytics`

## UI routes

| Route | Page |
|-------|------|
| `/organizer/reports` | Reports overview |
| `/organizer/reports/election/:eventId` | Full election report |
| `/organizer/reports/pageant/:eventId` | Rankings + judge turnout |
| `/organizer/reports/polling/:eventId` | Poll charts report |

Export: CSV (election vote summary, pageant rankings) and JSON on report pages.
