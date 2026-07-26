# Competition Module Live Session Enhancement - TODO

## Phase 1: Database

- [x] Create migration `027_competition_live_session.sql`
  - [x] `competition_session_status` enum
  - [x] `competition_sessions` table
  - [x] `judge_session_scores` table
  - [x] Indexes and triggers
- [x] Create rollback migration

## Phase 2: Backend

- [x] Create `competition-session.service.js` - session management logic
- [x] Create `competition-session.controller.js` - session API handlers
- [x] Update `competition-organizer.routes.js` - add session routes
- [x] Update `pageant.service.js` - update judge scoring flow for session support

## Phase 3: Frontend - Services & Hooks

- [x] Create `frontend/src/services/competition-session.service.js`
- [x] Create `frontend/src/hooks/useCompetitionSession.js`

## Phase 4: Frontend - Organizer Live Control Page

- [x] Create `CompetitionLiveControlPage.jsx`
- [x] Update `PageantLayout.jsx` - add live control nav link
- [x] Update `routes/index.jsx` - add routes

## Phase 5: Frontend - Judge Scoring Page Enhancement

- [x] Update `JudgeScoringPage.jsx` - respect active session (round + contestant)
- [x] Update `CompetitionScoringForm.jsx` - per-contestant focused scoring

## Phase 6: Realtime Broadcast Integration

- [x] Add session WebSocket events to ws-emitter
- [x] Integrate realtime updates in frontend hook
