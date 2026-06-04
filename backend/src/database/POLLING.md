# Phase 7 — Polling Management Enhancement

Run migrations `migrations/017_polling_question_type_registry.sql` (down: `018_*`).

The Polling module is now **registry-driven**: every question type lives
in the database, not in the application code. The UI loads the available
types from the API and renders the right input per type. A new type is a
single SQL `INSERT` away (plus, optionally, a tiny `ui` JSONB hint to tell
the React form which input to render).

## Built-in question types

| `key` | Label | `answerFormat.kind` | UI input |
|-------|-------|---------------------|----------|
| `single_choice` | Single Choice | `choice` (one) | `radio` |
| `checkbox` | Multiple Selection | `choice` (many) | `checkbox` |
| `yes_no` | Yes / No | `choice` (one, autoOptions) | `radio` |
| `rating` | Rating Scale | `numeric` | `rating` |
| `likert_scale` | Likert Scale | `choice` (autoOptionsFromConfig) | `likert` |
| `open_text` | Open Text | `text` | `textarea` |
| `ranking` | Ranking | `ranking` | `ranking` |

`multiple_choice` is preserved as a legacy alias for `single_choice`.

## Tables

| Table | Purpose |
|-------|---------|
| `system_poll_question_types` | Built-in, globally available types (seeded by the migration) |
| `poll_question_types` | Per-organization overrides & custom types (organizer can add) |
| `v_poll_question_types` (view) | Effective registry: per-org overrides shadow built-ins |
| `poll_questions.type_config` | Per-question override (e.g. 1–10 rating, Likert 7-pt) |

## How a new type is added

1. **Built-in** (admin-level): `INSERT INTO system_poll_question_types (...)` with the desired `answer_format`, `config_schema`, and `ui`. No code changes.
2. **Organizer-level** (custom): `POST /api/organizer/polling/question-types/custom` with the same shape. The new type is immediately available to that organizer's polls.

The application code never needs to know about a new type — `modules/poll-question-types.js` is a generic validator/serializer that switches on `answerFormat.kind` (`choice` / `numeric` / `text` / `ranking`).

## API

### Type registry
| Method | Path |
|--------|------|
| GET | `/api/organizer/polling/question-types` |
| GET | `/api/organizer/polling/question-types/custom` |
| POST | `/api/organizer/polling/question-types/custom` |
| PATCH | `/api/organizer/polling/question-types/custom/:typeId` |
| DELETE | `/api/organizer/polling/question-types/custom/:typeId` |

### Questions
Create / update payload now accepts `typeConfig` (per-question override):

```json
{
  "question": "How would you rate the event?",
  "type": "rating",
  "typeConfig": { "min": 0, "max": 10, "step": 1 },
  "required": true
}
```

## Voter UI

`PollQuestionField` reads `question.typeDef.ui.input` and switches to the
matching render path:

- `radio` → single choice
- `checkbox` → multi-select
- `rating` → numeric buttons
- `likert` → horizontal scale
- `textarea` → open text
- `ranking` → up/down rank controls
- (anything else) → graceful "unsupported" message

## Analytics

`getPollAnalytics` runs each question through `buildAnalytics({ question, answers, options, typeDef, typeConfig, anonymous })`. The output shape depends on the type:

- `choice` → `{ kind: 'choice', options: [{ optionId, count, percentage }] }`
- `numeric` → `{ kind: 'numeric', distribution: [...], average }`
- `ranking` → `{ kind: 'ranking', options: [{ optionId, averageRank, rankedCount }] }`
- `text` → `{ kind: 'text', responses: [{ text, respondent }] }`

## Tests

`__tests__/modules/poll-question-types.test.js` covers:

- Auto-option generation (Yes/No, Likert 3/5/7)
- Validation per kind + per `typeConfig`
- `serializeAnswer` shape
- Analytics output for choice / numeric / ranking / text

All 175 backend tests pass.
