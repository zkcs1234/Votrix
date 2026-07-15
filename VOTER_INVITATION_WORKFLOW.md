# Voter Invitation Workflow - Documentation

## Overview

This document describes the redesigned voter invitation workflow that separates **registration** from **email invitation**. Organizers can now register voters without immediately sending invitation emails, giving them full control over when invitations are sent.

---

## New Workflow

### CSV Upload

**Before (Old Workflow):**

```
Upload CSV → Register voters → Enroll in event → Create invitation → Send email automatically
```

**New Workflow:**

```
Upload CSV → Preview data → Click "Register Voters" → Create voter accounts → Enroll in event → Create pending invitation
```

Later:

```
Voters page → Click "Send Invitations" → Send emails to pending voters → Update status
```

### Manual Invitation

**New Voter:**

```
Enter email + temporary password → Click "Register Voter" → Create account → Enroll in event → Create pending invitation (no email)
```

**Registered Voter:**

```
Enter email → Click "Register to Event" → Enroll in event → Create pending invitation (no email)
```

Later, organizer can send invitations individually or send all pending invitations.

---

## Database Schema

No schema changes required. The existing `invitations` table already has the `invitation_sent` boolean field:

```sql
CREATE TABLE invitations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  voter_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  temp_password       TEXT,
  invitation_sent     BOOLEAN NOT NULL DEFAULT FALSE,  -- Already exists!
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invitations_unique UNIQUE (event_id, voter_id)
);
```

---

## API Endpoints

### New Endpoints (Election Module)

| Method | Endpoint                                                              | Description                                   |
| ------ | --------------------------------------------------------------------- | --------------------------------------------- |
| POST   | `/organizer/election/events/:eventId/voters/register`                 | Register new voter without sending email      |
| POST   | `/organizer/election/events/:eventId/voters/register-existing`        | Register existing voter without sending email |
| POST   | `/organizer/election/events/:eventId/voters/:voterId/send-invitation` | Send invitation for specific voter            |
| POST   | `/organizer/election/events/:eventId/voters/send-all`                 | Send all pending invitations                  |
| POST   | `/organizer/election/events/:eventId/voters/import-preview`           | Preview CSV without registering               |
| POST   | `/organizer/election/events/:eventId/voters/import-register`          | Register voters from previewed CSV data       |

### New Endpoints (Polling Module)

| Method | Endpoint                                                                  | Description                                        |
| ------ | ------------------------------------------------------------------------- | -------------------------------------------------- |
| POST   | `/organizer/polling/events/:eventId/respondents/register`                 | Register new respondent without sending email      |
| POST   | `/organizer/polling/events/:eventId/respondents/register-existing`        | Register existing respondent without sending email |
| POST   | `/organizer/polling/events/:eventId/respondents/:voterId/send-invitation` | Send invitation for specific respondent            |
| POST   | `/organizer/polling/events/:eventId/respondents/send-all`                 | Send all pending invitations                       |
| POST   | `/organizer/polling/events/:eventId/respondents/import-preview`           | Preview CSV without registering                    |
| POST   | `/organizer/polling/events/:eventId/respondents/import-register`          | Register respondents from previewed CSV data       |
| GET    | `/organizer/polling/events/:eventId/voters`                               | List registered respondents                        |

### New Endpoints (Competition Module)

| Method | Endpoint                                                                 | Description                                  |
| ------ | ------------------------------------------------------------------------ | -------------------------------------------- |
| POST   | `/organizer/competition/events/:eventId/judges/register`                 | Register new judge without sending email     |
| POST   | `/organizer/competition/events/:eventId/judges/:judgeId/send-invitation` | Send invitation for specific judge           |
| POST   | `/organizer/competition/events/:eventId/judges/send-all`                 | Send all pending judge invitations           |
| POST   | `/organizer/competition/events/:eventId/judges/import-preview`           | Preview CSV without registering              |
| POST   | `/organizer/competition/events/:eventId/judges/import-register`          | Register judges from previewed CSV data      |
| GET    | `/organizer/competition/events/:eventId/judges`                          | List judges (now includes invitation status) |

### Existing Endpoints (Still Working - Backward Compatible)

| Method | Endpoint                                                                | Description                                          |
| ------ | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| POST   | `/organizer/election/events/:eventId/voters/invite`                     | Legacy: Register + send email (still works)          |
| POST   | `/organizer/election/events/:eventId/voters/:voterId/resend-invitation` | Legacy: Resend invitation email for a specific voter |
| GET    | `/organizer/election/events/:eventId/voters`                            | List voters (now includes invitation status)         |

---

## Backend Services

### Modified Files

1. **`backend/src/services/invitation.service.js`**
   - Added `registerVoterToEvent()` - Register without email
   - Added `registerExistingVoter()` - Register existing voter without email
   - Added `sendVoterInvitation()` - Send invitation for enrolled voter
   - Added `sendAllPendingInvitations()` - Batch send all pending invitations
   - Original `inviteVoterToEvent()` and `inviteRegisteredVoter()` still work (backward compatible)

2. **`backend/src/services/csv-import.service.js`**
   - Added `previewCsv()` - Parse and validate CSV without creating records
   - Added `registerVotersFromCsv()` - Register voters without sending emails

3. **`backend/src/services/election.service.js`**
   - Updated `listEventVoters()` - Now includes `invitationSent` status from invitations table

4. **`backend/src/services/pageant.service.js`**
   - Added `registerJudge()` - Register judge without email
   - Added `sendJudgeInvitation()` - Send invitation for enrolled judge
   - Added `sendAllPendingJudgeInvitations()` - Batch send all pending judge invitations
   - Updated `listJudges()` - Now includes `invitationSent` status from invitations table
   - Original `inviteJudge()` still works (backward compatible)

### New Files

None - all changes are additive.

---

## Frontend Changes

### Modified Files

1. **`frontend/src/services/election.service.js`**
   - Added `registerVoter()`, `registerExistingVoter()`, `sendInvitation()`, `sendAllInvitations()`, `previewCsv()`, `registerCsv()`

2. **`frontend/src/services/polling.service.js`**
   - Added same methods as election service + `listVoters()`

3. **`frontend/src/pages/organizer/election/ElectionVotersPage.jsx`**
   - Completely rewritten with new workflow
   - CSV: Upload → Preview Modal → Register Voters button
   - Manual: "Register Voter" and "Register to Event" buttons
   - Table: Added invitation status column (Pending/Sent)
   - Added "Send Invitation" button per voter
   - Added "Send All Invitations" button

4. **`frontend/src/pages/organizer/polling/PollingRespondentsPage.jsx`**
   - Same redesign as ElectionVotersPage

5. **`frontend/src/services/pageant.service.js`**
   - Added `registerJudge()`, `sendJudgeInvitation()`, `sendAllJudgeInvitations()`, `previewJudgesCsv()`, `registerJudgesCsv()`

6. **`frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx`**
   - Completely rewritten with new workflow
   - CSV: Upload → Preview Modal → Register Judges button
   - Manual: "Register Judge" button (no email sent)
   - Table: Added invitation status column (Pending/Sent)
   - Added "Send Invitation" button per judge
   - Added "Send All Invitations" button

---

## Invitation Status Values

The voter list now returns invitation status:

| Status  | Meaning                     | Action              |
| ------- | --------------------------- | ------------------- |
| `false` | Pending - No email sent yet | Can send invitation |
| `true`  | Sent - Email has been sent  | Cannot send again   |

---

## UI Expectations

### CSV Upload Flow

1. User uploads CSV file
2. System shows preview modal with parsed data
3. User reviews data and clicks "Register Voters"
4. System registers voters (no emails sent)
5. Success message shows "Registered X voters. Send invitations later."

### Manual Registration Flow

1. User enters email + password (for new voter) or just email (for existing)
2. Clicks "Register Voter" or "Register to Event"
3. System creates account/enrollment with pending invitation
4. Voter appears in list with "Pending" status

### Sending Invitations

1. User views voter list
2. Clicks "Send Invitation" on a specific voter, OR
3. Clicks "Send All Invitations" to send to all pending voters
4. System sends emails and updates status to "Sent"

---

## Rollback Plan

If issues occur:

1. **Frontend rollback**: Use old endpoints (`/voters/invite`, `/voters/invite-existing`, `/voters/import`) - they still work
2. **Backend rollback**: No changes needed to existing endpoints - all new functionality is additive

---

## Security Considerations

- All existing validation and security checks are preserved
- CSRF protection works for all new endpoints
- Rate limiting applies to all new endpoints
- Organizer ownership checks are performed on all operations

---

## Testing Checklist

- [ ] CSV Upload → Preview → Register Voters → No email sent
- [ ] Manual Register Voter → No email sent → Status = Pending
- [ ] Manual Register to Event → No email sent → Status = Pending
- [ ] Voter list shows invitation status (Pending/Sent)
- [ ] Send Invitation button works for single voter
- [ ] Send All Invitations works for all pending voters
- [ ] Old endpoints (`/invite`, `/invite-existing`, `/import`) still work
- [ ] Failed email sending can be retried
- [ ] Duplicate enrollment is prevented
- [ ] Notifications are created when invitation is sent
- [ ] Competition: CSV Upload → Preview → Register Judges → No email sent
- [ ] Competition: Manual Register Judge → No email sent → Status = Pending
- [ ] Competition: Judge list shows invitation status (Pending/Sent)
- [ ] Competition: Send Invitation button works for single judge
- [ ] Competition: Send All Invitations works for all pending judges
- [ ] Competition: Old `/judges/invite` and `/judges/import` endpoints still work
