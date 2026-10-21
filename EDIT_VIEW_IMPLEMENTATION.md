# Edit & View Details Implementation for Students

## Overview
Implemented fully functional Edit and View Details features for Students panel to match the functionality level of Judges panel.

---

## New Components Created

### 1. EditStudentModal.jsx
**Purpose:** Edit student information (names, school ID, program, section)

**Features:**
- ✅ Pre-populated form with current student data
- ✅ Email field is read-only (disabled)
- ✅ Editable fields:
  - First Name (required)
  - Last Name (required)
  - School ID (required)
  - Program (dropdown, required)
  - Year & Section (dropdown, required)
- ✅ Fetches taxonomy from System Settings (programs/sections)
- ✅ Updates **BOTH** voter and respondent records simultaneously
- ✅ Form validation
- ✅ Loading state on submit button
- ✅ Error handling with toast notifications
- ✅ Link to System Settings if taxonomy is missing

**API Calls:**
```javascript
// If student has voter type:
await adminService.updateVoter(studentId, formData)

// If student has respondent type:
await adminService.updateRespondent(studentId, formData)

// Both run in parallel via Promise.all()
```

**Modal Size:** Medium (`size="md"`)

---

### 2. ViewStudentDetailsModal.jsx
**Purpose:** Read-only view of complete student information

**Sections:**

#### Header Card
- Full name (First + Last)
- Email address
- Status badge (Active/Suspended/Archived)

#### Participant Types
- Shows badges for each type:
  - 🔵 Election Voter
  - 🟢 Polling Respondent
- Shows message if no types

#### Student Information
- School ID
- Program
- Year & Section

#### Account Information
- Created date (formatted: "Month DD, YYYY at HH:MM")
- Last Updated date (formatted)
- User ID (for reference)

**Features:**
- ✅ Clean, organized layout with fieldsets
- ✅ Uses design tokens (--v-surface, --v-border, etc.)
- ✅ Handles missing data gracefully (shows "—")
- ✅ Proper date formatting
- ✅ Close button to dismiss

**Modal Size:** Medium (`size="md"`)

---

## Component Integration

### StudentActionsMenu.jsx Updates
**Before:**
```javascript
onClick={() => toastError('Edit functionality coming soon')}
onClick={() => toastError('View details coming soon')}
```

**After:**
```javascript
onClick={() => onEdit(student)}
onClick={() => onViewDetails(student)}
```

**New Props:**
- `onEdit` - Callback to trigger edit modal
- `onViewDetails` - Callback to trigger view modal

---

### StudentsPanel.jsx Updates

#### New State Variables:
```javascript
const [editTarget, setEditTarget] = useState(null)
const [viewTarget, setViewTarget] = useState(null)
```

#### New Imports:
```javascript
import EditStudentModal from './EditStudentModal'
import ViewStudentDetailsModal from './ViewStudentDetailsModal'
```

#### New Props Passed to StudentActionsMenu:
```javascript
<StudentActionsMenu
  student={student}
  onStatusChange={setStatusTarget}
  onEdit={setEditTarget}           // NEW
  onViewDetails={setViewTarget}     // NEW
  savingId={savingId}
/>
```

#### New Modal Renders:
```javascript
{/* Edit Student Modal */}
{editTarget && (
  <EditStudentModal
    student={editTarget}
    onClose={() => setEditTarget(null)}
    onSaved={() => {
      setEditTarget(null)
      fetchStudents()
    }}
  />
)}

{/* View Student Details Modal */}
{viewTarget && (
  <ViewStudentDetailsModal
    student={viewTarget}
    onClose={() => setViewTarget(null)}
  />
)}
```

---

## User Flow

### Edit Flow:
1. User clicks **"Edit"** button in actions column
2. `EditStudentModal` opens with pre-filled form
3. User modifies fields (name, school ID, program, section)
4. User clicks **"Save Changes"**
5. Loading spinner appears on button
6. Both voter and respondent records are updated in parallel
7. Success toast: "Student information updated"
8. Modal closes
9. Table refreshes with updated data

### View Flow:
1. User clicks **"View"** button in actions column
2. `ViewStudentDetailsModal` opens
3. User sees complete student information in organized sections
4. User can read all details (types, student info, account info)
5. User clicks **"Close"** button
6. Modal closes
7. No data changes

---

## Data Consistency

### Edit Updates Both Records
Since students have dual membership (voter + respondent), editing student information updates **BOTH** participant type records:

```javascript
const promises = []

if (student.hasVoterType) {
  promises.push(adminService.updateVoter(student.id, form))
}
if (student.hasRespondentType) {
  promises.push(adminService.updateRespondent(student.id, form))
}

await Promise.all(promises)
```

This ensures:
- ✅ Name changes reflect in both election voting and poll responding
- ✅ School ID is consistent across both types
- ✅ Program/section data stays synchronized
- ✅ No data drift between voter and respondent records

---

## Comparison: Students vs Judges

| Feature | Students | Judges |
|---------|----------|--------|
| **Edit** | ✅ Edit name, school ID, program, section | ✅ Edit name, title, affiliation, expertise |
| **View Details** | ✅ Full read-only view | ❌ Not available |
| **Email** | Read-only in edit | Read-only in edit |
| **Dropdowns** | Program, Year & Section (from taxonomy) | Affiliation (optional text) |
| **Dual Updates** | Yes (voter + respondent) | No (judge only) |
| **Additional Details** | Always visible | Collapsible section |
| **Organizer Assignment** | N/A | Yes (checkbox list) |

---

## Validation Rules

### Required Fields (Edit Modal):
- ✅ First Name
- ✅ Last Name
- ✅ School ID
- ✅ Program (must select from dropdown)
- ✅ Year & Section (must select from dropdown)

### Disabled if Missing Taxonomy:
If programs or sections are not defined in System Settings:
- Form shows warning alert
- Submit button is disabled
- Link provided to System Settings page

---

## Error Handling

### Edit Modal Errors:
1. **Network Error:** Shows toast with error message
2. **Validation Error:** Shows field-specific errors (from backend)
3. **Missing Taxonomy:** Shows warning + disabled submit
4. **Partial Failure:** If one update fails, shows error but completes others

### View Modal Errors:
- No API calls, so no error states needed
- Handles missing data with "—" placeholder
- Handles missing dates gracefully

---

## Design Patterns Used

### Modal Structure (Both):
```
<Modal title="..." size="md">
  <div className="space-y-4">
    <fieldset>...</fieldset>
    <FormAlert>...</FormAlert>
    <div className="flex justify-end gap-2 border-t border-v-border pt-4">
      <Button>Cancel/Close</Button>
      <Button>Action</Button>
    </div>
  </div>
</Modal>
```

### Fieldset Organization:
```html
<fieldset className="space-y-3">
  <legend className="v-section-title">Section Title</legend>
  <p className="v-caption">Description</p>
  <!-- Fields here -->
</fieldset>
```

### Detail Row Pattern (View Modal):
```jsx
function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between border-b border-v-border py-3">
      <span className="text-sm font-medium text-v-text-secondary">{label}</span>
      <span className="text-sm text-v-text">{value || '—'}</span>
    </div>
  )
}
```

---

## Testing Scenarios

### Edit Modal:
- [ ] Modal opens with correct pre-filled data
- [ ] Email field is disabled
- [ ] All other fields are editable
- [ ] Dropdowns show taxonomy options
- [ ] Required field validation works
- [ ] Submit button shows loading state
- [ ] Success updates both voter and respondent
- [ ] Table refreshes after save
- [ ] Cancel button closes without saving
- [ ] Error messages display correctly

### View Modal:
- [ ] Modal opens with correct student
- [ ] All sections display correctly
- [ ] Badges show correct participant types
- [ ] Dates are formatted properly
- [ ] Missing data shows "—"
- [ ] Status badge has correct color
- [ ] Close button works
- [ ] No data is editable

---

## Files Changed

### New Files:
1. `frontend/src/components/admin/EditStudentModal.jsx` (192 lines)
2. `frontend/src/components/admin/ViewStudentDetailsModal.jsx` (105 lines)

### Modified Files:
1. `frontend/src/components/admin/StudentsPanel.jsx` (+25 lines)
2. `frontend/src/components/admin/StudentActionsMenu.jsx` (simplified)

---

## Benefits

1. ✅ **Feature Parity** - Students panel now has same functionality as Judges
2. ✅ **Better UX** - Users can view and edit without leaving the page
3. ✅ **Data Consistency** - Edit updates both voter and respondent records
4. ✅ **Clean Design** - Consistent modal patterns throughout admin
5. ✅ **Error Handling** - Proper validation and error messages
6. ✅ **No Dead Buttons** - All actions are now functional

---

**Status:** ✅ Complete and Ready for Testing
**Date:** December 2024
