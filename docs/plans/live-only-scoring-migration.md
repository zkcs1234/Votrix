# Migration Plan: Live-Only Competition Scoring (Non-Destructive)

## 🎯 Goal
Simplify the competition module by removing offline scoring and making live sessions the primary workflow for both organizers and judges.

## ✅ Implementation Status

### Phase 1: Judge Scoring Page - COMPLETED ✅
**File**: `frontend/src/pages/voter/JudgeScoringPage.jsx`

**Changes Made**:
- ✅ Removed dual-mode (offline/live) complexity
- ✅ Changed API from `getScoringSheet()` to `getSessionView()`
- ✅ Changed submission from `submitScores()` to `submitSessionScore()`
- ✅ Removed draft persistence (not needed for live sessions)
- ✅ Added "Waiting for session" state when no active session
- ✅ Kept division support and websocket integration
- ✅ Auto-save functionality uses correct session API
- ✅ Removed offline mode UI and legacy state variables

### Phase 2: Organizer Pages - COMPLETED ✅
**Files Changed**:

1. **`frontend/src/pages/organizer/competition/CompetitionEventsPage.jsx`**
   - ✅ Removed "Open scoring" / "Close scoring" toggle button
   - ✅ Replaced with "Live Control" button that navigates to `/organizer/competition/events/:id/live`
   - ✅ Updated websocket listener from `competition:scoring-toggled` to `session:status-changed`

2. **`frontend/src/pages/organizer/competition/CompetitionDashboardPage.jsx`**
   - ✅ Changed stat label from "Scoring active" to "Active sessions"
   - ✅ Changed stat value from `activeScoring` to `activeSessions`
   - ✅ Updated event list to show session status instead of "Scoring open"
   - ✅ Display: "Live session active" / "Session paused" / "Session ended" based on `sessionStatus`
   - ✅ Updated websocket listener from `competition:scoring-toggled` to `session:status-changed`

3. **`backend/src/services/competition-session.service.js`**
   - ✅ Auto-enable scoring (`scoring_enabled = true`) when `startSession()` is called
   - ✅ Added database update before session creation
   - ✅ Added error handling for scoring enable failure (non-blocking)

### Phase 3: Backend Dashboard Stats - COMPLETED ✅
**File**: `backend/src/services/pageant.service.js`

**Changes Made**:
- ✅ Added `activeSessions` count query (counts active competition_sessions)
- ✅ Changed stat from `activeScoring` to `activeSessions`
- ✅ Added `sessionStatus` field to each event in the events list
- ✅ Query fetches session status from `competition_sessions` table
- ✅ Events now show: `null` (no session), `'active'`, `'paused'`, or `'completed'`

### Phase 4: Testing - TODO 🔲
- Test complete flow: Start session → scoring auto-enabled → judges score → end session

---

## 🎉 Migration Summary

### What Changed:
1. **Judge Scoring Page** - Now uses only live session API, shows "waiting" state when no session active
2. **Events Page** - "Open/Close scoring" toggle replaced with "Live Control" button
3. **Dashboard Page** - Shows "Active sessions" count and session status for each event
4. **Backend** - Starting a session auto-enables scoring

### What Was Removed:
- ❌ Offline/traditional scoring mode from judge page
- ❌ Draft persistence (not needed for live sessions)
- ❌ "Open scoring" / "Close scoring" toggle
- ❌ Dual-mode complexity (500+ lines simplified)

### What Was Kept:
- ✅ Division support
- ✅ Websocket real-time updates
- ✅ Auto-save functionality (now uses correct API)
- ✅ All existing routes and authentication

### New User Flow:
1. Organizer goes to Event → "Live Control"
2. Organizer clicks "Start Session"
3. Backend auto-enables scoring
4. Judges see "Live session active" and can score
5. Scores auto-save as judges enter them
6. Organizer advances through contestants/rounds
7. Organizer clicks "End Session"

### Files Modified (7 total):
- `frontend/src/pages/voter/JudgeScoringPage.jsx`
- `frontend/src/pages/organizer/competition/CompetitionEventsPage.jsx`
- `frontend/src/pages/organizer/competition/CompetitionDashboardPage.jsx`
- `backend/src/services/competition-session.service.js`
- `backend/src/services/pageant.service.js`

### Database Changes:
- ✅ **None required** - All tables already exist from migration 023

## 📦 Files Changed

### Organizer Side (3 files):
1. `CompetitionEventsPage.jsx` - Replace "Open scoring" toggle with "Start Live Session" button
2. `CompetitionDashboardPage.jsx` - Show session status instead of generic "Scoring open"
3. `backend/src/services/competition-session.service.js` - Auto-enable scoring when session starts

### Judge Side (1 file):
4. `JudgeScoringPage.jsx` - Remove offline mode, use only session-based scoring

**Total impact**: 4 files modified (all in-place, no new files, no deleted files)

## 📊 Current Architecture

### Two Scoring Systems:
1. **Offline/Traditional** (`/api/voter/competition/events/:eventId/score`)
   - Uses `judge_scores` table
   - Batch submission (all contestants, all criteria at once)
   - One-time submission with `has_scored` lock
   - ❌ Not suitable for live stage competitions

2. **Live Session** (`/api/voter/competition/events/:eventId/session-score`)
   - Uses `competition_session_judge_scores` table
   - Round-based scoring (scores per contestant per round)
   - Unlocked until session ends (can update scores)
   - ✅ Perfect for live stage competitions

### Problem:
- `JudgeScoringPage` tries to handle BOTH modes
- Complexity: 500+ lines with mode switching logic
- Confusing UX: Judges don't know which mode they're in
- Draft persistence unnecessary for live sessions

## 🚀 Migration Strategy (In-Place Refactoring)

### Phase 1: Backup Current Files ✅

```bash
# Backup judge page
cp frontend/src/pages/voter/JudgeScoringPage.jsx \
   frontend/src/pages/voter/JudgeScoringPage.jsx.backup

# Backup organizer pages
cp frontend/src/pages/organizer/competition/CompetitionEventsPage.jsx \
   frontend/src/pages/organizer/competition/CompetitionEventsPage.jsx.backup
```

### Phase 2: Update Organizer UI - CompetitionEventsPage ✅

**Current Behavior**:
```javascript
// Organizer can toggle "Open scoring" / "Close scoring"
<button onClick={() => toggle(event)}>
  {event.scoringEnabled ? 'Close scoring' : 'Open scoring'}
</button>
```

**New Behavior** - Link scoring to live sessions:
```javascript
// If no session: Show "Start Live Session" button
// If session active: Show "Session Active" badge + "Stop Session" button
// Scoring is automatically enabled when session starts

{!event.activeSession ? (
  <Link to={`/organizer/competition/events/${event.id}/live-control`}>
    <Button size="sm" variant="primary">
      Start Live Session
    </Button>
  </Link>
) : event.activeSession.status === 'active' ? (
  <Badge variant="success">
    Live Session Active
  </Badge>
) : event.activeSession.status === 'paused' ? (
  <Badge variant="warning">
    Session Paused
  </Badge>
) : null}
```

**Benefits**:
- ✅ Clear workflow: Start session = enable scoring
- ✅ No separate "Open scoring" toggle
- ✅ Live session status visible at glance

### Phase 3: Update Backend - Auto-enable scoring with sessions ✅

**File**: `backend/src/services/competition-session.service.js`

**In `startSession()` function**:
```javascript
export async function startSession(eventId, organizerId) {
  await assertCompetitionEvent(eventId, organizerId)
  
  // Check if already active
  const existing = await getActiveSession(eventId)
  if (existing) {
    throw new ApiError(409, 'A live session is already active')
  }

  // Auto-enable scoring when starting session
  await pageantService.setEventScoring(eventId, organizerId, true)
  
  // Create session...
  const { data, error } = await getClient()
    .from('competition_sessions')
    .insert({ event_id: eventId, status: 'active', ... })
  
  // ... rest of function
}
```

**In `completeSession()` function**:
```javascript
export async function completeSession(eventId, organizerId) {
  // ... existing code ...
  
  // Optional: Keep scoring open after session ends
  // so organizers can review, or auto-close it
  // await pageantService.setEventScoring(eventId, organizerId, false)
  
  return session
}
```

### Phase 4: Update CompetitionDashboardPage ✅

**Change status indicators**:
```javascript
// Before
<span className={e.scoringEnabled ? 'text-success' : 'text-subtle'}>
  {e.scoringEnabled ? 'Scoring open' : e.status}
</span>

// After - Show session status instead
<span className={getSessionStatusClass(e.activeSession)}>
  {getSessionStatusText(e.activeSession) || e.status}
</span>

// Helper functions
function getSessionStatusClass(session) {
  if (!session) return 'text-v-text-subtle'
  if (session.status === 'active') return 'text-emerald-400'
  if (session.status === 'paused') return 'text-yellow-400'
  return 'text-v-text-muted'
}

function getSessionStatusText(session) {
  if (!session) return null
  if (session.status === 'active') return 'Live session active'
  if (session.status === 'paused') return 'Session paused'
  if (session.status === 'completed') return 'Session completed'
  return null
}
```

### Phase 5: Simplify JudgeScoringPage.jsx (Keep Same File) ✅

**What to REMOVE**:
- ❌ `liveMode` / `offlineMode` state and switching logic
- ❌ `getDraftKey()` and localStorage draft persistence
- ❌ `handleSubmit()` batch submission function
- ❌ Division selector logic (not needed for session-view)
- ❌ `getScoringSheet()` API call (use `getSessionView()` instead)
- ❌ `submitScores()` API call (use `submitSessionScore()` instead)
- ❌ Offline progress indicators
- ❌ "Submit all scores" button

**What to KEEP**:
- ✅ Same file name: `JudgeScoringPage.jsx`
- ✅ Same route: `/voter/competition/events/:eventId/score`
- ✅ Authentication via `requireEventParticipant(COMPETITION_JUDGE)`
- ✅ `ParticipantInformationGate` integration
- ✅ `VoterEventHeader` component
- ✅ Websocket event handlers
- ✅ Auto-save logic for round criteria

**Simplified State**:
```javascript
const [sessionView, setSessionView] = useState(null)  // From getSessionView()
const [scores, setScores] = useState({})              // Current form state
const [autoSaving, setAutoSaving] = useState(false)   // Save indicator
const [connectionError, setConnectionError] = useState(null)
const [reconnectAttempts, setReconnectAttempts] = useState(0)
```

### Phase 3: Update API Calls in Same File

**Before**:
```javascript
// Mixed mode: getScoringSheet for data, submitScores for offline
pageantService.getScoringSheet(eventId).then(...)
pageantService.submitScores(eventId, payload).then(...)
```

**After** (in same file):
```javascript
// Live-only: getSessionView for data, submitSessionScore for submission
pageantService.getSessionView(eventId).then(...)
pageantService.submitSessionScore(eventId, scores).then(...)
```

### Phase 4: Update UI in Same File

**Changes to render logic**:

1. **Remove offline mode indicators**:
```javascript
// REMOVE
{!liveMode && <div>Offline Mode - Navigate freely</div>}
{!liveMode && <Button onClick={handleSubmit}>Submit all scores</Button>}
```

2. **Always show session status**:
```javascript
// KEEP (simplify)
{sessionView?.session ? (
  <LiveSessionBanner session={sessionView.session} />
) : (
  <WaitingForSessionBanner />
)}
```

3. **Simplify scoring form**:
```javascript
// BEFORE
<CompetitionScoringForm
  sheet={sheet}
  scores={scores}
  onScoreChange={liveMode ? setScore : setScoreDraft}  // Mode switching
  liveMode={liveMode}
  activeContestantId={activeContestantId}
/>

// AFTER
<CompetitionScoringForm
  contestant={sessionView.activeContestant}
  criteria={sessionView.criteria}
  scores={scores}
  onScoreChange={setScore}  // No mode switching
  existingScores={sessionView.existingScores}
/>
```

### Phase 5: Handle "No Session" State

**Add clear messaging when no live session exists**:

```javascript
if (!loading && !sessionView?.session) {
  return (
    <div className="mx-auto max-w-lg v-card p-8 text-center">
      <h2 className="text-xl font-bold text-white mb-4">
        Waiting for Live Session
      </h2>
      <p className="text-v-text-muted mb-6">
        The organizer hasn't started the competition yet. 
        You'll be able to score when the live session begins.
      </p>
      <Link to="/voter" className="text-v-primary">
        ← Back to Dashboard
      </Link>
    </div>
  )
}
```

### Phase 6: Update Backend (No Breaking Changes)

**Keep both endpoints active** for backward compatibility:

1. **Traditional endpoint** (`pageant-judge.controller.js`):
```javascript
export const submitScores = asyncHandler(async (req, res) => {
  // Add check: if session active, reject offline scoring
  const activeSession = await getActiveSession(req.params.eventId).catch(() => null)
  if (activeSession && activeSession.status === 'active') {
    throw new ApiError(
      400,
      'Live session is active. Please use the live scoring interface.'
    )
  }
  
  // Allow offline scoring only when NO session is active
  // This provides a fallback for events not using live sessions
  const scores = validateJudgeScores(req.body)
  const result = await pageantService.submitJudgeScores(...)
  res.json(result)
})
```

2. **Session endpoint** stays unchanged ✅

## 📝 Implementation Steps

### Step 1: Create Backup
```bash
cd frontend/src/pages/voter
cp JudgeScoringPage.jsx JudgeScoringPage.jsx.backup
```

### Step 2: Refactor in Place
- Open `JudgeScoringPage.jsx`
- Remove offline mode state and logic (see Phase 2 above)
- Update API calls to use session endpoints
- Simplify UI to show only live session states
- **Keep same filename and route**

### Step 3: Test
- Login as COMPETITION_JUDGE ✅ (same participant type)
- Navigate to scoring page ✅ (same route)
- Without session: See "Waiting" message
- With session: See contestant and score
- Complete criteria: Auto-save triggers
- Session ends: See completion message

### Step 4: Update Organizer UI
Add clear call-to-action on competition event page:
```javascript
{!activeSession && (
  <Alert variant="info">
    Start a live session to allow judges to score
    <Button onClick={goToLiveControl}>Start Session</Button>
  </Alert>
)}
```

## 🎯 Benefits

### Non-Destructive:
- ✅ Same file, same route, same auth
- ✅ No breaking changes to judge registration
- ✅ No changes to participant types
- ✅ No database migrations needed
- ✅ Easy rollback (just restore backup)

### Simplified:
- ✅ ~300 lines removed (mode switching logic)
- ✅ Single API flow (session-based)
- ✅ Clear UX (no mode confusion)
- ✅ Better for live competitions

## 🔄 Rollback Plan

If issues arise:
```bash
# Restore backup
cd frontend/src/pages/voter
mv JudgeScoringPage.jsx.backup JudgeScoringPage.jsx
```

No other changes needed - routes and auth stay the same!

## 📅 Timeline

- **Day 1**: Create backup, start refactoring
- **Day 2**: Update API calls and UI
- **Day 3**: Test with sample competition
- **Day 4**: Deploy and monitor
- **Day 5**: Remove backup if successful

## ✅ Success Criteria

- [ ] File still at `frontend/src/pages/voter/JudgeScoringPage.jsx`
- [ ] Route still `/voter/competition/events/:eventId/score`
- [ ] Auth still uses `COMPETITION_JUDGE` participant type
- [ ] Judges can score during live sessions
- [ ] Clear message when no session active
- [ ] ~300 fewer lines of code
- [ ] No breaking changes to existing integrations
