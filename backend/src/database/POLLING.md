# Phase 8 — Polling module

Run migration: `migrations/006_polling_module.sql`

## Question types

| UI type | DB type | Answer format |
|---------|---------|---------------|
| Multiple choice | `single_choice` | One option UUID |
| Checkbox | `checkbox` | JSON array of option UUIDs |
| Yes / No | `yes_no` | One option UUID (auto-created Yes/No) |
| Text | `text` | Free text string |
| Rating | `rating` | Number 1–5 |

## Poll settings (organizer)

| Setting | Column | Description |
|---------|--------|-------------|
| Anonymous | `poll_anonymous` | Hides respondent IDs in text-response analytics |
| Multiple submissions | `poll_allow_multiple_submissions` | Same voter may submit more than once |
| Expiration | `poll_expires_at` | Poll auto-closes after this time |
| Open / close | `polling_enabled` | Toggle accepting responses |

## Organizer API (`/api/organizer/polling`)

| Area | Endpoints |
|------|-----------|
| Dashboard | `GET /dashboard` |
| Events | `GET/POST /events`, `PATCH /events/:id`, `GET /events/:id/settings` |
| Open poll | `PATCH /events/:id/open` — `{ pollingEnabled: boolean }` |
| Questions | `GET/POST /events/:id/questions`, `PATCH/DELETE .../questions/:questionId` |
| Analytics | `GET /events/:id/analytics` |
| Respondents | `POST /events/:id/respondents/invite`, `POST .../import` (CSV) |

### Create question body

```json
{
  "question": "How satisfied are you?",
  "type": "multiple_choice",
  "required": true,
  "options": [{ "label": "Very satisfied" }, { "label": "Not satisfied" }]
}
```

Use `type: "yes_no"` with no options — Yes/No choices are created automatically.

## Voter API (`/api/voter/polling`)

| Method | Path |
|--------|------|
| GET | `/events` |
| GET | `/events/:eventId` |
| POST | `/events/:eventId/submit` — `{ answers: { [questionId]: value } }` |

## Analytics response

- **totalSubmissions** — count of `poll_submissions`
- **questions[]** — per-question `responseCount`, plus:
  - `type: "choice"` — options with `count` and `percentage`
  - `type: "rating"` — distribution 1–5 and `average`
  - `type: "text"` — sample responses (anonymous mode omits `respondent`)

## CSV respondents

Same format as election voters:

```csv
email,firstname,lastname
user@example.com,Juan,Dela Cruz
```

## UI routes

- Organizer: `/organizer/polling`
- Poll builder: `/organizer/polling/events/:eventId/builder`
- Settings: `/organizer/polling/events/:eventId/settings`
- Analytics: `/organizer/polling/events/:eventId/analytics`
- Respondent form: `/voter/polling/events/:eventId`
