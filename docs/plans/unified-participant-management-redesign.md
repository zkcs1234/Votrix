# Unified Participant Management Redesign Plan

## Overview
Redesign the participant management system to:
1. Unify "Add Participant" flow with multi-type selection
2. Improve "Remove from Pool" → "Revoke Type Access" clarity
3. Show participant types visually in the table
4. Better separation of account-level vs type-level actions

---

## Current Problems

### Issue 1: Fragmented Add Experience
- ❌ Three separate tabs with three separate "Add" buttons
- ❌ Cannot assign multiple types (Voter + Respondent) at once
- ❌ Must duplicate data entry for same person
- ❌ Voter and Respondent forms are identical but separate

### Issue 2: Confusing "Remove from Pool"
- ❌ Technical jargon ("pool") not user-friendly
- ❌ Unclear scope (removes one type, not entire account)
- ❌ No visual indication of which types user will retain
- ❌ Easy to confuse with Suspend/Archive actions

### Issue 3: Hidden Multi-Type Status
- ❌ Can't see if a user has multiple participant types
- ❌ No indication that removing one type leaves others intact
- ❌ Must check other tabs to see full participant profile

### Issue 4: Poor Action Hierarchy
- ❌ All action buttons have equal visual weight
- ❌ Destructive actions (Suspend) look same as type actions (Remove)
- ❌ Account-level vs Type-level actions not distinguished

---

## Proposed Solution Architecture

### 1. Unified Add Participant Modal

#### Component Structure
```
UnifiedParticipantModal.jsx
├─ Step 1: Type Selection (checkbox cards)
│  ├─ Election Voter (checkbox card)
│  ├─ Polling Respondent (checkbox card)
│  └─ Competition Judge (checkbox card)
│
├─ Step 2: Account Details (always visible)
│  ├─ Email
│  ├─ First Name
│  └─ Last Name
│
├─ Step 3: Student Information (conditional)
│  ├─ School ID
│  ├─ Program
│  └─ Year & Section
│  └─ Visible when: Voter OR Respondent selected
│
├─ Step 4: Judge Information (conditional)
│  ├─ Title
│  ├─ Affiliation
│  └─ Expertise
│  └─ Visible when: Judge selected
│
└─ Summary Section (dynamic preview)
```

#### Smart Form Logic
| Selection | Shows Student Fields | Shows Judge Fields | Note |
|-----------|---------------------|-------------------|------|
| Voter only | ✅ | ❌ | Common student case |
| Respondent only | ✅ | ❌ | Common student case |
| Voter + Respondent | ✅ | ❌ | **Most common case** |
| Judge only | ❌ | ✅ | External judge |
| Voter + Judge | ✅ | ✅ | Faculty who also votes |
| Respondent + Judge | ✅ | ✅ | Faculty who also responds |
| All three | ✅ | ✅ | Full participant |

#### Validation Rules
1. At least one type must be selected
2. Email format validation
3. If Voter OR Respondent selected: Student fields required
4. If Judge selected: Judge fields optional but recommended
5. Duplicate email check across all users

---

### 2. Participant Management Page Redesign

#### New Page Structure

```
┌────────────────────────────────────────────────────────────────┐
│ User Management                                                 │
│ ┌──────────────┐ ┌──────────────────┐                         │
│ │ Organizers   │ │  Participants  ✓ │                         │
│ └──────────────┘ └──────────────────┘                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│ All Participants                                   [+ Add]      │
│ ─────────────────────────────────────────────────────────────  │
│                                                                 │
│ 📊 Summary Stats                                                │
│ ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│ │ Total        │ Active       │ Multi-Type   │ Suspended    │ │
│ │ 248          │ 235          │ 42           │ 13           │ │
│ └──────────────┴──────────────┴──────────────┴──────────────┘ │
│                                                                 │
│ 🔍 Filters & Search                                             │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ [Search by name/email...]                  [🔍 Search]   │  │
│ │                                                            │  │
│ │ Filter by Type:                                           │  │
│ │ [ All ] [🗳️ Voters] [🏆 Judges] [📊 Respondents]         │  │
│ │                                                            │  │
│ │ Filter by Type Count:                                     │  │
│ │ [ All ] [ Single Type ] [ Multiple Types ]                │  │
│ │                                                            │  │
│ │ Filter by Status:                                         │  │
│ │ [ All ] [ Active ] [ Suspended ] [ Archived ]             │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ 📋 Participant List                                             │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Name       Email    Types          Status    Actions     │  │
│ ├──────────────────────────────────────────────────────────┤  │
│ │ John Doe   john@... 🗳️ Voter      Active    [•••]       │  │
│ │                     📊 Respondent                        │  │
│ │                                                           │  │
│ │ Jane Smith jane@... 🗳️ Voter      Active    [•••]       │  │
│ │                     🏆 Judge                             │  │
│ │                     📊 Respondent                        │  │
│ │                                                           │  │
│ │ Bob Jones  bob@...  🏆 Judge      Suspended [•••]       │  │
│ └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

#### Key Changes from Current:
1. **Single unified view** (no separate tabs per type)
2. **Type badges** visible in main table
3. **Multi-type filter** to find users with multiple roles
4. **Single "Add" button** that opens unified modal
5. **Better stats** showing multi-type participants

---

### 3. Improved Type Badge Display

#### Badge Component
```jsx
<ParticipantTypeBadges types={user.participantTypes} size="sm" />
```

#### Visual Design
```
Current Types:
┌─────────────┐ ┌──────────────┐ ┌───────────────┐
│ 🗳️ Voter    │ │ 🏆 Judge     │ │ 📊 Respondent │
│ (blue)      │ │ (purple)     │ │ (green)       │
└─────────────┘ └──────────────┘ └───────────────┘

Inactive Type (being removed):
┌─────────────┐
│ 🗳️ Voter    │ ← strike-through + muted
│ (gray)      │
└─────────────┘
```

#### Implementation
```jsx
// frontend/src/components/admin/ParticipantTypeBadges.jsx
import { Vote, Trophy, ClipboardList } from 'lucide-react'
import Badge from '@/components/ui/Badge'

const TYPE_CONFIG = {
  ELECTION_VOTER: {
    icon: Vote,
    label: 'Voter',
    tone: 'info',
    color: 'text-blue-600'
  },
  COMPETITION_JUDGE: {
    icon: Trophy,
    label: 'Judge',
    tone: 'purple',
    color: 'text-purple-600'
  },
  POLLING_RESPONDENT: {
    icon: ClipboardList,
    label: 'Respondent',
    tone: 'success',
    color: 'text-green-600'
  }
}

export default function ParticipantTypeBadges({ 
  types = [], 
  size = 'sm',
  highlightType = null, // Type being removed/added
  strikethrough = false 
}) {
  if (!types.length) {
    return <span className="text-sm text-v-text-tertiary">No types</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {types.map(type => {
        const config = TYPE_CONFIG[type.participant_type]
        const Icon = config.icon
        const isHighlighted = highlightType === type.participant_type

        return (
          <Badge
            key={type.participant_type}
            tone={type.is_active ? config.tone : 'default'}
            size={size}
            className={`
              ${strikethrough && isHighlighted ? 'line-through opacity-50' : ''}
              ${isHighlighted ? 'ring-2 ring-v-primary' : ''}
            `}
          >
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        )
      })}
    </div>
  )
}
```

---

### 4. Revamped Actions Menu

#### New Action Structure

```jsx
// Actions dropdown menu for each participant row

┌─────────────────────────────────┐
│ Actions Menu                    │
├─────────────────────────────────┤
│ 📝 Edit Information             │ ← Opens edit modal
│                                  │
│ ─── Account Actions ────────    │ ← Section divider
│ 🔴 Suspend Account              │ ← Destructive, account-wide
│ 📦 Archive Account              │ ← Permanent, account-wide
│                                  │
│ ─── Type Management ────────    │
│ ➕ Add Participant Type         │ ← Opens type selector
│ 🗳️ ➖ Revoke Voter Access       │ ← Type-specific, shows icon
│ 🏆 ➖ Revoke Judge Access       │
│ 📊 ➖ Revoke Respondent Access  │
│                                  │
│ ─── View ───────────────────    │
│ 📜 View Activity Log            │ ← Audit trail
└─────────────────────────────────┘
```

#### Action Button Implementation
```jsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="sm">
      <MoreVertical className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  
  <DropdownMenuContent align="end" className="w-56">
    {/* Edit */}
    <DropdownMenuItem onClick={() => openEditModal(user)}>
      <Pencil className="h-4 w-4" />
      Edit Information
    </DropdownMenuItem>

    <DropdownMenuSeparator />
    <DropdownMenuLabel>Account Actions</DropdownMenuLabel>
    
    {/* Account-level actions */}
    <DropdownMenuItem 
      onClick={() => openSuspendModal(user)}
      className="text-v-danger"
    >
      <ShieldOff className="h-4 w-4" />
      {user.accountStatus === 'active' ? 'Suspend' : 'Reinstate'} Account
    </DropdownMenuItem>
    
    {user.accountStatus !== 'archived' && (
      <DropdownMenuItem onClick={() => openArchiveModal(user)}>
        <Archive className="h-4 w-4" />
        Archive Account
      </DropdownMenuItem>
    )}

    <DropdownMenuSeparator />
    <DropdownMenuLabel>Type Management</DropdownMenuLabel>
    
    {/* Type-specific actions */}
    <DropdownMenuItem onClick={() => openAddTypeModal(user)}>
      <UserPlus className="h-4 w-4" />
      Add Participant Type
    </DropdownMenuItem>
    
    {user.participantTypes.map(type => (
      <DropdownMenuItem
        key={type.participant_type}
        onClick={() => openRevokeTypeModal(user, type)}
        className="text-v-text-secondary"
      >
        {getTypeIcon(type.participant_type)}
        <UserMinus className="h-3 w-3" />
        Revoke {getTypeLabel(type.participant_type)} Access
      </DropdownMenuItem>
    ))}

    <DropdownMenuSeparator />
    
    {/* View */}
    <DropdownMenuItem onClick={() => viewActivityLog(user)}>
      <ScrollText className="h-4 w-4" />
      View Activity Log
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

### 5. Improved "Revoke Type Access" Modal

#### Before/After Comparison

**Current Modal:**
```
❌ "Remove from Pool?"
❌ "[Name] will no longer be available for future event 
    selection from this pool."
❌ Technical language, unclear impact
```

**New Modal:**
```
✅ "Revoke Election Voter Access?"
✅ Visual before/after with badges
✅ Clear bullet points of what changes
✅ Warning if last type
```

#### New Modal Design

```
┌─────────────────────────────────────────────────────────────┐
│ Revoke Election Voter Access?                      [Close] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 👤 Participant                                               │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ John Smith (john@example.com)                        │   │
│ │                                                        │   │
│ │ Current Types:                                        │   │
│ │ ┌────────────┐ ┌──────────────┐ ┌──────────────┐   │   │
│ │ │ 🗳️ Voter   │ │ 🏆 Judge     │ │ 📊 Respondent│   │   │
│ │ │ ❌ REMOVE   │ │ ✓ Keep       │ │ ✓ Keep       │   │   │
│ │ └────────────┘ └──────────────┘ └──────────────┘   │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ 📋 What will happen:                                        │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ ✗ Cannot be selected for future elections            │   │
│ │ ✗ Won't appear in voter cohort selection             │   │
│ │ ✓ Can still judge competitions                       │   │
│ │ ✓ Can still respond to polls                         │   │
│ │ ✓ Can still log in and view past elections           │   │
│ │ ✓ All past votes remain valid                        │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ After this action, John will have 2 participant types.      │
│                                                              │
│                             [Cancel] [Revoke Voter Access]  │
└─────────────────────────────────────────────────────────────┘
```

#### Warning for Last Type

```
┌─────────────────────────────────────────────────────────────┐
│ Revoke Judge Access?                               [Close] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 👤 Participant                                               │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ Bob Jones (bob@example.com)                          │   │
│ │                                                        │   │
│ │ Current Types:                                        │   │
│ │ ┌──────────────┐                                     │   │
│ │ │ 🏆 Judge     │                                     │   │
│ │ │ ❌ REMOVE     │ (This is their ONLY type)          │   │
│ │ └──────────────┘                                     │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ ⚠️ Warning: Last Participant Type                           │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ This is Bob's only participant type. After removal:  │   │
│ │                                                        │   │
│ │ • They will have NO participant types                │   │
│ │ • Cannot participate in any events                   │   │
│ │ • Account will still exist and can log in            │   │
│ │                                                        │   │
│ │ 💡 Consider these alternatives instead:              │   │
│ │ • Suspend their account temporarily                  │   │
│ │ • Archive their account permanently                  │   │
│ │                                                        │   │
│ │ [Cancel] [Suspend Account] [Archive Account]         │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ Still want to remove this type?                             │
│                                                              │
│                    [Cancel] [⚠️ Remove Anyway]              │
└─────────────────────────────────────────────────────────────┘
```

#### Modal Implementation
```jsx
// frontend/src/components/admin/RevokeTypeAccessModal.jsx

export default function RevokeTypeAccessModal({ 
  user, 
  typeToRevoke, 
  onClose, 
  onConfirm,
  onSuspend,
  onArchive 
}) {
  const remainingTypes = user.participantTypes.filter(
    t => t.participant_type !== typeToRevoke
  )
  const isLastType = remainingTypes.length === 0
  const typeConfig = TYPE_CONFIG[typeToRevoke]

  return (
    <Modal
      open
      onClose={onClose}
      title={`Revoke ${typeConfig.label} Access?`}
      size="md"
    >
      <div className="space-y-5">
        {/* User Info with Type Badges */}
        <div className="rounded-lg bg-v-surface-elevated p-4">
          <div className="mb-3">
            <p className="font-medium text-v-text">{user.name}</p>
            <p className="text-sm text-v-text-secondary">{user.email}</p>
          </div>
          
          <div>
            <p className="v-label mb-2">Current Types:</p>
            <div className="flex flex-wrap gap-2">
              {user.participantTypes.map(type => {
                const isBeingRemoved = type.participant_type === typeToRevoke
                const Icon = TYPE_CONFIG[type.participant_type].icon
                
                return (
                  <div
                    key={type.participant_type}
                    className={`
                      flex items-center gap-2 rounded-lg border-2 px-3 py-2
                      ${isBeingRemoved 
                        ? 'border-v-danger bg-v-danger/10' 
                        : 'border-v-success bg-v-success/10'
                      }
                    `}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {TYPE_CONFIG[type.participant_type].label}
                    </span>
                    {isBeingRemoved ? (
                      <span className="text-xs font-bold text-v-danger">
                        ❌ REMOVE
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-v-success">
                        ✓ Keep
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Impact List */}
        <div>
          <p className="v-label mb-2">📋 What will happen:</p>
          <div className="space-y-2 rounded-lg border border-v-border p-4">
            <ImpactItem negative>
              Cannot be selected for future {typeConfig.eventTypeName}
            </ImpactItem>
            <ImpactItem negative>
              Won't appear in {typeConfig.label.toLowerCase()} selection
            </ImpactItem>
            {remainingTypes.map(type => (
              <ImpactItem key={type.participant_type} positive>
                Can still {TYPE_CONFIG[type.participant_type].capability}
              </ImpactItem>
            ))}
            <ImpactItem positive>
              Can still log in and view past {typeConfig.eventTypeName}
            </ImpactItem>
            <ImpactItem positive>
              All past {typeConfig.dataName} remain valid
            </ImpactItem>
          </div>
        </div>

        {/* Last Type Warning */}
        {isLastType && (
          <FormAlert variant="warning">
            <div className="space-y-3">
              <p className="font-semibold">⚠️ Warning: Last Participant Type</p>
              <p className="text-sm">
                This is {user.firstName}'s only participant type. After removal:
              </p>
              <ul className="ml-4 list-disc space-y-1 text-sm">
                <li>They will have NO participant types</li>
                <li>Cannot participate in any events</li>
                <li>Account will still exist and can log in</li>
              </ul>
              <div className="rounded-lg bg-v-surface p-3">
                <p className="mb-2 text-sm font-medium">💡 Consider these alternatives instead:</p>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="secondary"
                    onClick={() => onSuspend(user)}
                  >
                    Suspend Account
                  </Button>
                  <Button 
                    size="sm" 
                    variant="secondary"
                    onClick={() => onArchive(user)}
                  >
                    Archive Account
                  </Button>
                </div>
              </div>
            </div>
          </FormAlert>
        )}

        {/* Summary */}
        {!isLastType && (
          <p className="text-sm text-v-text-secondary">
            After this action, {user.firstName} will have {remainingTypes.length} participant type{remainingTypes.length !== 1 ? 's' : ''}.
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-v-border pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            variant={isLastType ? "danger" : "primary"}
            onClick={onConfirm}
          >
            {isLastType ? '⚠️ Remove Anyway' : `Revoke ${typeConfig.label} Access`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ImpactItem({ children, positive, negative }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {positive && <span className="text-v-success">✓</span>}
      {negative && <span className="text-v-danger">✗</span>}
      <span className="text-v-text">{children}</span>
    </div>
  )
}
```

---

### 6. Add Type Modal (for existing users)

```
┌─────────────────────────────────────────────────────────────┐
│ Add Participant Type                               [Close] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ 👤 Adding type for: John Smith (john@example.com)          │
│                                                              │
│ Current Types:                                              │
│ ┌────────────┐ ┌──────────────┐                           │
│ │ 🗳️ Voter   │ │ 📊 Respondent│                           │
│ └────────────┘ └──────────────┘                           │
│                                                              │
│ ─────────────────────────────────────────────────────────  │
│                                                              │
│ Select Type to Add:                                         │
│                                                              │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ ○ Competition Judge                                  │   │
│ │   Can judge competitions and score contestants       │   │
│ │                                                        │   │
│ │   Additional information needed:                      │   │
│ │   • Title (optional)                                  │   │
│ │   • Affiliation (optional)                           │   │
│ │   • Expertise (optional)                             │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ ℹ️ Student information already on file will be used.       │
│                                                              │
│                                   [Cancel] [Add Judge Type] │
└─────────────────────────────────────────────────────────────┘
```

---

### 7. Backend API Changes

#### New Unified Create Endpoint

```javascript
// backend/src/controllers/admin.controller.js

export const createParticipant = asyncHandler(async (req, res) => {
  const {
    email,
    firstName,
    lastName,
    participantTypes, // ['ELECTION_VOTER', 'POLLING_RESPONDENT', 'COMPETITION_JUDGE']
    schoolId,
    program,
    yearSection,
    profileData, // { title, affiliation, expertise }
  } = req.body

  // Validation
  if (!Array.isArray(participantTypes) || participantTypes.length === 0) {
    throw new ApiError(400, 'At least one participant type is required')
  }

  const validTypes = ['ELECTION_VOTER', 'POLLING_RESPONDENT', 'COMPETITION_JUDGE']
  const invalidTypes = participantTypes.filter(t => !validTypes.includes(t))
  if (invalidTypes.length > 0) {
    throw new ApiError(400, `Invalid participant types: ${invalidTypes.join(', ')}`)
  }

  const hasStudentTypes = participantTypes.some(t =>
    ['ELECTION_VOTER', 'POLLING_RESPONDENT'].includes(t)
  )
  const hasJudgeType = participantTypes.includes('COMPETITION_JUDGE')

  // Require student fields if student types selected
  if (hasStudentTypes && (!schoolId || !program || !yearSection)) {
    throw new ApiError(
      400,
      'School ID, Program, and Year/Section are required for Voter or Respondent types'
    )
  }

  // Check for existing user
  const existingUser = await findUserByEmail(email)
  if (existingUser) {
    throw new ApiError(409, 'A user with this email already exists')
  }

  // Create user account
  const user = await createParticipantUser({
    email,
    firstName,
    lastName,
    schoolId: hasStudentTypes ? schoolId : null,
    program: hasStudentTypes ? program : null,
    yearSection: hasStudentTypes ? yearSection : null,
    profileData: hasJudgeType ? profileData : null,
  })

  // Add all participant type memberships
  const addedTypes = []
  for (const type of participantTypes) {
    const membership = await addParticipantTypeMembership(
      user.id,
      type,
      req.user.id
    )
    addedTypes.push(membership)
  }

  // Send welcome email
  const emailResult = await sendParticipantWelcomeEmail(user, participantTypes)

  // Audit log
  await createAuditLog({
    userId: req.user.id,
    action: 'CREATE_PARTICIPANT_MULTI_TYPE',
    entity: 'participant',
    entityId: user.id,
    details: {
      email: user.email,
      participantTypes,
      emailSent: emailResult.sent,
    },
  })

  res.status(201).json({
    success: true,
    user: sanitizeUser(user),
    participantTypes: addedTypes,
    email: emailResult,
  })
})
```

#### Add Type to Existing User

```javascript
// backend/src/controllers/admin.controller.js

export const addParticipantType = asyncHandler(async (req, res) => {
  const userId = validateUUID(req.params.userId, 'userId')
  const { participantType, profileData } = req.body

  // Validate type
  const validTypes = ['ELECTION_VOTER', 'POLLING_RESPONDENT', 'COMPETITION_JUDGE']
  if (!validTypes.includes(participantType)) {
    throw new ApiError(400, 'Invalid participant type')
  }

  // Check if user already has this type
  const hasType = await hasParticipantTypeMembership(userId, participantType)
  if (hasType) {
    throw new ApiError(409, 'User already has this participant type')
  }

  // Get user to verify they exist and have required fields
  const user = await findUserById(userId)
  if (!user) {
    throw new ApiError(404, 'User not found')
  }

  const isStudentType = ['ELECTION_VOTER', 'POLLING_RESPONDENT'].includes(participantType)
  
  // If adding student type, verify student fields exist
  if (isStudentType && (!user.school_id || !user.program || !user.year_section)) {
    throw new ApiError(
      400,
      'Cannot add Voter/Respondent type: User missing required student information (School ID, Program, Year/Section)'
    )
  }

  // If adding judge type, update profile data if provided
  if (participantType === 'COMPETITION_JUDGE' && profileData) {
    await updateUserProfileData(userId, profileData)
  }

  // Add membership
  const membership = await addParticipantTypeMembership(
    userId,
    participantType,
    req.user.id
  )

  // Audit log
  await createAuditLog({
    userId: req.user.id,
    action: 'ADD_PARTICIPANT_TYPE',
    entity: 'participant',
    entityId: userId,
    details: {
      participantType,
      userEmail: user.email,
    },
  })

  res.json({
    success: true,
    membership,
    message: `${participantType} access added successfully`,
  })
})
```

#### Enhanced List Participants (with types)

```javascript
// backend/src/services/admin-participant.service.js

export async function listAllParticipants() {
  const { data, error } = await db()
    .from('users')
    .select(`
      *,
      user_participant_types (
        participant_type,
        is_active,
        created_at,
        created_by
      )
    `)
    .eq('role', 'participant')
    .order('created_at', { ascending: false })

  if (error) throw new ApiError(500, error.message)

  return data.map(user => ({
    ...sanitizeUser(user),
    participantTypes: (user.user_participant_types || [])
      .filter(t => t.is_active)
      .map(t => ({
        type: t.participant_type,
        addedAt: t.created_at,
        addedBy: t.created_by,
      })),
    typeCount: (user.user_participant_types || []).filter(t => t.is_active).length,
  }))
}
```

---

## File Changes Summary

### New Files to Create

1. **`frontend/src/components/admin/UnifiedParticipantModal.jsx`**
   - Main modal component with multi-type selection
   - Smart form fields based on type selection
   - Summary preview before submission

2. **`frontend/src/components/admin/ParticipantTypeBadges.jsx`**
   - Reusable badge component for displaying participant types
   - Supports highlighting, strikethrough, and different sizes

3. **`frontend/src/components/admin/RevokeTypeAccessModal.jsx`**
   - Improved "remove from pool" modal
   - Before/after type visualization
   - Warning for last type removal

4. **`frontend/src/components/admin/AddTypeModal.jsx`**
   - Modal for adding type to existing user
   - Shows current types and available types to add

5. **`frontend/src/components/admin/ParticipantActionsMenu.jsx`**
   - Dropdown menu with organized actions
   - Clear separation of account vs type actions

### Files to Modify

1. **`frontend/src/pages/admin/UserManagementPage.jsx`**
   - Replace tab-based navigation with unified view
   - Add filter controls for types and type count
   - Replace separate panels with unified table
   - Single "Add Participant" button

2. **`frontend/src/components/admin/VotersPanel.jsx`**
   - Remove or deprecate (functionality moved to unified view)
   - Keep as legacy fallback if needed

3. **`frontend/src/components/admin/JudgesPanel.jsx`**
   - Remove or deprecate (functionality moved to unified view)
   - Keep as legacy fallback if needed

4. **`frontend/src/services/admin.service.js`**
   - Add `createParticipant(payload)` - unified creation
   - Add `listAllParticipants()` - returns users with types
   - Add `addParticipantType(userId, type, profileData)`
   - Add `revokeParticipantType(userId, type)`
   - Update existing methods to return type information

5. **`backend/src/controllers/admin.controller.js`**
   - Add `createParticipant` handler
   - Add `addParticipantType` handler
   - Add `listAllParticipants` handler (replaces separate lists)

6. **`backend/src/services/admin-participant.service.js`**
   - Add `createParticipantUser(data)` - unified user creation
   - Add `listAllParticipants()` - with type joins
   - Update existing functions to handle multi-type scenarios

7. **`backend/src/routes/admin.routes.js`**
   - Add `POST /admin/participants` - unified creation
   - Add `GET /admin/participants` - unified list with types
   - Add `POST /admin/participants/:userId/types` - add type
   - Add `DELETE /admin/participants/:userId/types/:type` - revoke type

---

## Implementation Phases

### Phase 1: Foundation (Backend + Basic UI)
**Goal:** Set up unified data structure and API
**Time:** 2-3 days

Tasks:
- [ ] Create unified participant creation endpoint
- [ ] Enhance list endpoint to return participant types
- [ ] Add type management endpoints (add/revoke)
- [ ] Create ParticipantTypeBadges component
- [ ] Update admin service with new methods

### Phase 2: Unified Modal
**Goal:** Implement smart multi-type creation modal
**Time:** 2-3 days

Tasks:
- [ ] Create UnifiedParticipantModal component
- [ ] Implement type selection cards
- [ ] Implement conditional field visibility logic
- [ ] Add form validation
- [ ] Add summary preview
- [ ] Wire up to backend API
- [ ] Test all type combinations

### Phase 3: Page Redesign
**Goal:** Revamp participant management page
**Time:** 2-3 days

Tasks:
- [ ] Redesign UserManagementPage layout
- [ ] Remove tab-based navigation
- [ ] Add unified participant table
- [ ] Integrate type badges in table
- [ ] Add filter controls (type, count, status)
- [ ] Add search functionality
- [ ] Update stats cards

### Phase 4: Improved Actions
**Goal:** Better action menus and modals
**Time:** 2-3 days

Tasks:
- [ ] Create ParticipantActionsMenu component
- [ ] Create RevokeTypeAccessModal component
- [ ] Create AddTypeModal component
- [ ] Implement before/after visualization
- [ ] Add last-type warning logic
- [ ] Update confirmation flows
- [ ] Add audit logging for type changes

### Phase 5: Testing & Polish
**Goal:** Ensure everything works smoothly
**Time:** 2 days

Tasks:
- [ ] Test all type combinations
- [ ] Test edge cases (last type, duplicate types)
- [ ] Test CSV import (if applicable)
- [ ] Verify email notifications
- [ ] Check audit logs
- [ ] Update user documentation
- [ ] Add inline help text

---

## Migration Strategy

### Backward Compatibility

1. **Existing API endpoints remain functional**
   - Old voter/judge creation endpoints still work
   - Old list endpoints still work
   - Frontend can mix old and new approaches during transition

2. **Data migration not required**
   - `user_participant_types` table already exists
   - Existing data already structured correctly
   - Just adding new UI on top of existing data

3. **Gradual rollout**
   - Phase 1: New API available, old UI still works
   - Phase 2: New modal available alongside old modals
   - Phase 3: New page design replaces old tabs
   - Phase 4: Old components can be removed

### Rollback Plan

If issues arise:
1. Keep old VotersPanel and JudgesPanel components
2. Add feature flag to toggle between old/new UI
3. Can revert to tab-based view quickly
4. Backend API changes are additive (safe to rollback frontend only)

---

## Testing Checklist

### Unit Tests
- [ ] Type badge component renders correctly
- [ ] Modal shows/hides fields based on type selection
- [ ] Form validation works for all combinations
- [ ] API payload construction is correct

### Integration Tests
- [ ] Create participant with single type
- [ ] Create participant with multiple types (Voter + Respondent)
- [ ] Create participant with all three types
- [ ] Add type to existing participant
- [ ] Revoke type from participant
- [ ] Revoke last type (should warn)
- [ ] Filter by type works correctly
- [ ] Search works with multi-type users

### E2E Tests
- [ ] Full flow: Create → View → Edit → Revoke Type → Add Type
- [ ] CSV import with type specification (if implemented)
- [ ] Email notifications sent correctly
- [ ] Audit logs created for all type changes

---

## Success Metrics

After implementation, measure:

1. **User Confusion Reduction**
   - Fewer support tickets about "remove from pool"
   - Faster participant creation time
   - Fewer mistakes (wrong action clicked)

2. **Efficiency Gains**
   - Time to create participant with multiple types: 50% reduction
   - Clicks to complete common tasks: 30% reduction
   - Admin satisfaction score improvement

3. **Data Quality**
   - Fewer accounts with missing types
   - More multi-type participants (where appropriate)
   - Clearer audit trail

---

## Documentation Updates Needed

1. **Admin User Guide**
   - Update "Adding Participants" section
   - Explain multi-type concept
   - Document new action menu structure

2. **API Documentation**
   - Document new unified endpoints
   - Update request/response examples
   - Mark old endpoints as deprecated (but still supported)

3. **Developer Notes**
   - Architecture decision record (ADR) for multi-type design
   - Component usage examples
   - Migration guide for custom installations

---

## Questions to Resolve

Before implementation, decide on:

1. **CSV Import:** Should CSV support multi-type specification?
   - Option A: Add "Types" column (e.g., "VOTER,RESPONDENT")
   - Option B: Keep separate CSVs per type
   - **Recommendation:** Option A for consistency

2. **Bulk Operations:** Should we add bulk type management?
   - Add type to multiple users at once
   - Revoke type from multiple users at once
   - **Recommendation:** Yes, in Phase 5

3. **Email Templates:** Should welcome email mention all types?
   - Single email listing all types
   - Separate email per type
   - **Recommendation:** Single email with type list

4. **Activity Log:** How detailed should type changes be logged?
   - Just "type added/removed"
   - Include who, when, why fields
   - **Recommendation:** Full detail (who, when, from where)

---

## Next Steps

1. **Review this plan** with team
2. **Prioritize phases** based on urgency
3. **Assign developers** to each phase
4. **Set up feature branch** for development
5. **Create tickets** for each task
6. **Begin Phase 1** implementation

---

*Last updated: [Current Date]*
*Status: Planning Complete - Ready for Implementation*
