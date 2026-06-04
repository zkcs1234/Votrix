# Phase 6 — Judge Assignment System

A flexible, **first-class judge model** that supports assigning judges
to specific scopes (event, category, round) and configuring their
permission role.

## Permission roles

| Role | Can submit scores? | Can close rounds? | Read scores? |
|------|-------------------|-------------------|--------------|
| `judge` | ✅ | ❌ | ✅ |
| `head_judge` | ✅ | ✅ | ✅ |
| `score_reviewer` | ❌ | ❌ | ✅ |

The `head_judge` permission opens the door to per-round close flows in
future phases; for now any organizer can close a round via the API.

## Assignment scopes

| Scope | What a judge can score |
|-------|------------------------|
| `event` | All contestants × criteria in the event |
| `category` | Only contestants × criteria inside the assigned category |
| `round` | Only contestants × criteria inside the assigned round |

A judge can have **multiple** assignments. The grant rule is **OR**:
`event` unlocks everything; otherwise at least one of the assignments
must match the score's `roundId` or `categoryId`.

If a judge has zero assignments and the `competition_judges` row exists,
they default to event-wide (matches the legacy flow).

## Tables

| Table | Purpose |
|-------|---------|
| `competition_judges` | One row per (event, user) with role + active flag |
| `competition_judge_assignments` | Many rows per judge, each with a `(scope, scope_id)` pair |

`scope_id` always points to an `events.id` / `competition_categories.id`
/ `competition_rounds.id` row in the same event. The application layer
validates this in `createJudgeAssignment`.

## API

```
# First-class judges (Phase 6)
GET    /api/organizer/competition/events/:id/judges-v2
POST   /api/organizer/competition/events/:id/judges-v2/invite
PATCH  /api/organizer/competition/events/:id/judges-v2/:judgeId
DELETE /api/organizer/competition/events/:id/judges-v2/:judgeId

# Assignments
GET    /api/organizer/competition/events/:id/judges-v2/:judgeId/assignments
POST   /api/organizer/competition/events/:id/judges-v2/:judgeId/assignments
DELETE /api/organizer/competition/events/:id/judges-v2/:judgeId/assignments/:assignmentId
```

## Submission flow enforcement

`submitJudgeScores` consults `getJudgeAssignmentContext(eventId, judgeId)`
before inserting rows:

1. If the user is not a first-class judge → always allowed (legacy path).
2. If their `is_active` flag is false → 403.
3. If their role is `score_reviewer` → 403.
4. For each (roundId, categoryId) pair in the submission, `canJudgeScore`
   must return true; otherwise the request is rejected with a clear
   error message.

## UI

`/organizer/competition/events/:id/workspace` → **Judge assignments** tab
shows the invited judges with their role, an inline role switcher, and
per-judge assignment manager (scope + scope_id pickers).

## Backward compatibility

The legacy `event_voters.is_judge` flow is **preserved**: judges invited
via the original `/judges/invite` endpoint continue to work, and the
view `v_legacy_competition_judges` exposes them as if they were
first-class `judge` rows. A future migration can convert them to
`competition_judges` rows; the engine will treat them identically.
