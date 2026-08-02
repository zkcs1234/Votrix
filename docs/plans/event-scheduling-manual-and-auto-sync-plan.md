# Event Scheduling and Manual Open/Close Sync Plan

## Problem Statement

Election, competition, and polling events already support two ways to control participation windows:

- **Scheduled time window** via `startDate` and `endDate`
- **Manual open/close** via organizer buttons like `Open voting`, `Open scoring`, and `Open poll`

The current codebase saves both, but they are not fully synchronized.

The result is a mixed behavior model:

- An organizer can save dates, but the event may still stay closed until they click open.
- An organizer can click open, but there is no backend job that automatically opens or closes the event when the schedule starts or ends.
- Voter visibility depends on schedule helper functions, but organizer status and open flags can still drift out of sync.

---

## What The Code Does Today

### Organizer side

The organizer edit pages already save the event window:

- `startDate`
- `endDate`

Manual open/close actions also exist:

- Election: `setEventVoting(eventId, organizerId, votingEnabled)`
- Competition: `setEventScoring(eventId, organizerId, scoringEnabled)`
- Polling: `setPollOpen(eventId, organizerId, pollingEnabled)`

Those methods currently update:

- `voting_enabled` / `scoring_enabled` / `polling_enabled`
- `status` to `active` when opened
- `status` to `scheduled` when closed

### Voter side

Voter visibility is controlled by schedule helpers in [backend/src/utils/eventSchedule.js](backend/src/utils/eventSchedule.js):

- `isElectionVotingOpen(event)` requires `voting_enabled === true` and the event to be within the start/end window
- `isCompetitionScoringOpen(event)` requires `scoring_enabled === true` and the event to be within the start/end window
- `isPollOpen(event)` requires `polling_enabled === true`, not expired, and within the start/end window

That means voters will only see the event when both conditions are true:

- the feature is enabled manually
- the event date window allows participation

### Missing piece

There is no backend scheduler or reconciliation job that automatically:

- opens an event when the start time arrives
- closes or disables it when the end time passes
- updates organizer-facing `status` to match the current schedule state

So the system can drift into a state where the dates say one thing, the enable flag says another, and the organizer dashboard says something else.

---

## Root Cause Analysis

### 1. Manual open and time-based open are not unified

The current model treats manual toggle and date window as separate inputs, but there is no central state machine that resolves them into one source of truth.

### 2. No automatic background reconciliation exists

I checked the backend startup and service layer and found no cron job, queue worker, scheduled task, or periodic reconciliation loop that updates event open/close state based on `startDate` / `endDate`.

### 3. Organizer status can lag behind reality

Because the open/close buttons only update the event row at click time, the dashboard can show stale `scheduled` or `active` status after the schedule window changes.

### 4. Voter visibility is schedule-aware, but only after the API returns the event

The voter endpoints already hide events correctly when the schedule helper says they are closed, but that does not solve the organizer-side drift problem or automatic opening at the exact schedule time.

---

## Recommended Behavior

The best model is:

1. **Organizer defines the schedule window** with `startDate` and `endDate`.
2. **Organizer may still manually open/close early or late** when needed.
3. **Backend automatically reconciles status and open flags** when the schedule changes.
4. **Voter-side visibility always uses the same schedule rules** so the UI and APIs stay consistent.

That gives both methods working together instead of competing.

---

## Implementation Plan

### Phase 1. Define one scheduling source of truth

Create or extend a shared helper that computes the effective event state from:

- `status`
- `startDate`
- `endDate`
- `voting_enabled` / `scoring_enabled` / `polling_enabled`

Recommended output:

- `isScheduled`
- `isOpen`
- `isClosed`
- `reason` or `windowState` for debugging

This helper should be used by:

- organizer dashboards
- voter event lists
- event detail endpoints
- any live status badges in the UI

### Phase 2. Add an automatic reconciliation job

Add a backend scheduled job that periodically scans events and syncs state.

Recommended cadence:

- every 1 minute for near-real-time behavior
- or every 5 minutes if you want lower load

Rules:

- If `now < startDate`, event should remain scheduled/closed.
- If `startDate <= now <= endDate`, event should be open only if the feature is enabled.
- If `now > endDate`, event should be closed for voters, regardless of manual open state.

For example:

- Election: update `voting_enabled` or derived open state
- Competition: update `scoring_enabled` or derived open state
- Polling: update `polling_enabled` or derived open state

Important: do not rely only on the UI to keep these values correct.

### Phase 3. Keep manual buttons but make them schedule-aware

Update the manual open/close endpoints so they respect the schedule window:

- If the event has not started yet, opening early should either be blocked or clearly allowed as a special override.
- If the event has already ended, opening should be blocked unless you explicitly want an admin override.
- Closing manually should still work at any time.

Recommended approach:

- **Allow manual open only when the event is inside the schedule window**, unless an override flag is intentionally introduced.
- **Allow manual close anytime**.

This prevents organizers from creating a state that conflicts with the schedule.

### Phase 4. Make voter endpoints derive visibility from the same helper

Ensure voter-facing endpoints continue using the shared schedule helper, but also expose the computed state in the response.

Suggested additions to voter API responses:

- `eventState`
- `isOpen`
- `isWithinSchedule`
- `startsAt`
- `endsAt`

That lets the frontend show a better message like:

- `Event opens on ...`
- `Event closes on ...`
- `Voting is open now`
- `Voting has ended`

### Phase 5. Update organizer UI status labels

Adjust organizer event lists and dashboards so status labels reflect the computed state, not just the raw stored flag.

Examples:

- `Scheduled`
- `Open now`
- `Ended`
- `Manually closed`

This avoids confusion when the scheduler has already moved the event out of the active window.

---

## Files Likely To Change

| File                                                        | Change                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| `backend/src/utils/eventSchedule.js`                        | Centralize the computed state for open/closed/scheduled windows |
| `backend/src/services/election.service.js`                  | Use the same computed state for organizer and voter behavior    |
| `backend/src/services/pageant.service.js`                   | Same for competition scoring                                    |
| `backend/src/services/polling.service.js`                   | Same for polling                                                |
| `backend/src/controllers/*-organizer.controller.js`         | Manual open/close validation and response payloads              |
| `backend/src/controllers/*-voter.controller.js`             | Expose effective event state to the frontend                    |
| `backend/src/websocket/ws-server.js` or a new worker module | Auto-reconciliation job / scheduled task                        |
| `frontend/src/pages/organizer/**`                           | Show derived state labels and warnings                          |
| `frontend/src/pages/voter/**`                               | Show clear open/closed/scheduled messages                       |

---

## Implementation Options

### Option 1: Derived state only

Pros:

- simplest
- no cron job needed
- less infrastructure

Cons:

- organizer status can still drift if stored flags are not reconciled
- manual open/close remains separate from the schedule in the database

### Option 2: Derived state plus auto-reconciliation job

Pros:

- best long-term behavior
- organizer and voter views stay aligned
- scheduled opening and closing happen automatically

Cons:

- requires a background task or cron
- slightly more code

### Recommendation

Use **Option 2** if you want the system to behave reliably in production.

That is the only approach that fully satisfies both of your requirements:

- manual open/close must still work
- time-based open/close must work automatically
- voter visibility must follow the same rules

---

## Verification Steps

1. Create an event with a future `startDate` and `endDate`.
2. Confirm it stays hidden from voters before `startDate`.
3. Confirm the scheduler or reconciliation job opens it at `startDate`.
4. Confirm the voter page shows the event when the window is open.
5. Confirm it closes automatically after `endDate`.
6. Confirm manual close still works before and after the schedule window.
7. Confirm organizer dashboards show the same state as voter-facing behavior.

---

## Notes

- The current code already has the right building blocks.
- The missing piece is automatic state reconciliation over time.
- Without that, scheduled events depend too much on manual clicks.
