# Requirements Document

## Introduction

The Live-Aware Judge Scoring Experience enhances the judge scoring page to respond to real-time organizer control during live competition sessions. Currently, judges see all contestants at once with no awareness of live session state, active division, or the contestant currently being presented. This feature integrates websocket-based real-time updates so judges can follow the organizer's live flow, focus on the active contestant, and see division-specific scoring sheets when divisions are enabled.

## Glossary

- **Judge_Scoring_Page**: The frontend React component (`JudgeScoringPage.jsx`) where judges view contestants and submit scores for a competition event
- **Live_Session**: A competition session with status 'active', managed by organizers via the `competition_sessions` table, containing current_division_id, active_contestant_id, and contestant_order
- **Active_Contestant**: The contestant currently being presented during a live session, identified by `active_contestant_id` in the session state
- **Division_Selector**: A UI component allowing judges to choose which division to score when divisions are enabled and the judge is assigned to multiple divisions
- **Websocket_Client**: The Socket.IO client connection in the frontend that receives real-time events from the backend
- **Scoring_Sheet**: The data structure containing contestants, criteria, and existing scores returned by `getJudgeScoringSheet(eventId, judgeId)`
- **Judge_Assignment**: The scope-based assignment system (`competition_judge_assignments` table) that restricts judges to specific divisions, rounds, or categories
- **Session_View**: The judge-specific view of the active session returned by `getJudgeSessionView(eventId, judgeId)`, containing session state, active contestant, and criteria
- **Live_Mode**: The UI state when a live session is active, where the Judge_Scoring_Page highlights the active contestant and responds to organizer control changes
- **Offline_Mode**: The UI state when no live session is active, where judges can navigate freely among all contestants in their scoring sheet

## Requirements

### Requirement 1: Websocket Connection for Real-Time Updates

**User Story:** As a judge, I want to see real-time updates during a live competition session, so that I can follow the organizer's presentation flow without manual page refreshes.

#### Acceptance Criteria

1. WHEN THE Judge_Scoring_Page mounts, THE Websocket_Client SHALL establish a connection to the backend Socket.IO server
2. WHEN the connection is established, THE Websocket_Client SHALL subscribe to event-specific channels using the eventId
3. WHEN THE Live_Session status changes, THE Websocket_Client SHALL receive a `session:status-changed` event containing the updated session state
4. WHEN THE Active_Contestant changes, THE Websocket_Client SHALL receive a `session:contestant-changed` event containing the new active contestant and session state
5. WHEN THE current division changes, THE Websocket_Client SHALL receive a `session:division-changed` event containing the new division and updated contestant order
6. WHEN THE Judge_Scoring_Page unmounts, THE Websocket_Client SHALL disconnect and unsubscribe from all event channels

### Requirement 2: Division Selector Display

**User Story:** As a judge assigned to multiple divisions, I want to see a division selector when divisions are enabled, so that I can choose which division to score.

#### Acceptance Criteria

1. WHEN THE Scoring_Sheet is loaded, THE Judge_Scoring_Page SHALL check if `divisionsEnabled` is true in the event configuration
2. WHEN divisions are enabled AND THE Judge_Assignment includes multiple divisions, THE Judge_Scoring_Page SHALL display THE Division_Selector UI component
3. WHEN divisions are enabled AND THE Judge_Assignment includes only one division, THE Judge_Scoring_Page SHALL display the single division name without a selector
4. WHEN divisions are not enabled, THE Judge_Scoring_Page SHALL NOT display THE Division_Selector
5. WHEN THE judge selects a different division in THE Division_Selector, THE Judge_Scoring_Page SHALL reload THE Scoring_Sheet filtered by the selected division
6. FOR ALL division selections, THE backend `getJudgeScoringSheet` SHALL filter contestants and criteria using `resolveAllowedDivisions(eventId, judgeId)` and the selected division

### Requirement 3: Live Session Status Display

**User Story:** As a judge, I want to see the current live session status, so that I know whether the competition is active, paused, or completed.

#### Acceptance Criteria

1. WHEN THE Live_Session exists AND has status 'active', THE Judge_Scoring_Page SHALL display a "Live Session Active" indicator
2. WHEN THE Live_Session exists AND has status 'paused', THE Judge_Scoring_Page SHALL display a "Session Paused" indicator
3. WHEN THE Live_Session exists AND has status 'completed', THE Judge_Scoring_Page SHALL display a "Session Completed" message
4. WHEN no Live_Session exists, THE Judge_Scoring_Page SHALL display an "Offline Mode" indicator
5. WHEN THE session status changes via websocket event, THE Judge_Scoring_Page SHALL update the status indicator within 500 milliseconds

### Requirement 4: Active Contestant Highlighting

**User Story:** As a judge, I want to see the active contestant highlighted during a live session, so that I can focus on scoring the contestant currently being presented.

#### Acceptance Criteria

1. WHEN THE Live_Session is active AND Active_Contestant is set, THE Judge_Scoring_Page SHALL highlight the active contestant's scoring card with a distinct visual treatment
2. WHEN THE Live_Session is active AND Active_Contestant is set, THE Judge_Scoring_Page SHALL scroll the active contestant's card into view automatically
3. WHEN THE Active_Contestant changes via websocket event, THE Judge_Scoring_Page SHALL update the highlight and scroll to the new active contestant within 500 milliseconds
4. WHEN THE Live_Session is paused OR completed OR not active, THE Judge_Scoring_Page SHALL remove all contestant highlighting
5. WHEN no Live_Session is active, THE Judge_Scoring_Page SHALL display all contestants with equal visual treatment

### Requirement 5: Live Mode vs Offline Mode UI Adaptation

**User Story:** As a judge, I want the scoring page UI to adapt between live mode and offline mode, so that I can follow organizer control during live sessions and navigate freely when offline.

#### Acceptance Criteria

1. WHEN THE Live_Session is active, THE Judge_Scoring_Page SHALL enter Live_Mode
2. WHILE in Live_Mode, THE Judge_Scoring_Page SHALL display session information including total contestants, current position, and round name
3. WHILE in Live_Mode AND THE Active_Contestant is set, THE Judge_Scoring_Page SHALL emphasize the active contestant's scoring form
4. WHEN no Live_Session exists OR THE session status is 'completed', THE Judge_Scoring_Page SHALL enter Offline_Mode
5. WHILE in Offline_Mode, THE Judge_Scoring_Page SHALL display all contestants in the Scoring_Sheet with standard list layout
6. FOR ALL mode transitions (Live_Mode to Offline_Mode or vice versa), THE Judge_Scoring_Page SHALL preserve any unsaved score drafts in localStorage

### Requirement 6: Session-Aware Division Filtering

**User Story:** As a judge, I want the contestant list to match the active session's division filter during live sessions, so that I only see contestants relevant to the current presentation segment.

#### Acceptance Criteria

1. WHEN THE Live_Session is active AND `current_division_id` is set, THE Judge_Scoring_Page SHALL filter contestants to match the current division
2. WHEN THE current division changes via websocket event AND THE judge is assigned to the new division, THE Judge_Scoring_Page SHALL reload THE Scoring_Sheet for the new division
3. WHEN THE current division changes via websocket event AND THE judge is NOT assigned to the new division, THE Judge_Scoring_Page SHALL display a "Not assigned to this division" message
4. WHEN THE Live_Session has no `current_division_id`, THE Judge_Scoring_Page SHALL display all contestants from all divisions that the judge is assigned to
5. FOR ALL division changes, THE backend `getJudgeScoringSheet` SHALL return contestants filtered by the intersection of the judge's assignments and the requested division

### Requirement 7: Contestant Order Synchronization

**User Story:** As a judge, I want the contestant display order to match the session's contestant order during live sessions, so that the scoring flow aligns with the presentation sequence.

#### Acceptance Criteria

1. WHEN THE Live_Session is active AND `contestant_order` is populated, THE Judge_Scoring_Page SHALL reorder contestants to match the session's `contestant_order` array
2. WHEN THE `contestant_order` changes via websocket event, THE Judge_Scoring_Page SHALL reorder the displayed contestants within 500 milliseconds
3. WHEN no Live_Session exists, THE Judge_Scoring_Page SHALL display contestants ordered by `contestant_number` ascending
4. FOR ALL contestant reordering, THE Judge_Scoring_Page SHALL preserve the scroll position relative to the active contestant if one is set
5. FOR ALL live session contestant orders, THE backend `buildContestantOrder` SHALL filter by the current division when `current_division_id` is set

### Requirement 8: Score Draft Persistence During Mode Transitions

**User Story:** As a judge, I want my draft scores to persist when the session mode changes, so that I don't lose scoring progress when the organizer pauses or resumes the session.

#### Acceptance Criteria

1. WHEN THE judge enters a score for any contestant, THE Judge_Scoring_Page SHALL save the draft score to localStorage immediately
2. WHEN THE session status changes from 'active' to 'paused', THE Judge_Scoring_Page SHALL preserve all draft scores in localStorage
3. WHEN THE session status changes from 'paused' to 'active', THE Judge_Scoring_Page SHALL restore draft scores from localStorage
4. WHEN THE Judge_Scoring_Page reloads for any reason, THE Judge_Scoring_Page SHALL restore draft scores from localStorage
5. WHEN THE judge submits scores successfully, THE Judge_Scoring_Page SHALL clear all draft scores from localStorage

### Requirement 9: Error Handling for Websocket Connection Failures

**User Story:** As a judge, I want to see clear error messages when real-time updates fail, so that I understand why I'm not receiving live session updates.

#### Acceptance Criteria

1. IF THE Websocket_Client fails to connect, THEN THE Judge_Scoring_Page SHALL display a "Connection failed - real-time updates unavailable" warning
2. IF THE Websocket_Client disconnects unexpectedly, THEN THE Judge_Scoring_Page SHALL attempt to reconnect up to 3 times with exponential backoff
3. IF reconnection attempts fail, THEN THE Judge_Scoring_Page SHALL display a "Disconnected - please refresh the page" error message
4. WHEN THE Websocket_Client successfully reconnects, THE Judge_Scoring_Page SHALL fetch the current session state and update the UI
5. FOR ALL websocket errors, THE Judge_Scoring_Page SHALL continue to allow score entry in Offline_Mode

### Requirement 10: Backend Session View API for Judges

**User Story:** As a judge, I want to receive a session-specific view of the competition, so that I see only the information relevant to my current scoring context during live sessions.

#### Acceptance Criteria

1. WHEN a judge requests the session view via `getJudgeSessionView(eventId, judgeId)`, THE backend SHALL return the current Live_Session state if one exists
2. WHEN a Live_Session is active AND Active_Contestant is set, THE backend `getJudgeSessionView` SHALL return the active contestant details including name, photo, and contestant_number
3. WHEN a Live_Session is active, THE backend `getJudgeSessionView` SHALL return the criteria for the current round or event-wide criteria as fallback
4. WHEN a Live_Session is active, THE backend `getJudgeSessionView` SHALL return the judge's existing scores for the active contestant if any exist
5. WHEN no Live_Session exists, THE backend `getJudgeSessionView` SHALL return a message "No active live session" with null session state
6. FOR ALL session view requests, THE backend SHALL verify the judge is enrolled via `assertJudgeEnrolled(eventId, judgeId)` before returning data

### Requirement 11: Frontend Service Layer for Session Integration

**User Story:** As a frontend developer, I want a service layer for session-related API calls, so that the Judge_Scoring_Page can fetch session state and submit session-aware scores consistently.

#### Acceptance Criteria

1. THE frontend `pageantService` SHALL provide a `getSessionView(eventId)` method that calls `GET /api/voter/competition/events/:eventId/session-view`
2. THE frontend `pageantService` SHALL provide a `getActiveSession(eventId)` method that calls `GET /api/organizer/competition/events/:eventId/session/active`
3. THE frontend service methods SHALL use the existing `api` instance with HTTP-only cookie authentication
4. FOR ALL service methods, THE frontend SHALL include CSRF tokens for mutating requests
5. FOR ALL API responses, THE frontend service SHALL handle 401 errors by redirecting to the login page
6. FOR ALL API responses, THE frontend service SHALL return the full Axios response object to callers

### Requirement 12: Real-Time Score Submission Feedback

**User Story:** As a judge, I want to see immediate feedback when I submit scores during a live session, so that I know my submission was received before the organizer advances to the next contestant.

#### Acceptance Criteria

1. WHEN THE judge submits scores during a Live_Session, THE Judge_Scoring_Page SHALL display a loading indicator on the submit button
2. WHEN THE score submission succeeds, THE Judge_Scoring_Page SHALL display a success message within 500 milliseconds
3. WHEN THE score submission fails, THE Judge_Scoring_Page SHALL display the error message returned by the backend
4. WHEN THE score submission fails due to network error, THE Judge_Scoring_Page SHALL offer a "Retry submission" button
5. FOR ALL successful score submissions during Live_Mode, THE backend SHALL emit a `session:judge-score-submitted` event to the organizer
6. FOR ALL score submissions, THE backend SHALL validate that the Active_Contestant matches the contestant being scored

### Requirement 13: Pre-Flight Session Validation

**User Story:** As an organizer, I want the system to validate all prerequisites before allowing session start, so that I cannot start a live session with invalid configurations that will cause failures.

#### Acceptance Criteria

1. WHEN THE organizer attempts to start a Live_Session, THE backend startSession service SHALL validate that at least 1 contestant exists in the event
2. WHEN THE organizer attempts to start a Live_Session, THE backend startSession service SHALL validate that at least 1 active judge is enrolled in the event
3. WHEN THE organizer attempts to start a Live_Session, THE backend startSession service SHALL validate that at least 1 criterion exists in the event
4. WHEN THE organizer attempts to start a Live_Session, THE backend startSession service SHALL calculate the total of all criteria percentages and validate they sum to exactly 100% with a tolerance of ±0.1%
5. WHEN using rounds AND THE organizer attempts to start a Live_Session, THE backend startSession service SHALL validate that at least 1 round exists and is marked as open
6. IF any pre-flight validation fails, THEN THE backend SHALL return a 400 error with a descriptive message indicating which prerequisite is missing or invalid

### Requirement 14: Judge Score Submission Confirmation

**User Story:** As a judge, I want to see a prominent visual confirmation after my scores are successfully submitted, so that I have confidence my scores were saved and I don't attempt duplicate submissions.

#### Acceptance Criteria

1. WHEN auto-save completes successfully for a contestant, THE Judge_Scoring_Page SHALL display a toast notification with a success checkmark icon
2. THE success toast SHALL display the heading "Scores Submitted!" in a prominent font
3. THE success toast SHALL include the contestant name for context to confirm which contestant was scored
4. THE success toast SHALL display the message "Your scores are locked" to indicate immutability
5. THE success toast SHALL auto-dismiss after 3 seconds without requiring user interaction
6. THE success toast SHALL appear in a fixed position at the bottom-right or top-right of the viewport with high z-index to ensure visibility

### Requirement 15: Failed Submission Retry Queue

**User Story:** As a judge, I want failed score submissions to be automatically retried when connection is restored, so that I don't lose scoring progress due to temporary network issues.

#### Acceptance Criteria

1. WHEN auto-save fails due to network error, THE Judge_Scoring_Page SHALL add the failed submission to an in-memory retry queue
2. WHEN auto-save fails due to network error, THE Judge_Scoring_Page SHALL also persist the failed submission to localStorage as a backup
3. WHEN auto-save fails, THE Judge_Scoring_Page SHALL display a prominent error banner at the top of the page (not at the bottom)
4. THE error banner SHALL include a manual "Retry Now" button to allow immediate retry without waiting for automatic reconnection
5. WHEN THE websocket connection is restored, THE Judge_Scoring_Page SHALL automatically attempt to submit all queued submissions in order
6. WHEN a queued submission succeeds, THE Judge_Scoring_Page SHALL remove it from both the in-memory queue and localStorage backup
7. WHEN all queued submissions succeed, THE Judge_Scoring_Page SHALL dismiss the error banner automatically

### Requirement 16: Database Performance Indexes

**User Story:** As a system administrator, I want database indexes on high-traffic query paths, so that the system maintains fast response times with large events involving many judges and contestants.

#### Acceptance Criteria

1. THE database SHALL have an index on competition_sessions(event_id, status) to optimize active session lookups
2. THE database SHALL have a composite index on competition_session_judge_scores(session_id, judge_id, round_id, contestant_id) to optimize score retrieval queries
3. THE database SHALL have a composite index on competition_contestants(event_id, division_id, contestant_number) to optimize contestant ordering and filtering
4. THE database SHALL have a composite index on competition_judge_assignments(event_id, judge_id, scope, scope_id) to optimize judge assignment validation
5. THE database SHALL have a composite index on competition_criteria(event_id, division_id) to optimize criteria loading for divisions
6. THE database SHALL have a composite index on competition_rounds(event_id, category_id, display_order) to optimize round ordering and category filtering

### Requirement 17: Rate Limiting on Score Submissions

**User Story:** As a system administrator, I want rate limiting on score submission endpoints, so that malicious judges cannot spam the API and cause denial-of-service or database overload.

#### Acceptance Criteria

1. THE backend SHALL implement rate limiting middleware on the score submission endpoint limited to 30 submissions per minute per judge
2. WHEN a judge exceeds the rate limit, THE backend SHALL return a 429 status code with the message "Too many score submissions, please slow down"
3. THE rate limiting SHALL apply to both auto-save and manual submit endpoints for consistency
4. THE rate limiting SHALL track submissions per judge_id to prevent one judge from affecting others
5. THE rate limiting window SHALL reset every 60 seconds to allow judges to continue scoring after the limit resets

### Requirement 18: CSRF Protection on Session Control

**User Story:** As a system administrator, I want CSRF token validation on session control endpoints, so that organizer sessions cannot be hijacked through cross-site request forgery attacks.

#### Acceptance Criteria

1. THE backend SHALL validate CSRF tokens on POST /api/organizer/competition/events/:eventId/session/start
2. THE backend SHALL validate CSRF tokens on POST /api/organizer/competition/events/:eventId/session/pause
3. THE backend SHALL validate CSRF tokens on POST /api/organizer/competition/events/:eventId/session/resume
4. THE backend SHALL validate CSRF tokens on POST /api/organizer/competition/events/:eventId/session/complete
5. WHEN a CSRF token is missing or invalid, THE backend SHALL return a 403 status code with a descriptive error message
6. THE frontend SHALL include the CSRF token from cookies in all session control requests

### Requirement 19: Division Selector Auto-Hide Logic

**User Story:** As a judge assigned to only one division, I want the division selector to be automatically hidden and my division auto-selected, so that I don't see unnecessary UI clutter for a choice I don't have.

#### Acceptance Criteria

1. WHEN THE judge is assigned to 2 or more divisions, THE Judge_Scoring_Page SHALL display the division selector dropdown
2. WHEN THE judge is assigned to exactly 1 division, THE Judge_Scoring_Page SHALL auto-select that division and display only the division name as static text (no selector dropdown)
3. WHEN THE judge is assigned to 0 divisions, THE Judge_Scoring_Page SHALL display an error message "You are not assigned to any divisions"
4. THE division selector visibility logic SHALL be computed after loading the Scoring_Sheet to ensure allowed divisions are known
5. FOR ALL cases where the selector is hidden due to single-division assignment, THE Judge_Scoring_Page SHALL still load the Scoring_Sheet filtered by that single division

### Requirement 20: Organizer Dashboard Session Recovery

**User Story:** As an organizer, I want to see a resume banner on my dashboard when an active session exists, so that I don't lose track of ongoing sessions if I close my browser or navigate away.

#### Acceptance Criteria

1. WHEN THE organizer dashboard mounts, THE frontend SHALL check for active sessions for all events owned by the organizer
2. WHEN at least one active session is found, THE dashboard SHALL display a prominent "Resume Active Session" banner at the top of the page
3. THE resume banner SHALL display the event name of the active session
4. THE resume banner SHALL display the current contestant name or number being presented
5. THE resume banner SHALL display the elapsed time since the session started
6. THE resume banner SHALL include a direct link to the /live control page for the event with the active session
7. WHEN the organizer clicks the resume link, THE browser SHALL navigate directly to /organizer/competition/events/:eventId/live

