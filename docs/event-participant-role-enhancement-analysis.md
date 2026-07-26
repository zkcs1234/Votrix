# VOTRIX Event-Based Participant Role System Enhancement

## Comprehensive Architecture Analysis & Implementation Plan

---

## Table of Contents

1. [Current System Analysis](#1-current-system-analysis)
2. [Recommended Architecture](#2-recommended-architecture)
3. [Database Migration Plan](#3-database-migration-plan)
4. [API Modification Plan](#4-api-modification-plan)
5. [Frontend Implementation Plan](#5-frontend-implementation-plan)
6. [UX Improvement Plan](#6-ux-improvement-plan)
7. [Security Review](#7-security-review)
8. [Step-by-Step Implementation Roadmap](#8-step-by-step-implementation-roadmap)

---

## 1. Current System Analysis

### 1.1 Current Architecture Overview

VOTRIX currently operates with three global user roles stored in the `users` table:

```
users.role ENUM: 'admin' | 'organizer' | 'voter'
```

All event participants — regardless of whether they are voting, judging, or responding to a poll — share the single **`voter`** global role. The distinction between participation types is handled through:

1. **Event-level enrollment** in the `event_voters` table
2. **Conditional boolean flags** (`is_judge`, `has_voted`, `has_scored`)
3. **Module-specific service logic**

### 1.2 Database Schema (Current)

#### Users Table

```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY,
  username    VARCHAR(64),
  email       VARCHAR(255),
  password    TEXT NOT NULL,
  role        user_role NOT NULL,         -- 'admin', 'organizer', 'voter'
  must_change_password BOOLEAN DEFAULT FALSE,
  account_status ...
);
```

#### Event Voters Table (The central participant table)

```sql
CREATE TABLE event_voters (
  id              UUID PRIMARY KEY,
  event_id        UUID NOT NULL REFERENCES events(id),
  voter_id        UUID NOT NULL REFERENCES users(id),
  has_voted       BOOLEAN DEFAULT FALSE,     -- Used by: Election & Polling
  is_judge        BOOLEAN DEFAULT FALSE,     -- Used by: Competition
  has_scored      BOOLEAN DEFAULT FALSE,     -- Used by: Competition
  first_name      VARCHAR,
  last_name       VARCHAR,
  CONSTRAINT event_voters_unique UNIQUE (event_id, voter_id)
);
```

This table serves **three different modules** with overlapping semantics:

- **Election**: `has_voted` = cast ballot
- **Polling**: `has_voted` = responded to poll
- **Competition**: `is_judge = true`, `has_scored` = submitted scores

#### Invitations Table

```sql
CREATE TABLE invitations (
  id                UUID PRIMARY KEY,
  event_id          UUID NOT NULL,
  voter_id          UUID NOT NULL,
  invitation_sent   BOOLEAN DEFAULT FALSE,
  temp_password     TEXT,
  is_new_account    BOOLEAN DEFAULT TRUE
);
```

#### Competition-Specific Tables (First-Class Judges)

```sql
CREATE TABLE competition_judges (
  id            UUID PRIMARY KEY,
  event_id      UUID NOT NULL,
  user_id       UUID NOT NULL,
  role          VARCHAR,                    -- 'judge', 'head_judge', 'score_reviewer'
  is_active     BOOLEAN DEFAULT TRUE,
  has_submitted BOOLEAN DEFAULT FALSE
);

CREATE TABLE competition_judge_assignments (
  id            UUID PRIMARY KEY,
  judge_id      UUID NOT NULL,
  scope         VARCHAR,                    -- 'event', 'round', 'category'
  scope_id      UUID
);
```

### 1.3 Authentication Flow (Current)

```
1. User submits email + password
2. auth.service.login() → findUserByEmail()
3. Issue JWT with payload:
   {
     sub: user.id,
     role: user.role,              // 'admin', 'organizer', or 'voter'
     accountStatus: 'active',
     mustChangePassword: bool,
     tokenVersion: number
   }
4. authenticate middleware: verifies JWT, attaches req.user
5. authorize(roles): checks req.user.role against allowed roles
```

**Key Observation**: The JWT only carries the **global user role** — it has no awareness of event-specific participant types.

### 1.4 Authorization Flow (Current)

Authorization happens at two levels:

**Level 1 — Route Protection (Middleware):**

```javascript
router.use(authenticate, authorize(USER_ROLES.VOTER), requireActiveAccount);
```

**Level 2 — Service-Level Enforcement:**

```javascript
// Election
async function assertVoterEnrolled(eventId, voterId) {
  // Checks event_voters where event_id=X AND voter_id=Y
  // No participant type distinction
}

// Competition
async function assertJudgeEnrolled(eventId, judgeId) {
  // Checks event_voters where event_id=X AND voter_id=Y AND is_judge=true
}

// Polling
async function assertVoterCanRespond(eventId, voterId) {
  // Checks event_voters where event_id=X AND voter_id=Y
  // No participant type distinction
}
```

**Critical Problem**: There is no consistent, unified way to determine "what is this user's role for THIS event?"

### 1.5 Frontend Routing (Current)

```javascript
// All protected by: allowedRoles={[USER_ROLES.VOTER]}
/voter                                    → VoterDashboardPage
/voter/events/:eventId                    → VoterEventPage (election)
/voter/competition/events/:eventId/score  → JudgeScoringPage (competition)
/voter/polling/events/:eventId            → VoterPollPage (polling)
```

The frontend determines which page to show based on:

1. The URL path (hardcoded per module)
2. Event type from the API response
3. `VoterEventCard` component maps each event to a hardcoded `actionPath`

### 1.6 Current Problems Summary

| #   | Problem                                                   | Impact                                                            |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Single "voter" role for all participant types             | Role semantics are unclear; judges are technically "voters"       |
| 2   | `event_voters` table has mixed concerns                   | Boolean flags (`is_judge`, `has_voted`, `has_scored`) don't scale |
| 3   | No participant type resolution at auth layer              | JWT has no event context; can't determine permissions per event   |
| 4   | Service-level authorization is duplicated                 | Each module implements its own enrollment check                   |
| 5   | No consistent API for "my role in this event"             | Frontend has to infer from event type and URL                     |
| 6   | Adding new event types requires schema changes            | Would need more boolean columns on `event_voters`                 |
| 7   | Participant information forms have no clear storage model | Not clear where event-specific user info should be stored         |

### 1.7 Affected Modules

| Module                 | Impact Level | Details                                                       |
| ---------------------- | ------------ | ------------------------------------------------------------- |
| **Auth Service**       | Medium       | JWT payload needs event context; role resolution logic        |
| **Middleware**         | High         | New middleware for event-participant authorization            |
| **Election Module**    | Low          | Mostly compatible; needs participant_type migration           |
| **Competition Module** | Medium       | Uses `is_judge` flag; needs migration to participant_type     |
| **Polling Module**     | Low          | Uses `event_voters` simply; needs migration                   |
| **Voter Service**      | High         | Dashboard logic needs participant type awareness              |
| **Frontend Routes**    | Medium       | Route protection could be more granular                       |
| **Frontend Dashboard** | Medium       | UX can show participant role per event card                   |
| **Database**           | High         | New `event_participants` table; migration from `event_voters` |

---

## 2. Recommended Architecture

### 2.1 Global User Roles (Keep as-is)

```
ADMIN     → System administrator
ORGANIZER → Creates and manages events
VOTER     → Event participant (renamed semantically from "voter" to "participant")
```

**Decision**: Keep the `user_role` enum as-is. The `voter` value works as the global participant role. Only the **documentation/semantic layer** changes — it represents "event participant" not "election voter."

### 2.2 Event Participant Roles (New)

Introduce a `participant_type` system scoped to **event-level enrollment**, not the user account:

```
event_participants.participant_type ENUM:

  ELECTION_VOTER          → Can cast votes in elections
  COMPETITION_JUDGE       → Can submit scores in competitions
  POLLING_RESPONDENT      → Can answer polls
```

**Design Decision: Use an enum approach initially, but design the system to support a future registry pattern** (similar to how poll question types evolved from enum to registry).

### 2.3 Recommended Schema Design

```sql
-- New unified participant table (replaces and extends event_voters)
CREATE TABLE event_participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_type  participant_type NOT NULL,

  -- Module-specific completion flags
  has_voted         BOOLEAN NOT NULL DEFAULT FALSE,   -- Election
  has_scored        BOOLEAN NOT NULL DEFAULT FALSE,   -- Competition
  has_responded     BOOLEAN NOT NULL DEFAULT FALSE,   -- Polling

  -- Participant metadata
  first_name        VARCHAR(255),
  last_name         VARCHAR(255),
  metadata          JSONB DEFAULT '{}',

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT event_participants_unique UNIQUE (event_id, user_id),
  CONSTRAINT event_participants_type_check CHECK (
    (participant_type = 'ELECTION_VOTER' AND has_voted IS NOT NULL) OR
    (participant_type = 'COMPETITION_JUDGE' AND has_scored IS NOT NULL) OR
    (participant_type = 'POLLING_RESPONDENT' AND has_responded IS NOT NULL)
  )
);
```

### 2.4 Permission Handling Architecture

```
┌─────────────────────────────────────────────────────┐
│                   REQUEST                            │
│  /voter/events/:eventId/vote                        │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│           Layer 1: Global Auth (Middleware)          │
│  authenticate + authorize(USER_ROLES.VOTER)          │
│  → Checks JWT, user exists, role is 'voter'         │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│      Layer 2: Event Participation (New Middleware)    │
│  requireEventParticipant(eventId, 'ELECTION_VOTER')  │
│  → Checks event_participants table                  │
│  → Attaches req.participant { type, status, meta }  │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│      Layer 3: Service-Level Business Rules           │
│  Has voted already? Voting open?                     │
│  → Module-specific checks (no change)               │
└─────────────────────────────────────────────────────┘
```

### 2.5 Where Event Participant Role Resolution Should Happen

**Decision: Resolution at two points:**

1. **Login Time (Light)**: Add `participantTypes` as a summary in the user profile endpoint (NOT in JWT to keep tokens small). This allows the frontend to know: "This user is a judge in 3 competitions, a voter in 2 elections."

2. **Event Selection Time (Full)**: When the user views an event or accesses event-specific routes, the full participant type and permissions are resolved from `event_participants` table.

**Rationale**:

- JWT tokens should stay small — adding all event-participant mappings would bloat them
- Participant type is event-scoped, not user-scoped
- Most users will have 1-3 participant types; but some could have many
- Resolution on event access is simpler and more secure

### 2.6 Multiple Event Assignment Model

```
User: John (role: 'voter')
│
├── Event: Student Council Election
│   └── Participant Type: ELECTION_VOTER
│       └── has_voted: false
│
├── Event: Mr. BISU Competition
│   └── Participant Type: COMPETITION_JUDGE
│       └── has_scored: true
│
└── Event: Student Survey
    └── Participant Type: POLLING_RESPONDENT
        └── has_responded: false
```

**This works because:**

- One `event_participants` row per (event, user) pair
- Each row has exactly one `participant_type`
- User account is shared; no duplication
- No role conflicts since each event has its own participant type
- The `metadata` JSONB column can store additional per-event context

### 2.7 Information Form Integration

```
User Profile (users table)               Event Participant (event_participants.metadata)
────────────────────────────             ────────────────────────────────────────────────
id: uuid                                 event_id: uuid
name: "John"                             participant_type: ELECTION_VOTER
email: "john@example.com"                metadata: {
role: "voter"                              "program": "BSIT",
                                           "yearLevel": "3rd",
                                           "section": "A"
                                         }
                                         ────────────────────────────────────────────────
                                         event_id: uuid
                                         participant_type: COMPETITION_JUDGE
                                         metadata: {
                                           "organization": "BISU-CCS",
                                           "position": "Faculty",
                                           "expertise": "Software Engineering",
                                           "experience": "5 years"
                                         }
```

**Key Insight**: The `metadata` JSONB field on `event_participants` serves as the natural storage location for event-specific participant information forms. This avoids:

- Storing event-specific data on the user profile
- Creating separate information response tables per event type
- Data coupling between unrelated events

### 2.8 Integration with Existing Competition Judge System

The existing `competition_judges` table and `competition_judge_assignments` (Phase 6) are **advanced judge management features** that sit on top of the basic participant assignment. The recommendation is:

- `event_participants` handles **basic enrollment + participant type**
- `competition_judges` continues to handle **advanced features** (roles, scope assignments)
- Link them via `event_participants.id → competition_judges.participant_id`

This preserves the existing competition judge workflow while integrating it into the unified system.

---

## 3. Database Migration Plan

### 3.1 Migration Strategy

**Strategy**: Create-and-migrate (not in-place rename)

1. Create new `event_participants` table
2. Backfill data from existing tables
3. Add triggers/views for backward compatibility
4. Migrate code to use new table
5. Deprecate old `event_voters` table

### 3.2 Migration 029: Create event_participants

```sql
BEGIN;

-- ===========================================================================
-- 1. Enum: participant_type
-- ===========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participant_type') THEN
    CREATE TYPE participant_type AS ENUM (
      'ELECTION_VOTER',
      'COMPETITION_JUDGE',
      'POLLING_RESPONDENT'
    );
  END IF;
END
$$;

-- ===========================================================================
-- 2. Table: event_participants
-- ===========================================================================
CREATE TABLE IF NOT EXISTS event_participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  participant_type  participant_type NOT NULL,

  -- Completion tracking (module-specific)
  has_voted         BOOLEAN NOT NULL DEFAULT FALSE,
  has_scored        BOOLEAN NOT NULL DEFAULT FALSE,
  has_responded     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Metadata
  first_name        VARCHAR(255),
  last_name         VARCHAR(255),
  metadata          JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT event_participants_unique UNIQUE (event_id, user_id)
);

-- ===========================================================================
-- 3. Indexes
-- ===========================================================================
CREATE INDEX idx_event_participants_event_id ON event_participants (event_id);
CREATE INDEX idx_event_participants_user_id ON event_participants (user_id);
CREATE INDEX idx_event_participants_type ON event_participants (participant_type);
CREATE INDEX idx_event_participants_event_user ON event_participants (event_id, user_id);
CREATE INDEX idx_event_participants_metadata ON event_participants USING GIN (metadata);

-- ===========================================================================
-- 4. Trigger: updated_at
-- ===========================================================================
CREATE TRIGGER trg_event_participants_updated_at
  BEFORE UPDATE ON event_participants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================================
-- 5. Backfill: Migrate election voters
-- ===========================================================================
INSERT INTO event_participants (
  event_id,
  user_id,
  participant_type,
  has_voted,
  has_responded,
  has_scored,
  first_name,
  last_name,
  metadata,
  created_at,
  updated_at
)
SELECT
  ev.event_id,
  ev.voter_id,
  CASE
    WHEN ev.is_judge = true THEN 'COMPETITION_JUDGE'::participant_type
    WHEN e.event_type = 'polling' THEN 'POLLING_RESPONDENT'::participant_type
    ELSE 'ELECTION_VOTER'::participant_type
  END,
  CASE
    WHEN e.event_type = 'election' THEN ev.has_voted
    ELSE FALSE
  END,
  CASE
    WHEN e.event_type = 'polling' THEN ev.has_voted
    ELSE FALSE
  END,
  CASE
    WHEN ev.is_judge = true THEN ev.has_scored
    ELSE FALSE
  END,
  ev.first_name,
  ev.last_name,
  '{}'::JSONB,
  ev.created_at,
  ev.updated_at
FROM
  event_voters ev
  JOIN events e ON e.id = ev.event_id
ON CONFLICT (event_id, user_id) DO NOTHING;

-- ===========================================================================
-- 6. Backfill: Migrate competition_judges data into metadata
-- ===========================================================================
UPDATE event_participants ep
SET metadata = jsonb_build_object(
  'judgeRole', cj.role,
  'isActive', cj.is_active,
  'hasSubmitted', cj.has_submitted,
  'judgeRowId', cj.id
)
FROM competition_judges cj
WHERE cj.event_id = ep.event_id
  AND cj.user_id = ep.user_id
  AND ep.participant_type = 'COMPETITION_JUDGE';

-- ===========================================================================
-- 7. Create view for backward compatibility
-- ===========================================================================
CREATE OR REPLACE VIEW v_event_voters AS
SELECT
  ep.id,
  ep.event_id,
  ep.user_id AS voter_id,
  (ep.participant_type = 'ELECTION_VOTER' AND ep.has_voted) OR
  (ep.participant_type = 'POLLING_RESPONDENT' AND ep.has_responded) AS has_voted,
  ep.participant_type = 'COMPETITION_JUDGE' AS is_judge,
  ep.has_scored,
  ep.first_name,
  ep.last_name,
  ep.created_at,
  ep.updated_at
FROM event_participants ep;

COMMIT;
```

### 3.3 Rollback Strategy

```sql
BEGIN;
  DROP VIEW IF EXISTS v_event_voters;
  DROP TABLE IF EXISTS event_participants;
  DROP TYPE IF EXISTS participant_type;
COMMIT;
```

### 3.4 Relationship Diagram

```
users (1) ──────── (N) event_participants (N) ──────── (1) events
  │                                                       │
  │                                                       ├── event_type = 'election' → ELECTION_VOTER
  │                                                       ├── event_type = 'competition_scoring' → COMPETITION_JUDGE
  │                                                       └── event_type = 'polling' → POLLING_RESPONDENT
  │
  └── role: 'voter' (global) ──── semantic: participant
```

---

## 4. API Modification Plan

### 4.1 New Endpoints

#### Participant Endpoints (under `/api/voter`)

```
GET  /api/voter/events/:eventId/my-role
  → Returns: { participantType, hasVoted, hasScored, hasResponded, permissions }

GET  /api/voter/participant-types
  → Returns: [{ eventId, eventTitle, eventType, participantType, status }]
  → Summary of all participant roles for the current user

PATCH /api/voter/events/:eventId/participant-information
  → Body: { metadata: { ...formFields } }
  → Updates the metadata JSONB for this event participant
```

#### Organizer Endpoints (under `/api/organizer/:module`)

```
POST /api/organizer/election/events/:eventId/participants/register
  → Unified participant registration endpoint
  → Body: { email, participantType: 'ELECTION_VOTER', metadata: {...} }

POST /api/organizer/competition/events/:eventId/participants/register
  → Body: { email, participantType: 'COMPETITION_JUDGE', metadata: {...} }

POST /api/organizer/polling/events/:eventId/participants/register
  → Body: { email, participantType: 'POLLING_RESPONDENT', metadata: {...} }

GET  /api/organizer/:module/events/:eventId/participants
  → Unified participant listing
  → Query: ?type=ELECTION_VOTER&status=active
```

### 4.2 Modified Endpoints

#### Voter Overview (Modified)

```
GET /api/voter/overview
  → Enhanced response:
  {
    stats: { total, active, assigned, completed },
    active: [...events with participantType],
    assigned: [...events with participantType],
    completed: [...events with participantType],
    participantSummary: [
      { eventType: 'election', count: 3, participantType: 'ELECTION_VOTER' },
      { eventType: 'competition_scoring', count: 2, participantType: 'COMPETITION_JUDGE' }
    ]
  }
```

#### Voter Login Redirect (Modified)

```
GET /api/voter/login-redirect
  → Returns first active event with participant type info
```

### 4.3 Authorization Changes

#### New Middleware: `requireEventParticipant`

```javascript
/**
 * Middleware factory: Requires the user to be a participant of a specific type
 * in the event identified by req.params.eventId.
 * Attaches req.participant with the participant record.
 */
function requireEventParticipant(...allowedTypes) {
  return async (req, res, next) => {
    try {
      const { eventId } = req.params;
      const participant = await findEventParticipant(eventId, req.user.id);

      if (!participant) {
        throw new ApiError(403, "You are not a participant in this event");
      }

      if (
        allowedTypes.length &&
        !allowedTypes.includes(participant.participant_type)
      ) {
        throw new ApiError(
          403,
          "You do not have the required role for this action",
        );
      }

      req.participant = participant;
      next();
    } catch (error) {
      next(error);
    }
  };
}
```

#### Route Updates

```javascript
// Current (voter.routes.js)
router.use(authenticate, authorize(USER_ROLES.VOTER), requireActiveAccount);

// Enhanced (voter.routes.js)
router.use(authenticate, authorize(USER_ROLES.VOTER), requireActiveAccount);

// Election routes
router.get(
  "/events/:eventId/ballot",
  requireEventParticipant("ELECTION_VOTER"),
  electionCtrl.getBallot,
);

// Competition scoring routes
router.post(
  "/events/:eventId/score",
  requireEventParticipant("COMPETITION_JUDGE"),
  pageantCtrl.submitScores,
);

// Polling routes
router.get(
  "/events/:eventId/poll",
  requireEventParticipant("POLLING_RESPONDENT"),
  pollingCtrl.getPoll,
);
```

### 4.4 Backward Compatibility

Existing `event_voters` references should be migrated to the view `v_event_voters` to ensure backward compatibility during the transition period.

```javascript
// Before
const DB_TABLES.EVENT_VOTERS = 'event_voters';

// After (transition)
const DB_TABLES.EVENT_VOTERS = 'v_event_voters';
const DB_TABLES.EVENT_PARTICIPANTS = 'event_participants';
```

---

## 5. Frontend Implementation Plan

### 5.1 New Route Structure

```javascript
// Enhanced routing with event-participant middleware awareness
{
  path: '/voter',
  element: <ProtectedRoute allowedRoles={[USER_ROLES.VOTER]}>
    <DashboardLayout title="Dashboard" />
  </ProtectedRoute>,
  children: [
    { index: true, element: <VoterDashboardPage /> },
    { path: 'events/:eventId',
      element: <EventParticipantRoute />,  // ← NEW: resolves participant type
      children: [
        // Dynamic child based on participant_type
      ]
    },
  ]
}
```

### 5.2 New Components

#### EventParticipantRoute

```javascript
// Resolves participant type and renders the correct page
function EventParticipantRoute() {
  const { eventId } = useParams();
  const [participantType, setParticipantType] = useState(null);

  useEffect(() => {
    api
      .get(`/voter/events/${eventId}/my-role`)
      .then((res) => setParticipantType(res.data.participantType));
  }, [eventId]);

  const PageComponent = PAGE_MAP[participantType] || NotFoundPage;
  return <PageComponent />;
}

const PAGE_MAP = {
  ELECTION_VOTER: ElectionVotePage,
  COMPETITION_JUDGE: JudgeScoringPage,
  POLLING_RESPONDENT: PollResponsePage,
};
```

#### Enhanced VoterEventCard

```javascript
// Add participant type badge and contextual action
export default function VoterEventCard({ event }) {
  const participantTypeLabel = PARTICIPANT_TYPE_LABELS[event.participantType];

  return (
    <div className="event-card">
      <Badge>{participantTypeLabel}</Badge>{" "}
      {/* NEW: Shows "Judge", "Voter", "Respondent" */}
      <h4>{event.title}</h4>
      <VoterStatusBadge bucket={event.bucket} label={event.statusLabel} />
    </div>
  );
}

const PARTICIPANT_TYPE_LABELS = {
  ELECTION_VOTER: { label: "Voter", color: "indigo" },
  COMPETITION_JUDGE: { label: "Judge", color: "pink" },
  POLLING_RESPONDENT: { label: "Respondent", color: "cyan" },
};
```

### 5.3 Components That Need Modification

| Component            | Change Required                                                |
| -------------------- | -------------------------------------------------------------- |
| `VoterDashboardPage` | Add participant type summary; show type badges per event       |
| `VoterEventCard`     | Add participant type badge; contextual action labels           |
| `VoterEventPage`     | Accept participant type context (already election-specific)    |
| `JudgeScoringPage`   | Accept participant type context (already competition-specific) |
| `VoterPollPage`      | Accept participant type context (already polling-specific)     |
| `ProtectedRoute`     | No change needed (still checks global role)                    |
| `DashboardLayout`    | No change needed                                               |

### 5.4 Components That Can Remain Untouched

| Component         | Reason                                                 |
| ----------------- | ------------------------------------------------------ |
| Admin pages       | No participant concept for admins                      |
| Organizer pages   | Organizers manage participants; they don't participate |
| Auth components   | Auth flow unchanged                                    |
| Layout components | Shared layout structure unchanged                      |

### 5.5 State Management

```javascript
// Enhanced auth store with participant context
const useAuthStore = create((set, get) => ({
  user: null,
  participantRoles: [], // NEW: [{ eventId, eventTitle, eventType, participantType }]

  setSession({ user, csrfToken, participantRoles }) {
    // ... existing logic
    set({ participantRoles: participantRoles ?? [] });
  },

  getParticipantType(eventId) {
    return get().participantRoles.find((p) => p.eventId === eventId)
      ?.participantType;
  },
}));
```

---

## 6. UX Improvement Plan

### 6.1 Participant Experience

#### Current Flow:

```
Login → Voter Dashboard (shows all assigned events mixed together)
```

#### Recommended Flow:

```
Login → Participant Dashboard

  ┌──────────────────────────────────────────────┐
  │  Welcome, John                               │
  │                                              │
  │  Your Roles:                                  │
  │  🗳️  Voter      - 2 active elections        │
  │  ⚖️  Judge      - 1 active competition      │
  │  📊 Respondent  - 1 active poll              │
  │                                              │
  │  Active Now:                                  │
  │  ┌──────────────────────────────────────┐    │
  │  │ Student Council Election             │    │
  │  │ 🗳️  Your role: Voter                │    │
  │  │ Voting is open → Cast Vote           │    │
  │  └──────────────────────────────────────┘    │
  │                                              │
  │  ┌──────────────────────────────────────┐    │
  │  │ Mr. BISU Competition                │    │
  │  │ ⚖️  Your role: Judge                │    │
  │  │ Scoring is open → Score Contestants  │    │
  │  └──────────────────────────────────────┘    │
  └──────────────────────────────────────────────┘
```

**Key Improvement**: Show the user's **role badge** on each event card, so they immediately understand what they're supposed to do for each event.

### 6.2 Organizer Experience

#### Current Flow:

```
Create Event → Manage Participants (module-specific pages)
```

#### Recommended Flow:

```
Create Event → Manage Participants

  Unified Participant Management:
  ┌──────────────────────────────────────────────┐
  │  Add Participant                             │
  │  Email: ___________________________          │
  │  Role:  [ELECTION_VOTER ▼]                  │
  │         ELECTION_VOTER                       │
  │         COMPETITION_JUDGE                    │
  │         POLLING_RESPONDENT                   │
  │                                              │
  │  Additional Info:                            │
  │  (dynamic form based on selected role)       │
  │                                              │
  │  [Register]  [Register & Invite]             │
  └──────────────────────────────────────────────┘
```

**Key Improvement**: The organizer explicitly selects the **participant type** when adding someone. The form dynamically shows relevant fields based on type.

### 6.3 Module-Specific Flavors

The participant type flows into the module-specific workflows:

| Participant Type   | Dashboard Label | Action Button       | Module Page   |
| ------------------ | --------------- | ------------------- | ------------- |
| ELECTION_VOTER     | "Voter"         | "Cast Vote"         | Voting ballot |
| COMPETITION_JUDGE  | "Judge"         | "Score Contestants" | Scoring form  |
| POLLING_RESPONDENT | "Respondent"    | "Take Poll"         | Poll form     |

### 6.4 Event Selection UX

When a user has multiple events of different types:

**Approach: Dashboard-First (Recommended)**

```
Login → Dashboard (shows ALL events grouped by status, with role badge per card)
         ↓ click on card
         Event page (automatically opens correct module based on participant_type)
```

**Rationale**: This approach:

- Requires no additional clicks for single-event users
- Works naturally with the existing flow
- Is intuitive — "I see my events, I click the one I want to participate in"
- The role badge on the card provides clarity without complexity

---

## 7. Security Review

### 7.1 Risks Assessment

| #   | Risk                                                | Severity | Mitigation                                                                                                         |
| --- | --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | User accesses event they're not assigned to         | High     | `requireEventParticipant` middleware checks db. Also enforced at service level.                                    |
| 2   | Election voter accesses judge features              | High     | Participant type check prevents this. Voter → `ELECTION_VOTER` can't call judge endpoints.                         |
| 3   | Judge submits scores for wrong competition          | High     | `event_id` scoping in participant check ensures judge is enrolled in THAT specific event.                          |
| 4   | Respondent modifies previous responses              | Medium   | Multiple-submission flag controlled by organizer (`poll_allow_multiple_submissions`).                              |
| 5   | User creates duplicate accounts for different roles | Low      | Unified `user_id` in `event_participants` prevents this. Same user, different types per event.                     |
| 6   | Participant type tampering via API                  | Medium   | `participant_type` is set at registration time by organizer, not accepted from user input in vote/score endpoints. |
| 7   | Information form metadata tampering                 | Low      | Metadata updates should be restricted to organizer-set fields or validated against a schema.                       |

### 7.2 Authorization Rules Matrix

```
                    │ Can Access       │ Can Cast    │ Can Submit  │ Can Answer
                    │ Event Page       │ Vote        │ Scores      │ Poll
────────────────────┼──────────────────┼─────────────┼─────────────┼────────────
ELECTION_VOTER      │ ✅ YES           │ ✅ YES      │ ❌ NO       │ ❌ NO
COMPETITION_JUDGE   │ ✅ YES           │ ❌ NO       │ ✅ YES      │ ❌ NO
POLLING_RESPONDENT  │ ✅ YES           │ ❌ NO       │ ❌ NO       │ ✅ YES
Not Enrolled        │ ❌ NO            │ ❌ NO       │ ❌ NO       │ ❌ NO
```

### 7.3 Database Constraints

```sql
-- Ensure participant_type is consistent with event type at insert time
CREATE OR REPLACE FUNCTION fn_validate_participant_event_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.participant_type = 'ELECTION_VOTER' AND
     NOT EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND event_type = 'election') THEN
    RAISE EXCEPTION 'ELECTION_VOTER can only be assigned to election events';
  END IF;

  IF NEW.participant_type = 'COMPETITION_JUDGE' AND
     NOT EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND event_type IN ('pageant', 'competition_scoring')) THEN
    RAISE EXCEPTION 'COMPETITION_JUDGE can only be assigned to competition events';
  END IF;

  IF NEW.participant_type = 'POLLING_RESPONDENT' AND
     NOT EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND event_type = 'polling') THEN
    RAISE EXCEPTION 'POLLING_RESPONDENT can only be assigned to polling events';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 7.4 API-Level Protection

```javascript
// The participant type is NOT accepted from request body in vote/score endpoints
// It is resolved from the database via req.participant

// ❌ BAD: Accepting participant type from user
router.post("/events/:eventId/vote", (req, res) => {
  const { participantType } = req.body; // NEVER do this
});

// ✅ GOOD: Resolving from database
router.post(
  "/events/:eventId/vote",
  requireEventParticipant("ELECTION_VOTER"), // middleware checks DB
  (req, res) => {
    // req.participant.participant_type is trusted
  },
);
```

---

## 8. Step-by-Step Implementation Roadmap

### Phase 1: Analysis (Week 1)

- [x] Analyze current architecture (this document)
- [x] Identify problems and affected modules
- [x] Design architecture for event participant roles
- [ ] Review with team
- [ ] Finalize approach

### Phase 2: Database Changes (Week 2)

#### Step 2.1 — Create Migration 029

- [ ] Create `participant_type` enum
- [ ] Create `event_participants` table
- [ ] Add indexes
- [ ] Create backfill migration from `event_voters`
- [ ] Create `v_event_voters` backward-compatibility view

#### Step 2.2 — Add Constraints

- [ ] Add trigger for participant-type-to-event-type validation
- [ ] Add unique constraint on (event_id, user_id)

#### Step 2.3 — Rollback Script

- [ ] Create down migration

### Phase 3: Backend Changes (Week 3)

#### Step 3.1 — Core Services

- [ ] Create `participant.service.js` with:
  - `findEventParticipant(eventId, userId)`
  - `listUserParticipantRoles(userId)`
  - `registerParticipant(eventId, userId, participantType, metadata)`
  - `updateParticipantInformation(eventId, userId, metadata)`
- [ ] Add `DB_TABLES.EVENT_PARTICIPANTS` constant

#### Step 3.2 — Middleware

- [ ] Create `requireEventParticipant(...types)` middleware
- [ ] Export from `auth.js`

#### Step 3.3 — API Endpoints

- [ ] `GET /voter/events/:eventId/my-role`
- [ ] `GET /voter/participant-types`
- [ ] `PATCH /voter/events/:eventId/participant-information`

#### Step 3.4 — Route Updates

- [ ] Update `voter.routes.js` to use `requireEventParticipant`
- [ ] Update `election-voter.routes.js`
- [ ] Update `pageant-judge.routes.js`
- [ ] Update `polling-voter.routes.js`

#### Step 3.5 — Service Updates

- [ ] Update `voter.service.js` to include `participantType` in dashboard data
- [ ] Update `election.service.js` to use `event_participants`
- [ ] Update `pageant.service.js` to use `event_participants`
- [ ] Update `polling.service.js` to use `event_participants`

#### Step 3.6 — Organizer Registration

- [ ] Create unified participant registration endpoints
- [ ] Update existing register endpoints to set `participant_type`
- [ ] Ensure backward compatibility

### Phase 4: Frontend Changes (Week 4)

#### Step 4.1 — Constants & Services

- [ ] Add `PARTICIPANT_TYPES` constants: `{ ELECTION_VOTER, COMPETITION_JUDGE, POLLING_RESPONDENT }`
- [ ] Add `PARTICIPANT_TYPE_LABELS` for display
- [ ] Add API methods in `voter.service.js`:
  - `getMyRole(eventId)`
  - `getParticipantTypes()`

#### Step 4.2 — Auth Store Enhancement

- [ ] Add `participantRoles` to store
- [ ] Add `getParticipantType(eventId)` helper

#### Step 4.3 — Component Updates

- [ ] Update `VoterEventCard` to show participant type badge
- [ ] Update `VoterDashboardPage` to show participant role summary
- [ ] Use `PARTICIPANT_TYPE_ICON` for contextual icons per event card

#### Step 4.4 — Event Participant Route (Optional)

- [ ] Create `EventParticipantRoute` component
- [ ] If desired, simplify route config to use dynamic routing

### Phase 5: Testing (Week 5)

#### Step 5.1 — Unit Tests

- [ ] Test `participant.service.js`
- [ ] Test `requireEventParticipant` middleware
- [ ] Test participant type validation

#### Step 5.2 — API Tests

- [ ] Test new endpoints
- [ ] Test modified endpoints
- [ ] Test authorization rules

#### Step 5.3 — Integration Tests

- [ ] Test multi-event participant scenarios
- [ ] Test backward compatibility with `v_event_voters`
- [ ] Test edge cases (user with 5+ participant roles)

#### Step 5.4 — Frontend Tests

- [ ] Test component rendering with participant types
- [ ] Test dashboard with mixed event types

### Phase 6: Deployment (Week 6)

#### Step 6.1 — Migration

- [ ] Run database migration 029
- [ ] Verify backfill data
- [ ] Monitor for errors

#### Step 6.2 — Backend Deployment

- [ ] Deploy backend changes
- [ ] Verify API endpoints
- [ ] Monitor auth flow

#### Step 6.3 — Frontend Deployment

- [ ] Deploy frontend changes
- [ ] Verify dashboard rendering
- [ ] Verify event access flow

#### Step 6.4 — Post-Deployment

- [ ] Monitor logs
- [ ] Verify backward compatibility
- [ ] Address any issues

---

## Appendix A: Existing Tables That DO NOT Need Changes

```
users                 → Unchanged (global role stays)
organizations         → Unchanged
events                → Unchanged (event_type already used for routing)
positions             → Unchanged
candidates            → Unchanged
contestants           → Unchanged
criteria              → Unchanged
judge_scores          → Unchanged
poll_questions        → Unchanged
poll_answers          → Unchanged
invitations           → Unchanged
password_reset_tokens → Unchanged
audit_logs            → Unchanged
notifications         → Unchanged
system_settings       → Unchanged
```

## Appendix B: Existing Tables That Need Migration Awareness

```
event_voters          → DATA migrates to event_participants
                      → View v_event_voters for backward compat

competition_judges    → metadata merges into event_participants
                      → Table stays for advanced features

competition_judge_assignments → Unchanged (advanced feature)
```

## Appendix C: Participant Type vs Event Type Mapping

```
events.event_type     → event_participants.participant_type
──────────────────────────────────────────────────
'election'            → 'ELECTION_VOTER'
'pageant'             → 'COMPETITION_JUDGE'  (legacy)
'competition_scoring' → 'COMPETITION_JUDGE'
'polling'             → 'POLLING_RESPONDENT'
```

## Appendix D: JWT Token Size Analysis

Current JWT payload size (approximate):

```
{
  sub: "uuid-string",              // 36 chars
  role: "voter",                    // 5 chars
  email: "user@example.com",       // ~20 chars
  accountStatus: "active",         // 6 chars
  mustChangePassword: false,        // ~5 chars
  tokenVersion: 0                   // 1 char
}
// Total: ~100-120 bytes
```

If we added participant roles to JWT:

```
{
  ...existing,
  participantRoles: [
    { eid: "uuid", pt: "ELECTION_VOTER" },         // ~60 chars each
    { eid: "uuid", pt: "COMPETITION_JUDGE" },       // ~60 chars each
    { eid: "uuid", pt: "POLLING_RESPONDENT" }       // ~60 chars each
  ]
}
// Total: ~300+ bytes for 3 roles
```

**Decision**: Do NOT include participant roles in JWT. Keep token small. Resolve from database when needed.

---

_Analysis completed by BLACKBOXAI_
_Date: 2025_
_Based on VOTRIX Phase 12 codebase_
