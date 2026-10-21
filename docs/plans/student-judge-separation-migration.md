# Student-Judge Separation Migration Plan

## Executive Summary

**Goal:** Simplify participant management from a complex multi-type system to a clear two-category system:
- **Students** - Automatically eligible for BOTH election voting AND poll responding
- **Judges** - Only for competition judging (mutually exclusive with Student)

**Impact:** 
- Removes `user_participant_types` table and membership complexity
- Simplifies UI from 3 tabs to 2 tabs
- Clearer separation of concerns
- Safer data model (no type conflicts)

---

## Current State vs New State

### Current System (Complex)
```
Participant Types (Multi-Type Membership):
├─ ELECTION_VOTER ────────┐
├─ POLLING_RESPONDENT ────┼─ Can overlap (via user_participant_types)
└─ COMPETITION_JUDGE ─────┘

Problems:
❌ Same student data split across Voter/Respondent
❌ Judge can also be Voter/Respondent (confusing)
❌ Complex membership table management
❌ "Remove from pool" confusion
```

### New System (Simple)
```
Participant Categories (Mutually Exclusive):
├─ STUDENT ────> Auto-eligible for: Election Voting + Poll Responding
└─ JUDGE ─────> Only for: Competition Judging

Benefits:
✅ One account type per user (clear identity)
✅ Student automatically participates in both voting/polling
✅ No membership management needed
✅ No "remove from pool" confusion
✅ Simpler UI and code
```

---

## Data Model Changes

### Database Schema

#### Old Structure
```sql
-- Complex membership system
CREATE TABLE user_participant_types (
  user_id UUID,
  participant_type VARCHAR(32), -- ELECTION_VOTER, POLLING_RESPONDENT, COMPETITION_JUDGE
  is_active BOOLEAN,
  PRIMARY KEY (user_id, participant_type)
);

-- User can have multiple types
-- Requires joins to check eligibility
```

#### New Structure
```sql
-- Simple category field on users table
ALTER TABLE users ADD COLUMN participant_category VARCHAR(20);

-- Only two values:
-- 'STUDENT' - Can vote AND respond to polls
-- 'JUDGE' - Can only judge competitions

-- Constraints:
-- - participant_category NOT NULL (for role='participant')
-- - participant_category NULL (for role='organizer' or 'admin')
-- - Check constraint: participant_category IN ('STUDENT', 'JUDGE')
```

### Migration SQL

```sql
-- Step 1: Add new column
ALTER TABLE users 
ADD COLUMN participant_category VARCHAR(20);

-- Step 2: Backfill existing users
-- Users with ELECTION_VOTER or POLLING_RESPONDENT → STUDENT
UPDATE users u
SET participant_category = 'STUDENT'
WHERE role = 'participant'
  AND EXISTS (
    SELECT 1 FROM user_participant_types upt
    WHERE upt.user_id = u.id
      AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT')
      AND upt.is_active = true
  );

-- Users with ONLY COMPETITION_JUDGE → JUDGE
UPDATE users u
SET participant_category = 'JUDGE'
WHERE role = 'participant'
  AND EXISTS (
    SELECT 1 FROM user_participant_types upt
    WHERE upt.user_id = u.id
      AND upt.participant_type = 'COMPETITION_JUDGE'
      AND upt.is_active = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM user_participant_types upt
    WHERE upt.user_id = u.id
      AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT')
      AND upt.is_active = true
  );

-- Step 3: Handle edge cases (users with both Student and Judge types)
-- DECISION NEEDED: How to handle?
-- Option A: Keep as STUDENT (they're affiliated with school)
-- Option B: Create conflict report for manual review
-- RECOMMENDED: Option A

-- Mark users with BOTH as STUDENT (school affiliation takes precedence)
UPDATE users u
SET participant_category = 'STUDENT'
WHERE role = 'participant'
  AND participant_category IS NULL
  AND EXISTS (
    SELECT 1 FROM user_participant_types upt
    WHERE upt.user_id = u.id AND upt.is_active = true
  );

-- Step 4: Verify no nulls remain for participants
SELECT id, email, first_name, last_name
FROM users
WHERE role = 'participant'
  AND participant_category IS NULL;
-- If any results, investigate and fix

-- Step 5: Add NOT NULL constraint
ALTER TABLE users
ALTER COLUMN participant_category SET NOT NULL
WHERE role = 'participant';

-- Step 6: Add check constraint
ALTER TABLE users
ADD CONSTRAINT chk_participant_category 
CHECK (
  (role = 'participant' AND participant_category IN ('STUDENT', 'JUDGE'))
  OR (role != 'participant' AND participant_category IS NULL)
);

-- Step 7: Archive old membership table (don't drop yet, for safety)
ALTER TABLE user_participant_types RENAME TO user_participant_types_legacy;

-- Step 8: Create indexes
CREATE INDEX idx_users_participant_category 
ON users (participant_category) 
WHERE role = 'participant';
```

---

## Backend Changes

### 1. Constants Update

```javascript
// backend/src/utils/constants.js

// OLD (remove these)
export const PARTICIPANT_TYPES = {
  ELECTION_VOTER: 'ELECTION_VOTER',
  POLLING_RESPONDENT: 'POLLING_RESPONDENT',
  COMPETITION_JUDGE: 'COMPETITION_JUDGE',
}

// NEW
export const PARTICIPANT_CATEGORY = {
  STUDENT: 'STUDENT',
  JUDGE: 'JUDGE',
}

// For backward compatibility during transition
export const LEGACY_TYPE_TO_CATEGORY = {
  ELECTION_VOTER: 'STUDENT',
  POLLING_RESPONDENT: 'STUDENT',
  COMPETITION_JUDGE: 'JUDGE',
}
```

### 2. User Service Updates

```javascript
// backend/src/services/user.service.js

// OLD
export async function createParticipantUser(data) {
  const user = await db().from('users').insert({
    email: data.email,
    // ... other fields
  })
  
  // Then add to user_participant_types
  await addParticipantTypeMembership(user.id, 'ELECTION_VOTER')
}

// NEW - Much simpler!
export async function createStudent(data) {
  const { data: user, error } = await db()
    .from('users')
    .insert({
      email: data.email,
      first_name: data.firstName,
      last_name: data.lastName,
      school_id: data.schoolId,
      program: data.program,
      year_section: data.yearSection,
      role: 'participant',
      participant_category: 'STUDENT', // ← Direct field
      account_status: 'active',
      password: hashedPassword,
      must_change_password: true,
    })
    .select()
    .single()

  if (error) throw new ApiError(500, error.message)
  return user
}

export async function createJudge(data) {
  const { data: user, error } = await db()
    .from('users')
    .insert({
      email: data.email,
      first_name: data.firstName,
      last_name: data.lastName,
      role: 'participant',
      participant_category: 'JUDGE', // ← Direct field
      account_status: 'active',
      password: hashedPassword,
      must_change_password: true,
      profile_data: data.profileData, // title, affiliation, expertise
    })
    .select()
    .single()

  if (error) throw new ApiError(500, error.message)
  return user
}
```

### 3. Participant Service Simplification

```javascript
// backend/src/services/admin-participant.service.js

// OLD - Complex with membership management
export async function listVoters() {
  return db()
    .from('users')
    .select('*, user_participant_types!inner(*)')
    .eq('user_participant_types.participant_type', 'ELECTION_VOTER')
    .eq('user_participant_types.is_active', true)
}

export async function listRespondents() {
  return db()
    .from('users')
    .select('*, user_participant_types!inner(*)')
    .eq('user_participant_types.participant_type', 'POLLING_RESPONDENT')
    .eq('user_participant_types.is_active', true)
}

// NEW - Direct and simple!
export async function listStudents() {
  const { data, error } = await db()
    .from('users')
    .select('*')
    .eq('role', 'participant')
    .eq('participant_category', 'STUDENT')
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)
  return data.map(sanitizeUser)
}

export async function listJudges() {
  const { data, error } = await db()
    .from('users')
    .select('*')
    .eq('role', 'participant')
    .eq('participant_category', 'JUDGE')
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)
  return data.map(sanitizeUser)
}

// REMOVED - No longer needed!
// - removeVoterMembership()
// - removeRespondentMembership()
// - addParticipantTypeMembership()
// - setParticipantTypeMembership()
// - hasParticipantTypeMembership()
```

### 4. Eligibility Checks Simplified

```javascript
// backend/src/services/participant.service.js

// OLD - Complex membership check
export async function canUserVoteInElection(userId, electionId) {
  const hasVoterType = await hasParticipantTypeMembership(userId, 'ELECTION_VOTER')
  if (!hasVoterType) return false
  
  const isEnrolled = await isUserEnrolledInEvent(userId, electionId, 'ELECTION_VOTER')
  return isEnrolled
}

// NEW - Direct category check
export async function canUserVoteInElection(userId, electionId) {
  const user = await findUserById(userId)
  
  if (user.participant_category !== 'STUDENT') {
    return false // Only students can vote
  }
  
  const isEnrolled = await isUserEnrolledInEvent(userId, electionId)
  return isEnrolled
}

export async function canUserRespondToPoll(userId, pollId) {
  const user = await findUserById(userId)
  
  if (user.participant_category !== 'STUDENT') {
    return false // Only students can respond to polls
  }
  
  const isEnrolled = await isUserEnrolledInEvent(userId, pollId)
  return isEnrolled
}

export async function canUserJudgeCompetition(userId, competitionId) {
  const user = await findUserById(userId)
  
  if (user.participant_category !== 'JUDGE') {
    return false // Only judges can judge competitions
  }
  
  const isAssigned = await isJudgeAssignedToCompetition(userId, competitionId)
  return isAssigned
}
```

### 5. Controller Updates

```javascript
// backend/src/controllers/admin.controller.js

// OLD - Multiple endpoints
router.post('/voters', createVoter)
router.post('/respondents', createRespondent)
router.post('/judges', createJudge)

// NEW - Two clear endpoints
router.post('/students', createStudent)
router.post('/judges', createJudge)

export const createStudent = asyncHandler(async (req, res) => {
  const { email, firstName, lastName, schoolId, program, yearSection } = req.body

  // Validation
  if (!schoolId || !program || !yearSection) {
    throw new ApiError(400, 'School ID, Program, and Year/Section are required for students')
  }

  // Check for existing user
  const existing = await findUserByEmail(email)
  if (existing) {
    throw new ApiError(409, 'A user with this email already exists')
  }

  // Create student
  const user = await createStudentUser({
    email,
    firstName,
    lastName,
    schoolId,
    program,
    yearSection,
  })

  // Send welcome email
  const emailResult = await sendStudentWelcomeEmail(user)

  // Audit log
  await createAuditLog({
    userId: req.user.id,
    action: 'CREATE_STUDENT',
    entity: 'participant',
    entityId: user.id,
    details: { email: user.email, category: 'STUDENT' },
  })

  res.status(201).json({
    success: true,
    user: sanitizeUser(user),
    email: emailResult,
  })
})

export const createJudge = asyncHandler(async (req, res) => {
  const { email, firstName, lastName, profileData } = req.body

  // Check for existing user
  const existing = await findUserByEmail(email)
  if (existing) {
    throw new ApiError(409, 'A user with this email already exists')
  }

  // Create judge
  const user = await createJudgeUser({
    email,
    firstName,
    lastName,
    profileData, // { title, affiliation, expertise }
  })

  // Send welcome email
  const emailResult = await sendJudgeWelcomeEmail(user)

  // Audit log
  await createAuditLog({
    userId: req.user.id,
    action: 'CREATE_JUDGE',
    entity: 'participant',
    entityId: user.id,
    details: { email: user.email, category: 'JUDGE' },
  })

  res.status(201).json({
    success: true,
    user: sanitizeUser(user),
    email: emailResult,
  })
})
```

---

## Frontend Changes

### 1. Updated Page Structure

```javascript
// frontend/src/pages/admin/UserManagementPage.jsx

// OLD - 3 tabs under Participants
const participantTypes = [
  { id: 'election-voter', label: 'Election Voters' },
  { id: 'competition-judge', label: 'Competition Judges' },
  { id: 'polling-respondent', label: 'Polling Respondents' },
]

// NEW - 2 clear categories
const participantCategories = [
  { id: 'students', label: 'Students', icon: GraduationCap },
  { id: 'judges', label: 'Competition Judges', icon: Trophy },
]

export default function UserManagementPage() {
  const [tab, setTab] = useState('organizers')
  const [category, setCategory] = useState('students')

  return (
    <div className="space-y-6">
      <Tabs 
        tabs={[
          { value: 'organizers', label: 'Organizers' },
          { value: 'participants', label: 'Participants' },
        ]} 
        value={tab} 
        onChange={setTab} 
      />

      {tab === 'participants' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="v-section-title">Participant Category</h2>
              <p className="v-caption">
                Students can vote and respond to polls. 
                Judges can only score competitions.
              </p>
            </div>
            <Tabs
              tabs={participantCategories}
              value={category}
              onChange={setCategory}
              variant="segmented"
            />
          </div>

          {category === 'students' && <StudentsPanel />}
          {category === 'judges' && <JudgesPanel />}
        </div>
      )}
    </div>
  )
}
```

### 2. New StudentsPanel Component

```javascript
// frontend/src/components/admin/StudentsPanel.jsx

export default function StudentsPanel() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // 'add' | 'edit'

  useEffect(() => {
    fetchStudents()
  }, [])

  const fetchStudents = async () => {
    try {
      const { data } = await adminService.listStudents()
      setStudents(data.students || [])
    } catch (err) {
      toastError('Failed to load students')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Students"
        description="Students can participate in elections and polls"
        actions={
          <Button onClick={() => setModal('add')}>
            <UserPlus className="h-4 w-4" />
            Add Student
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Students" value={students.length} icon={Users} />
        <StatCard 
          label="Active" 
          value={students.filter(s => s.accountStatus === 'active').length} 
          icon={UserCheck} 
        />
        <StatCard 
          label="Suspended" 
          value={students.filter(s => s.accountStatus === 'suspended').length} 
          icon={ShieldOff} 
        />
      </div>

      {/* Table */}
      <Card>
        <table className="v-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>School ID</th>
              <th>Program</th>
              <th>Year/Section</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {students.map(student => (
              <tr key={student.id}>
                <td>{student.firstName} {student.lastName}</td>
                <td>{student.email}</td>
                <td>{student.schoolId}</td>
                <td>{student.program}</td>
                <td>{student.yearSection}</td>
                <td><Badge tone={getStatusTone(student.accountStatus)}>{student.accountStatus}</Badge></td>
                <td>
                  <StudentActionsMenu student={student} onUpdate={fetchStudents} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Modals */}
      {modal === 'add' && (
        <StudentFormModal
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchStudents() }}
        />
      )}
    </div>
  )
}
```

### 3. Simplified Actions Menu

```javascript
// frontend/src/components/admin/StudentActionsMenu.jsx

export default function StudentActionsMenu({ student, onUpdate }) {
  const [action, setAction] = useState(null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setAction('edit')}>
            <Pencil className="h-4 w-4" />
            Edit Information
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem 
            onClick={() => setAction('suspend')}
            className={student.accountStatus === 'active' ? 'text-v-danger' : ''}
          >
            <ShieldOff className="h-4 w-4" />
            {student.accountStatus === 'active' ? 'Suspend Account' : 'Reinstate Account'}
          </DropdownMenuItem>

          {student.accountStatus !== 'archived' && (
            <DropdownMenuItem onClick={() => setAction('archive')}>
              <Archive className="h-4 w-4" />
              Archive Account
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setAction('convert')}>
            <ArrowRightLeft className="h-4 w-4" />
            Convert to Judge
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Action Modals */}
      {action === 'convert' && (
        <ConvertToJudgeModal
          student={student}
          onClose={() => setAction(null)}
          onSuccess={() => { setAction(null); onUpdate() }}
        />
      )}
      {/* Other modals... */}
    </>
  )
}
```

### 4. Convert Category Feature

```javascript
// frontend/src/components/admin/ConvertToJudgeModal.jsx

export default function ConvertToJudgeModal({ student, onClose, onSuccess }) {
  const [form, setForm] = useState({
    title: '',
    affiliation: '',
    expertise: '',
  })
  const [converting, setConverting] = useState(false)

  const handleConvert = async () => {
    setConverting(true)
    try {
      await adminService.convertStudentToJudge(student.id, form)
      success('Student converted to Judge successfully')
      onSuccess()
    } catch (err) {
      toastError(getErrorMessage(err))
    } finally {
      setConverting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Convert Student to Judge" size="md">
      <div className="space-y-4">
        <FormAlert variant="warning">
          <p className="font-semibold">⚠️ Important Change</p>
          <p className="text-sm mt-1">
            Converting {student.firstName} to a Judge will:
          </p>
          <ul className="text-sm list-disc ml-4 mt-2 space-y-1">
            <li>Remove ability to vote in elections</li>
            <li>Remove ability to respond to polls</li>
            <li>Enable competition judging capabilities</li>
            <li>Preserve past voting/polling data</li>
          </ul>
          <p className="text-sm mt-2 font-medium">
            This action cannot be easily reversed.
          </p>
        </FormAlert>

        <div>
          <p className="v-label mb-3">Add Judge Profile Information:</p>
          <div className="space-y-3">
            <div>
              <label className="v-label">Title (optional)</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                className={INPUT_CLASS}
                placeholder="Prof. / Dr. / Atty."
              />
            </div>
            <div>
              <label className="v-label">Affiliation (optional)</label>
              <input
                type="text"
                value={form.affiliation}
                onChange={(e) => setForm(f => ({ ...f, affiliation: e.target.value }))}
                className={INPUT_CLASS}
                placeholder="University, Organization"
              />
            </div>
            <div>
              <label className="v-label">Expertise (optional)</label>
              <input
                type="text"
                value={form.expertise}
                onChange={(e) => setForm(f => ({ ...f, expertise: e.target.value }))}
                className={INPUT_CLASS}
                placeholder="Areas of specialization"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-v-border pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConvert} loading={converting}>
            Convert to Judge
          </Button>
        </div>
      </div>
    </Modal>
  )
}
```

### 5. Service Layer Updates

```javascript
// frontend/src/services/admin.service.js

const adminService = {
  // OLD - removed
  // listVoters()
  // createVoter(data)
  // removeVoterMembership(userId)
  // listRespondents()
  // createRespondent(data)
  // removeRespondentMembership(userId)

  // NEW - simplified
  listStudents() {
    return api.get('/admin/students')
  },

  createStudent(data) {
    return api.post('/admin/students', data)
  },

  updateStudent(userId, data) {
    return api.patch(`/admin/students/${userId}`, data)
  },

  listJudges() {
    return api.get('/admin/judges')
  },

  createJudge(data) {
    return api.post('/admin/judges', data)
  },

  updateJudge(userId, data) {
    return api.patch(`/admin/judges/${userId}`, data)
  },

  // NEW - category conversion
  convertStudentToJudge(userId, profileData) {
    return api.post(`/admin/students/${userId}/convert-to-judge`, { profileData })
  },

  convertJudgeToStudent(userId, studentData) {
    return api.post(`/admin/judges/${userId}/convert-to-student`, { studentData })
  },

  // Account actions (same for both)
  updateParticipantStatus(userId, accountStatus) {
    return api.patch(`/admin/participants/${userId}/status`, { accountStatus })
  },
}
```

---

## Migration Execution Plan (Safe & Phased)

### Phase 0: Pre-Migration Audit (1 day)

**Purpose:** Understand current data and identify edge cases

```sql
-- 1. Count current participant type distribution
SELECT 
  participant_type,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_users
FROM user_participant_types
WHERE is_active = true
GROUP BY participant_type;

-- 2. Find users with multiple types
SELECT 
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  STRING_AGG(upt.participant_type, ', ') as types
FROM users u
JOIN user_participant_types upt ON upt.user_id = u.id
WHERE upt.is_active = true
GROUP BY u.id, u.email, u.first_name, u.last_name
HAVING COUNT(*) > 1;

-- 3. Check for orphaned event_participants records
SELECT 
  ep.user_id,
  u.email,
  ep.participant_type,
  COUNT(*) as event_count
FROM event_participants ep
LEFT JOIN user_participant_types upt 
  ON upt.user_id = ep.user_id 
  AND upt.participant_type::text = ep.participant_type::text
  AND upt.is_active = true
JOIN users u ON u.id = ep.user_id
WHERE upt.user_id IS NULL
GROUP BY ep.user_id, u.email, ep.participant_type;

-- 4. Export conflict cases for review
COPY (
  SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.school_id,
    u.program,
    STRING_AGG(upt.participant_type, ', ') as current_types,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM user_participant_types
        WHERE user_id = u.id 
          AND participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT')
          AND is_active = true
      ) THEN 'STUDENT'
      ELSE 'JUDGE'
    END as proposed_category
  FROM users u
  JOIN user_participant_types upt ON upt.user_id = u.id
  WHERE upt.is_active = true AND u.role = 'participant'
  GROUP BY u.id
) TO '/tmp/participant_migration_preview.csv' WITH CSV HEADER;
```

**Deliverable:** Migration report with:
- Total participants count
- Users with multiple types (requires decision)
- Orphaned event records (may need cleanup)
- Proposed category assignments

---

### Phase 1: Backend Migration (3-4 days)

#### Step 1.1: Database Schema Changes
```bash
# Create migration file
cd backend/src/database/migrations
touch 087_student_judge_separation.sql
```

```sql
-- 087_student_judge_separation.sql
BEGIN;

-- Add new column
ALTER TABLE users 
ADD COLUMN participant_category VARCHAR(20);

-- Backfill: Users with student-type memberships → STUDENT
UPDATE users u
SET participant_category = 'STUDENT'
WHERE role = 'participant'
  AND EXISTS (
    SELECT 1 FROM user_participant_types upt
    WHERE upt.user_id = u.id
      AND upt.participant_type IN ('ELECTION_VOTER', 'POLLING_RESPONDENT')
      AND upt.is_active = true
  );

-- Backfill: Users with ONLY judge membership → JUDGE
UPDATE users u
SET participant_category = 'JUDGE'
WHERE role = 'participant'
  AND participant_category IS NULL
  AND EXISTS (
    SELECT 1 FROM user_participant_types upt
    WHERE upt.user_id = u.id
      AND upt.participant_type = 'COMPETITION_JUDGE'
      AND upt.is_active = true
  );

-- Verify no nulls for participants
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM users
  WHERE role = 'participant' AND participant_category IS NULL;
  
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Found % participants without category', null_count;
  END IF;
END $$;

-- Add check constraint
ALTER TABLE users
ADD CONSTRAINT chk_participant_category 
CHECK (
  (role = 'participant' AND participant_category IN ('STUDENT', 'JUDGE'))
  OR (role != 'participant' AND participant_category IS NULL)
);

-- Archive old table (keep for rollback safety)
ALTER TABLE user_participant_types RENAME TO user_participant_types_legacy;

-- Add index
CREATE INDEX idx_users_participant_category 
ON users (participant_category) 
WHERE role = 'participant';

-- Update event_participants to use category
-- Note: Keep participant_type for now (will clean up in Phase 3)
ALTER TABLE event_participants
ADD COLUMN participant_category VARCHAR(20);

UPDATE event_participants ep
SET participant_category = (
  SELECT u.participant_category
  FROM users u
  WHERE u.id = ep.user_id
);

COMMIT;
```

#### Step 1.2: Update Backend Constants
```javascript
// backend/src/utils/constants.js
export const PARTICIPANT_CATEGORY = {
  STUDENT: 'STUDENT',
  JUDGE: 'JUDGE',
}
```

#### Step 1.3: Update Services (Core Logic)
- Update `user.service.js` - add createStudent/createJudge
- Update `admin-participant.service.js` - replace list functions
- Update `participant.service.js` - simplify eligibility checks
- Add `category-conversion.service.js` - handle Student ↔ Judge conversion

#### Step 1.4: Update Controllers & Routes
- Add `/admin/students` endpoints
- Keep old endpoints but deprecate with warnings
- Add `/admin/students/:id/convert-to-judge`
- Add `/admin/judges/:id/convert-to-student`

#### Step 1.5: Write Tests
- Test student creation
- Test judge creation
- Test category conversion
- Test eligibility checks
- Test backward compatibility

---

### Phase 2: Frontend Migration (2-3 days)

#### Step 2.1: Create New Components
- `StudentsPanel.jsx` (replaces VotersPanel for students)
- `JudgesPanel.jsx` (update existing)
- `StudentFormModal.jsx`
- `ConvertToJudgeModal.jsx`
- `ConvertToStudentModal.jsx`

#### Step 2.2: Update Page Structure
- Modify `UserManagementPage.jsx`
- Change from 3 tabs to 2 categories
- Update labels and descriptions

#### Step 2.3: Update Services
- Add `listStudents()` to adminService
- Update `createStudent()` API calls
- Add category conversion methods

#### Step 2.4: Update Routes (if needed)
- Change `/admin/users?type=voters` → `/admin/users?category=students`
- Keep old routes redirecting to new ones

---

### Phase 3: Cleanup & Deprecation (1-2 days)

#### Step 3.1: Remove Legacy Code
```javascript
// Mark as deprecated
/**
 * @deprecated Use listStudents() instead
 * This endpoint will be removed in v3.0
 */
export const listVoters = ...

// After 2-4 weeks, fully remove
```

#### Step 3.2: Clean Event Participants Table
```sql
-- Remove old participant_type enum column
ALTER TABLE event_participants DROP COLUMN participant_type;

-- Use participant_category only
```

#### Step 3.3: Archive Legacy Tables
```sql
-- After confirming everything works (1 month buffer)
DROP TABLE IF EXISTS user_participant_types_legacy CASCADE;
```

---

## Rollback Plan

### If Issues Found in Phase 1 (Database)

```sql
-- Rollback migration 087
BEGIN;

-- Remove new column
ALTER TABLE users DROP COLUMN IF EXISTS participant_category CASCADE;

-- Restore old table
ALTER TABLE user_participant_types_legacy RENAME TO user_participant_types;

COMMIT;
```

### If Issues Found in Phase 2 (Frontend)

- Keep old components (VotersPanel, JudgesPanel)
- Add feature flag: `FEATURE_STUDENT_JUDGE_SEPARATION`
- Toggle between old and new UI
- Easy to revert in environment config

---

## Testing Strategy

### Unit Tests
```javascript
describe('Student Creation', () => {
  it('should create student with correct category', async () => {
    const student = await createStudent({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'Student',
      schoolId: '2024-001',
      program: 'BS CS',
      yearSection: '3rd-A',
    })
    
    expect(student.participant_category).toBe('STUDENT')
    expect(student.role).toBe('participant')
  })

  it('should prevent creating student without school info', async () => {
    await expect(
      createStudent({ email: 'test@example.com' })
    ).rejects.toThrow('School ID is required')
  })
})

describe('Category Conversion', () => {
  it('should convert student to judge', async () => {
    const student = await createStudent({ /* ... */ })
    const judge = await convertStudentToJudge(student.id, {
      title: 'Prof.',
      expertise: 'Dance',
    })
    
    expect(judge.participant_category).toBe('JUDGE')
    expect(judge.profile_data.title).toBe('Prof.')
  })
})

describe('Eligibility Checks', () => {
  it('students can vote in elections', async () => {
    const student = await createStudent({ /* ... */ })
    const canVote = await canUserVoteInElection(student.id, 'election-1')
    expect(canVote).toBe(true)
  })

  it('judges cannot vote in elections', async () => {
    const judge = await createJudge({ /* ... */ })
    const canVote = await canUserVoteInElection(judge.id, 'election-1')
    expect(canVote).toBe(false)
  })
})
```

### Integration Tests
- Test full student creation flow (API → DB → Email)
- Test full judge creation flow
- Test category conversion with event history preservation
- Test event enrollment with new categories

### E2E Tests
- Admin creates student → Student can vote and respond to polls
- Admin creates judge → Judge can only judge competitions
- Admin converts student to judge → Access changes correctly
- Verify old data still accessible after migration

---

## Communication Plan

### To Users (Admin)
```
Subject: Simplified Participant Management Coming Soon

We're making participant management easier!

What's changing:
• "Election Voters" and "Polling Respondents" are now just "Students"
• Students automatically get access to BOTH voting and polls
• "Competition Judges" remain the same
• No more confusing "remove from pool" - just Student or Judge

What stays the same:
• All your existing data is safe
• No action needed from you
• Old links still work (they redirect)

Timeline:
• [Date]: Backend migration (no downtime)
• [Date]: New UI available
• [Date]: Old UI removed

Questions? Contact support@...
```

### To Developers
```
Technical Brief: Student-Judge Separation

Motivation:
• Reduce complexity of user_participant_types table
• Clearer separation: Students vs Judges
• Simpler code and fewer edge cases

Key Changes:
• New field: users.participant_category (STUDENT | JUDGE)
• Removed: user_participant_types table (archived as _legacy)
• API: /admin/students and /admin/judges
• Frontend: 2 tabs instead of 3

Migration: Phase 1 complete [Date], Phase 2 in progress
Rollback: Available via feature flag until [Date]

See full plan: docs/plans/student-judge-separation-migration.md
```

---

## Success Criteria

### Technical Metrics
- [ ] Zero data loss during migration
- [ ] All existing participants correctly categorized
- [ ] No 500 errors after deployment
- [ ] API response times maintained or improved
- [ ] Test coverage > 80% for new code

### User Experience Metrics
- [ ] Admin user feedback positive (> 4/5 rating)
- [ ] Time to create participant reduced by 30%
- [ ] Support tickets about "types" reduced by 50%
- [ ] Zero critical bugs reported in first week

### Code Quality Metrics
- [ ] Lines of code reduced by ~20% in participant management
- [ ] Cyclomatic complexity reduced
- [ ] Fewer conditional branches in eligibility logic

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Data loss during migration | 🔴 Critical | 🟡 Low | Full backup before migration, dry-run on staging |
| Users with both Student+Judge types | 🟡 Medium | 🟢 Very Low | Pre-migration audit, manual review, convert to Student by default |
| Event history breaks | 🔴 Critical | 🟢 Very Low | event_participants keeps old data, tested thoroughly |
| Frontend breaks during transition | 🟡 Medium | 🟡 Medium | Feature flag for quick rollback, staged rollout |
| Email confusion from students/judges | 🟢 Low | 🟡 Medium | Clear communication plan, help docs updated |

---

## Timeline Estimate

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Phase 0: Audit** | 1 day | Data analysis, conflict identification |
| **Phase 1: Backend** | 3-4 days | DB migration, service updates, tests |
| **Phase 2: Frontend** | 2-3 days | New components, service updates, tests |
| **Phase 3: Cleanup** | 1-2 days | Remove legacy code, documentation |
| **Buffer** | 2-3 days | Unexpected issues, refinement |
| **TOTAL** | **9-13 days** | Full migration complete |

---

## Post-Migration Checklist

### Week 1
- [ ] Monitor error logs daily
- [ ] Check for any 500 errors related to participants
- [ ] Verify no duplicate accounts created
- [ ] Confirm email notifications working
- [ ] Review user feedback

### Week 2-4
- [ ] Remove deprecated API endpoints
- [ ] Remove old frontend components
- [ ] Update all documentation
- [ ] Drop feature flags (if stable)

### Month 2
- [ ] Drop `user_participant_types_legacy` table
- [ ] Final code cleanup
- [ ] Performance review
- [ ] Lessons learned document

---

## Questions to Resolve Before Starting

1. **Multi-type users:** Should users with BOTH student and judge types become:
   - Option A: STUDENT (they're affiliated with school) ✅ RECOMMENDED
   - Option B: JUDGE (judge role is more specialized)
   - Option C: Admin manually reviews each case

2. **CSV Import:** How to handle old CSV templates?
   - Option A: Auto-detect and convert ✅ RECOMMENDED
   - Option B: Force users to use new template
   - Option C: Support both formats indefinitely

3. **Email Templates:** Update welcome emails?
   - Option A: Yes, clarify "Student" role includes voting + polling ✅ RECOMMENDED
   - Option B: Keep generic "Welcome to Votrix"

4. **Conversion Feature:** Should we allow converting BACK from Judge to Student?
   - Option A: Yes, bidirectional conversion ✅ RECOMMENDED
   - Option B: No, one-way only (Judge is "promotion")

---

*Ready for review and approval before implementation begins.*
