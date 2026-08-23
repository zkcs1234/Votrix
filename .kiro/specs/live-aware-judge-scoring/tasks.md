# Implementation Plan: Live-Aware Judge Scoring Experience

## Overview

This implementation converts the judge scoring page from a static, offline-only interface into a real-time, session-aware system that responds to organizer control during live competition sessions. The plan follows the 6-phase migration strategy defined in the design document, building incrementally from backend APIs through frontend service layers to UI components.

**Key Technologies**: Node.js/Express backend, React frontend, Socket.IO for websockets, Supabase for database, HTTP-only cookies for authentication.

## Tasks

- [x] 1. Phase 2: Extend Backend Scoring Sheet API
  - [x] 1.1 Modify getJudgeScoringSheet to include division and session data
    - Update `getJudgeScoringSheet(eventId, judgeId, options)` in `backend/src/services/pageant.service.js`
    - Add `options.divisionId` parameter support for division filtering
    - Call `getActiveSession(eventId)` to include live session state
    - Query `competition_divisions` table to populate `allowedDivisions` array
    - Add division filtering logic: if `options.divisionId` is provided AND judge is assigned to it, filter contestants and criteria to that division only
    - Return extended response with new fields: `divisionsEnabled`, `allowedDivisions`, `activeSession`
    - Validate division access: throw 403 error if `options.divisionId` is provided but judge is not assigned to it
    - _Requirements: 2.1, 2.5, 2.6, 10.1, 10.2, 10.3, 10.4_

  - [x] 1.2 Update getScoringSheet controller to accept divisionId query parameter
    - Modify `getScoringSheet` in `backend/src/controllers/pageant-judge.controller.js`
    - Extract `divisionId` from `req.query`
    - Pass `{ divisionId: divisionId || null }` as options to `pageantService.getJudgeScoringSheet()`
    - _Requirements: 2.5, 10.6_

- [x] 2. Phase 3: Frontend Service Layer
  - [x] 2.1 Add session-related API methods to pageantService
    - Modify `frontend/src/services/pageant.service.js`
    - Add `getSessionView(eventId)` method calling `GET /api/voter/competition/events/:eventId/session-view`
    - Add `getActiveSession(eventId)` method calling `GET /api/organizer/competition/events/:eventId/session/active`
    - Modify `getScoringSheet(eventId, params)` to accept `params` object for query parameters (including `divisionId`)
    - Modify `submitScores(eventId, scores, sessionContext)` to accept optional `sessionContext` object with `sessionId`, `roundId`, `contestantId`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 3. Checkpoint: Verify Backend and Service Layer
  - [x] Ensure all tests pass, verify API responses include new fields (`divisionsEnabled`, `allowedDivisions`, `activeSession`)
  - [x] Test division filtering by calling `getScoringSheet` with different `divisionId` values
  - [x] Ask the user if questions arise.

- [x] 4. Phase 4: Websocket Integration in JudgeScoringPage
  - [x] 4.1 Add websocket connection and event subscriptions
    - Modify `frontend/src/pages/voter/JudgeScoringPage.jsx`
    - Add state variables: `liveMode`, `sessionState`, `activeContestantId`, `connectionError`, `reconnectAttempts`
    - In `useEffect` on mount, get the global `window.socketClient` Socket.IO instance
    - Subscribe to websocket events: `session:status-changed`, `session:contestant-changed`, `session:division-changed`
    - Implement `handleStatusChange`: update `sessionState`, set `liveMode` based on session status
    - Implement `handleContestantChange`: update `sessionState`, set `activeContestantId`, trigger scroll to active contestant
    - Implement `handleDivisionChange`: update `sessionState`, reload scoring sheet if division changes and judge is assigned
    - Clean up subscriptions on unmount with `socket.off()`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 4.2 Add websocket error handling and reconnection logic
    - In `JudgeScoringPage.jsx`, add event handlers for `connect_error`, `disconnect`, `reconnect`
    - Implement `handleConnectError`: set `connectionError` message, fall back to `liveMode = false`
    - Implement `handleDisconnect`: increment `reconnectAttempts`, show "Disconnected" warning
    - Implement `handleReconnect`: clear `connectionError`, reset `reconnectAttempts`, fetch current session state via `pageantService.getActiveSession()`
    - Display error banner if `reconnectAttempts >= MAX_RECONNECT_ATTEMPTS` (3) with "Refresh now" button
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 5. Phase 5: Division Selector UI
  - [x] 5.1 Implement division selector visibility logic
    - In `JudgeScoringPage.jsx`, add `useMemo` for `shouldShowDivisionSelector` and `shouldShowSingleDivision`
    - `shouldShowDivisionSelector`: true if `divisionsEnabled` AND `allowedDivisions.length > 1`
    - `shouldShowSingleDivision`: true if `divisionsEnabled` AND `allowedDivisions.length === 1`
    - Add state variable `selectedDivisionId`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.2 Render division selector UI components
    - In `JudgeScoringPage.jsx`, conditionally render single division display when `shouldShowSingleDivision` is true
    - Conditionally render division `<select>` dropdown when `shouldShowDivisionSelector` is true
    - Populate dropdown with `sheet.allowedDivisions` array, include "All Assigned Divisions" option
    - Style using existing Votrix design tokens (`v-card`, `v-surface`, `v-border`, `v-text-muted`)
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 5.3 Implement division change handler with scoring sheet reload
    - In `JudgeScoringPage.jsx`, implement `handleDivisionChange(divisionId)` function
    - Call `pageantService.getScoringSheet(eventId, { divisionId: divisionId || null })`
    - Update `sheet` state with new data, update `selectedDivisionId` state
    - Restore draft scores for the selected division from localStorage
    - Merge restored draft scores with `data.existingScores`
    - Handle errors: display error message if API call fails
    - _Requirements: 2.5, 2.6, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 6. Checkpoint: Test Division Selector and Filtering
  - [x] Ensure all tests pass, verify division selector appears for judges with multiple assignments
  - [x] Test division change: verify scoring sheet reloads with filtered contestants and criteria
  - [x] Test draft persistence: verify scores are saved per division and restored on division change
  - [x] Ask the user if questions arise.

- [x] 7. Phase 6: Live Mode UI Components
  - [x] 7.1 Implement Live Mode vs Offline Mode state management
    - In `JudgeScoringPage.jsx`, add `useEffect` to set `liveMode` based on `sessionState.status`
    - If `sessionState.status === 'active'`, set `liveMode = true` and `activeContestantId = sessionState.activeContestantId`
    - If `sessionState.status` is 'completed' or null, set `liveMode = false` and `activeContestantId = null`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 7.2 Render Live Session Status indicator
    - In `JudgeScoringPage.jsx`, conditionally render "Live Session Active" banner when `liveMode` is true
    - Display session info: current round name, contestant position (X of Y), animated pulse indicator
    - Style using emerald green colors (`border-emerald-900/50`, `bg-emerald-950/30`, `text-emerald-300`)
    - Conditionally render "Offline Mode" banner when `liveMode` is false
    - Style using standard surface colors (`border-v-border`, `bg-v-surface-elevated`, `text-v-text-muted`)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 7.3 Implement active contestant highlighting
    - In `JudgeScoringPage.jsx`, create `getContestantCardClass(contestantId)` function
    - Return base class with transition: `"v-card p-6 transition-all duration-300"`
    - If `liveMode && activeContestantId === contestantId`, append highlight classes: `"ring-2 ring-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-500/20"`
    - Apply class to each contestant card in the map
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 7.4 Implement auto-scroll to active contestant
    - In `JudgeScoringPage.jsx`, create `contestantRefs` using `useRef({})` to store refs for each contestant card
    - Assign refs in the contestant map: `ref={(el) => (contestantRefs.current[contestant.id] = el)}`
    - Create `scrollToContestant(contestantId)` function using `contestantRefs.current[contestantId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })`
    - Add `useEffect` watching `[liveMode, activeContestantId]`: if both are truthy, call `scrollToContestant(activeContestantId)` after 100ms delay
    - _Requirements: 4.2, 4.3_

  - [x] 7.5 Implement contestant order synchronization for live sessions
    - In `JudgeScoringPage.jsx`, add `useMemo` to compute `orderedContestants`
    - If `liveMode && sessionState.contestantOrder` exists, reorder `sheet.contestants` to match `sessionState.contestantOrder` array
    - If no live session, sort by `contestant_number` ascending (default)
    - Use `orderedContestants` in the map instead of `sheet.contestants`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8. Score Draft Persistence During Mode Transitions
  - [x] 8.1 Implement draft storage key generation and save logic
    - In `JudgeScoringPage.jsx`, create `getDraftKey(eventId, divisionId)` helper function
    - Return `competition_draft_${eventId}` or `competition_draft_${eventId}_div_${divisionId}` based on whether divisionId is provided
    - Wrap `setScores` state updater with `useCallback` that saves to localStorage on every change
    - Use `localStorage.setItem(getDraftKey(eventId, selectedDivisionId), JSON.stringify(scores))` with try-catch
    - Handle `QuotaExceededError` by logging warning (optional: clear old drafts)
    - _Requirements: 8.1, 8.2_

  - [x] 8.2 Implement draft restoration on mount and division change
    - In `JudgeScoringPage.jsx`, create `loadDraftScores(eventId, divisionId)` helper function
    - Use `localStorage.getItem(getDraftKey(eventId, divisionId))` with try-catch
    - Return parsed JSON or empty object `{}` if not found or parse fails
    - Call `loadDraftScores` in initial `useEffect` on mount and merge with `sheet.existingScores`
    - Call `loadDraftScores` in `handleDivisionChange` and merge with new `data.existingScores`
    - _Requirements: 8.2, 8.3, 8.4_

  - [x] 8.3 Clear drafts on successful score submission
    - In `JudgeScoringPage.jsx`, modify `handleSubmit` function
    - After successful `pageantService.submitScores()` call, clear draft using `localStorage.removeItem(getDraftKey(eventId, selectedDivisionId))`
    - Also clear legacy draft key `pageantDraft_${eventId}` for backwards compatibility
    - _Requirements: 8.5_

- [x] 9. Real-Time Score Submission Feedback
  - [x] 9.1 Implement loading and success states for score submission
    - In `JudgeScoringPage.jsx`, add state variables: `submitting`, `done`, `error`, `showRetry`
    - In `handleSubmit`, set `submitting = true` before API call, `submitting = false` in finally block
    - On success, set `done = true` to show success message
    - Display loading spinner on submit button when `submitting` is true
    - Display success message with checkmark when `done` is true
    - _Requirements: 12.1, 12.2_

  - [x] 9.2 Implement error handling with retry logic for score submission
    - In `handleSubmit`, catch errors and set `error` state with error message from `err.response?.data?.message || 'Submit failed'`
    - If no `err.response` (network error), set `showRetry = true`
    - Display error alert with red border and error message
    - If `showRetry` is true, display "Retry submission" button that calls `handleSubmit` again
    - _Requirements: 12.3, 12.4_

  - [x] 9.3 Add session context to score submission
    - In `handleSubmit`, pass `sessionContext` object to `pageantService.submitScores()`
    - Include `sessionId: sessionState?.id`, `roundId: sessionState?.currentRoundId`, `contestantId: activeContestantId`
    - Backend will use this context to emit `session:judge-score-submitted` event to organizer
    - _Requirements: 12.5, 12.6_

- [x] 10. Final Checkpoint: Integration Testing
  - [x] Test complete live session flow: organizer starts session, judge sees live mode, organizer advances contestant, judge's UI updates
  - [x] Test websocket reconnection: disconnect network, reconnect, verify session state syncs
  - [x] Test division filtering during live session: organizer switches division, judge's UI reloads if assigned
  - [x] Test draft persistence: enter scores, refresh page, verify drafts restored
  - [x] Test offline mode: stop session, verify judge can navigate freely
  - [x] Ensure all tests pass, ask the user if questions arise.

## Notes

- **Phase 1 (Backend Session API) is already complete** from the division implementation phase 7, so tasks start at Phase 2
- All websocket events (`session:status-changed`, `session:contestant-changed`, `session:division-changed`) are already emitted by the backend
- The existing `competition_sessions` table, `getJudgeSessionView()`, and `resolveAllowedDivisions()` functions are already implemented
- HTTP-only cookies are already in use for authentication (per AGENTS.md workspace rules), so websocket connections are automatically authenticated
- Draft persistence uses localStorage with division-aware keys to avoid cross-contamination
- Error handling gracefully degrades to Offline Mode if websocket connection fails
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at major milestones

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["4.1", "5.1"] },
    { "id": 3, "tasks": ["4.2", "5.2"] },
    { "id": 4, "tasks": ["5.3", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "8.1"] },
    { "id": 6, "tasks": ["7.4", "7.5", "8.2"] },
    { "id": 7, "tasks": ["8.3", "9.1"] },
    { "id": 8, "tasks": ["9.2", "9.3"] }
  ]
}
```
