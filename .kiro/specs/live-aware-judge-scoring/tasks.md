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
  - [x] 3.1 Ensure all tests pass, verify API responses include new fields (`divisionsEnabled`, `allowedDivisions`, `activeSession`)
  - [x] 3.2 Test division filtering by calling `getScoringSheet` with different `divisionId` values
  - [x] 3.3 Ask the user if questions arise.

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
  - [x] 6.1 Ensure all tests pass, verify division selector appears for judges with multiple assignments
  - [x] 6.2 Test division change: verify scoring sheet reloads with filtered contestants and criteria
  - [x] 6.3 Test draft persistence: verify scores are saved per division and restored on division change
  - [x] 6.4 Ask the user if questions arise.

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
  - [x] 10.1 Test complete live session flow: organizer starts session, judge sees live mode, organizer advances contestant, judge's UI updates
  - [x] 10.2 Test websocket reconnection: disconnect network, reconnect, verify session state syncs
  - [x] 10.3 Test division filtering during live session: organizer switches division, judge's UI reloads if assigned
  - [x] 10.4 Test draft persistence: enter scores, refresh page, verify drafts restored
  - [x] 10.5 Test offline mode: stop session, verify judge can navigate freely
  - [x] 10.6 Ensure all tests pass, ask the user if questions arise.

## Notes

- **Phase 1 (Backend Session API) is already complete** from the division implementation phase 7, so tasks start at Phase 2
- All websocket events (`session:status-changed`, `session:contestant-changed`, `session:division-changed`) are already emitted by the backend
- The existing `competition_sessions` table, `getJudgeSessionView()`, and `resolveAllowedDivisions()` functions are already implemented
- HTTP-only cookies are already in use for authentication (per AGENTS.md workspace rules), so websocket connections are automatically authenticated
- Draft persistence uses localStorage with division-aware keys to avoid cross-contamination
- Error handling gracefully degrades to Offline Mode if websocket connection fails
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at major milestones

---

## Phase 7: Production Readiness Improvements (Requirements 13-20)

### Critical Fixes (MUST DO FIRST)

- [x] 11. Implement Pre-Flight Session Validation (Requirement 13)
  - [x] 11.1 Add validation checks to startSession service
    - Modify `startSession()` in `backend/src/services/competition-session.service.js`
    - Add contestant count validation: query `competition_contestants` table, throw 400 if count === 0 with message "Cannot start session: No contestants added. Add contestants first."
    - Add judge count validation: query `competition_judges` table with `is_active = true`, throw 400 if count === 0 with message "Cannot start session: No judges enrolled. Add judges first."
    - Add criteria validation: query `competition_criteria` table, throw 400 if count === 0 with message "Cannot start session: No criteria added. Add criteria first."
    - Add criteria percentage validation: sum all `percentage` values, throw 400 if `Math.abs(total - 100) > 0.1` with message "Cannot start session: Criteria percentages total X% (must equal 100%)"
    - Add rounds validation (when rounds exist): if `rounds.length > 0` but no round has been marked as open or assigned contestants, throw 400 with message "Cannot start session: No open rounds with assigned contestants"
    - Insert validation checks BEFORE auto-enabling scoring and building contestant order
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [ ] 12. Implement Judge Score Submission Confirmation Toast (Requirement 14)
  - [-] 12.1 Add confirmation toast component to JudgeScoringPage
    - Modify `frontend/src/pages/voter/JudgeScoringPage.jsx`
    - Add state variable: `showConfirmation` (boolean)
    - After successful auto-save in the score input handler, set `showConfirmation = true`
    - Add `setTimeout(() => setShowConfirmation(false), 3000)` to auto-dismiss after 3 seconds
    - _Requirements: 14.1, 14.5_

  - [x] 12.2 Render confirmation toast with contestant context
    - In `JudgeScoringPage.jsx`, conditionally render toast when `showConfirmation === true`
    - Position fixed at bottom-right: `fixed bottom-4 right-4 z-50`
    - Style with emerald success colors: `bg-emerald-500 text-white shadow-2xl rounded-xl px-6 py-4`
    - Display success checkmark icon (e.g., `CheckCircle` from lucide-react)
    - Display heading: "Scores Submitted!" in bold font
    - Display contestant name from `sheet.contestants.find(c => c.id === activeContestantId)?.name`
    - Display message: "Your scores are locked" in smaller text with `text-white/80`
    - Add slide-up animation: `animate-slide-up` (define in CSS if needed)
    - _Requirements: 14.2, 14.3, 14.4_

- [ ] 13. Implement Failed Submission Retry Queue (Requirement 15)
  - [-] 13.1 Add retry queue state management
    - In `JudgeScoringPage.jsx`, add state variables: `submissionQueue` (array), `showRetryBanner` (boolean)
    - When auto-save fails (network error: `!err.response`), add the failed submission payload to `submissionQueue`
    - Persist failed submissions to localStorage with key: `competition_retry_queue_${eventId}` (JSON array)
    - Set `showRetryBanner = true` when queue has items
    - _Requirements: 15.1, 15.2_

  - [x] 13.2 Implement automatic retry on reconnection
    - In `JudgeScoringPage.jsx`, add `useEffect` watching `[socket.connected, submissionQueue]`
    - When `socket.connected === true` AND `submissionQueue.length > 0`, iterate through queue and retry each submission
    - On success, remove submission from queue (both state and localStorage)
    - On failure, keep submission in queue for manual retry
    - When queue is empty, set `showRetryBanner = false`
    - _Requirements: 15.5, 15.6, 15.7_

  - [x] 13.3 Render retry error banner with manual retry button
    - In `JudgeScoringPage.jsx`, conditionally render error banner at TOP of page when `showRetryBanner === true`
    - Position: relative at top (not bottom) with high visibility
    - Style with red error colors: `border border-red-500/50 bg-red-950/30 rounded-lg p-4`
    - Display error icon and message: "Failed to submit scores. Will retry automatically when connection is restored."
    - Add manual "Retry Now" button that triggers retry logic immediately
    - Display count of pending submissions: "X score(s) pending submission"
    - _Requirements: 15.3, 15.4_

### Performance & Security

- [x] 14. Add Database Performance Indexes (Requirement 16)
  - [x] 14.1 Create migration for competition performance indexes
    - Create new migration file: `backend/src/database/migrations/055_competition_performance_indexes.sql`
    - Add index: `CREATE INDEX IF NOT EXISTS idx_competition_sessions_event_status ON competition_sessions(event_id, status);`
    - Add index: `CREATE INDEX IF NOT EXISTS idx_session_judge_scores_lookup ON competition_session_judge_scores(session_id, judge_id, round_id, contestant_id);`
    - Add index: `CREATE INDEX IF NOT EXISTS idx_contestants_event_division ON competition_contestants(event_id, division_id, contestant_number);`
    - Add index: `CREATE INDEX IF NOT EXISTS idx_judge_assignments_lookup ON competition_judge_assignments(event_id, judge_id, scope, scope_id);`
    - Add index: `CREATE INDEX IF NOT EXISTS idx_criteria_event_division ON competition_criteria(event_id, division_id);`
    - Add index: `CREATE INDEX IF NOT EXISTS idx_rounds_event_category ON competition_rounds(event_id, category_id, display_order);`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

- [x] 15. Implement Rate Limiting on Score Submissions (Requirement 17)
  - [x] 15.1 Add rate limiting middleware for score submission endpoints
    - Create or modify rate limiting config in `backend/src/middleware/rateLimiter.js` (or create if doesn't exist)
    - Install `express-rate-limit` package: `npm install express-rate-limit` (if not already installed)
    - Create `scoreLimiter` middleware: `rateLimit({ windowMs: 60000, max: 30, message: 'Too many score submissions, please slow down' })`
    - Apply rate limiter to judge score submission endpoints in `backend/src/routes/pageant-judge.routes.js` (or relevant route file)
    - Apply to POST `/api/voter/competition/events/:eventId/score` and auto-save endpoints
    - Use `keyGenerator` option to track by `req.user.id` (judge ID) to isolate rate limits per judge
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 16. Add CSRF Protection on Session Control Endpoints (Requirement 18)
  - [x] 16.1 Verify CSRF middleware on session control endpoints
    - Review `backend/src/routes/competition-session.routes.js` or relevant session control routes
    - Verify existing CSRF middleware (`csrfProtection` from `csurf` package) is applied to:
      - POST `/api/organizer/competition/events/:eventId/session/start`
      - POST `/api/organizer/competition/events/:eventId/session/pause`
      - POST `/api/organizer/competition/events/:eventId/session/resume`
      - POST `/api/organizer/competition/events/:eventId/session/complete`
    - If CSRF middleware is missing, add it to these endpoints
    - Ensure frontend includes CSRF token from cookies in request headers (should already exist per AGENTS.md)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

### UX Improvements

- [x] 17. Refine Division Selector Auto-Hide Logic (Requirement 19)
  - [x] 17.1 Update division selector visibility logic
    - In `JudgeScoringPage.jsx`, verify `shouldShowDivisionSelector` logic already checks `allowedDivisions.length > 1`
    - Add case for 0 divisions: if `divisionsEnabled && allowedDivisions.length === 0`, display error message "You are not assigned to any divisions"
    - Verify `shouldShowSingleDivision` logic: if `divisionsEnabled && allowedDivisions.length === 1`, auto-select division and display as static text
    - Ensure single-division case still loads `Scoring_Sheet` filtered by that division
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [ ] 18. Add Organizer Dashboard Session Recovery Banner (Requirement 20)
  - [x] 18.1 Implement active session check on organizer dashboard
    - Modify organizer dashboard page (likely `frontend/src/pages/organizer/DashboardPage.jsx` or competition-specific dashboard)
    - On component mount, fetch all events owned by organizer and check for active sessions
    - For each event, call `GET /api/organizer/competition/events/:eventId/session/active` to check for active sessions
    - Collect all events with `session.status === 'active'` into state variable: `activeSessions` (array)
    - _Requirements: 20.1, 20.2_

  - [x] 18.2 Render session recovery banner for active sessions
    - In organizer dashboard, conditionally render banner when `activeSessions.length > 0`
    - Position at top of page with high visibility: `border border-amber-500/50 bg-amber-950/30 rounded-lg p-4 mb-6`
    - Display heading: "Resume Active Session" with warning icon
    - For each active session, display:
      - Event name/title
      - Current contestant name or number (from `session.activeContestantName` or `session.activeContestantNumber`)
      - Elapsed time since session started: calculate `Date.now() - new Date(session.startedAt)`, format as "Xh Ym" or "Ym" or "X minutes ago"
      - Direct link button: "Resume Session" → navigates to `/organizer/competition/events/${eventId}/live`
    - If multiple active sessions exist, list all in the banner
    - _Requirements: 20.3, 20.4, 20.5, 20.6, 20.7_

- [ ] 19. Final Checkpoint: Production Readiness Testing
  - [ ] 19.1 Test pre-flight validation: attempt to start session with 0 contestants, 0 judges, criteria ≠ 100%, verify appropriate error messages
  - [~] 19.2 Test judge confirmation toast: submit scores as judge, verify toast appears with contestant name and auto-dismisses after 3 seconds
  - [~] 19.3 Test retry queue: disconnect network while scoring, verify error banner appears, reconnect network, verify auto-retry succeeds
  - [~] 19.4 Test manual retry button: disconnect network, score contestant, click "Retry Now", verify submission succeeds when network available
  - [~] 19.5 Test database indexes: run `\d+ competition_sessions` in PostgreSQL, verify all 6 new indexes exist
  - [~] 19.6 Test rate limiting: submit 31 scores in 1 minute as same judge, verify 429 error on 31st submission
  - [~] 19.7 Test CSRF protection: attempt session control request without CSRF token, verify 403 error
  - [~] 19.8 Test division selector auto-hide: log in as judge with 1 division, verify selector is hidden and division name is displayed
  - [~] 19.9 Test session recovery banner: start session, navigate away from live page, return to dashboard, verify banner shows with event name and elapsed time
  - [~] 19.10 Ensure all tests pass, ask the user if questions arise.

## Notes

- **Requirements 13-20 are production-critical improvements** added after initial implementation (Requirements 1-12)
- **Critical fixes (Req 13-15) must be implemented first** to prevent session start failures and improve judge confidence
- **Performance & security (Req 16-18) are high priority** for production scalability and attack prevention
- **UX improvements (Req 19-20) are lower priority** but significantly improve user experience
- All new tasks reference specific requirement numbers for traceability
- The retry queue uses both in-memory state (for fast access) and localStorage (for persistence across page refreshes)
- Database indexes are safe to add (non-breaking) and will immediately improve query performance on large events
- Rate limiting prevents API abuse without affecting normal scoring behavior (30 submissions/min is generous for typical use)
- CSRF protection prevents session hijacking attacks (should already exist per AGENTS.md rules, task is to verify)
- Division selector logic refinements complete the feature from Requirements 2 and 19
- Session recovery banner is a quality-of-life improvement for organizers managing multiple events

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
    { "id": 8, "tasks": ["9.2", "9.3"] },
    { "id": 9, "tasks": ["11.1"] },
    { "id": 10, "tasks": ["12.1", "13.1", "14.1"] },
    { "id": 11, "tasks": ["12.2", "13.2", "15.1"] },
    { "id": 12, "tasks": ["13.3", "16.1", "17.1"] },
    { "id": 13, "tasks": ["18.1"] },
    { "id": 14, "tasks": ["18.2"] }
  ]
}
```
