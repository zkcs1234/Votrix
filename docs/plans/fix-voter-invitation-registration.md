# Fix Voter/Respondent/Judge Registration & Invitation Flows

## Problem Summary

Across all three modules (Election, Competition, Polling), the voter/respondent/judge registration and invitation flows have several bugs:

1. **CSV upload uses wrong emails** — After downloading template, editing emails, and uploading, the system may use the original template email instead of the edited ones.
2. **Manual registration requires `temporaryPassword`** — Frontend sends `{ email }` but backend validator `validateInviteVoter()` requires `temporaryPassword`, causing a 400 error.
3. **Missing CSV template download** — Competition Judges and Polling Respondents pages lack the "Download CSV template" link.
4. **Inconsistent CSV import flow** — Competition uses a different CSV import path than Election/Polling, with duplicated logic.
5. **Preview data structure mismatch** — `previewCsv` returns `{ email, type, rowNumber, alreadyEnrolled }` but `registerVotersFromCsv` expects `{ email, temporaryPassword }`, relying on undefined fallback.
6. **No feedback on CSV upload** — Users don't see confirmation of which emails were registered vs skipped.

---

## Root Cause Analysis

### Issue 1: CSV upload ignoring edited emails

**Root Cause:** The `downloadCsvTemplate()` function (only in `ElectionVotersPage.jsx`) generates a CSV with `email` header. When the user edits the emails in Excel and uploads, the `handleCsvPreview` sends the file to `previewCsv` which parses it correctly. The `CsvPreviewModal` shows the correct data. Then `handleCsvRegister` sends `csvPreview.data` to `registerCsv`.

**However**, the `registerVotersFromCsv` function in `csv-import.service.js` processes `parsedData` which is `csvPreview.data` — this contains `{ email, type, rowNumber, alreadyEnrolled }`. The function iterates through this array and calls `registerVoterToEvent` with `row.email`. This should work correctly.

**Actual bug:** The problem is likely that the file input doesn't properly reset between uploads, causing the browser to cache the previous file selection. When `e.target.value = ''` is set after preview, it resets the input, but if the user selects the same file again, the `onChange` event may not fire in some browsers.

**Secondary issue:** The `registerVotersFromCsv` function passes `row.temporaryPassword` which is `undefined` from preview data. While `registerVoterToEvent` handles this by generating a temp password, the `importVotersFromCsv` (the OLD function used for invite+register) checks `if (!invite.email?.sent)` and throws if email wasn't sent — but this function is for the new "register only" flow, so this check is wrong.

### Issue 2: Manual registration requires tempPassword

**Root Cause:** The `validateInviteVoter` validator in `backend/src/validators/email.validator.js` requires `temporaryPassword`:

```javascript
export function validateInviteVoter(body) {
  const email = validateEmailField(body?.email);
  const temporaryPassword = body?.temporaryPassword;

  if (!temporaryPassword) {
    throw new ApiError(400, "Temporary password is required");
  }
  // ...
}
```

But the frontend registration forms (`ElectionVotersPage.jsx`, `CompetitionJudgesPage.jsx`, `PollingRespondentsPage.jsx`) only send `{ email }` without a password. The backend `registerVoterToEvent` service already handles auto-generating a password when `temporaryPassword` is not provided, but it never gets that far because the validator rejects the request first.

### Issue 3: Missing CSV template download links

**Root Cause:** The `downloadCsvTemplate` function is only defined in `ElectionVotersPage.jsx`. The `CompetitionJudgesPage.jsx` and `PollingRespondentsPage.jsx` have CSV upload UI but no "Download CSV template" button/link.

### Issue 4: Competition CSV import uses different path

**Root Cause:** The competition module's `registerImportJudgesCsv` controller in `pageant-organizer.controller.js` uses its own loop calling `pageantService.registerJudge()` instead of using the shared `registerVotersFromCsv` from `csv-import.service.js`. This creates inconsistency and potential for bugs.

---

## Implementation Plan

### Fix 1: Make `temporaryPassword` optional in registration validator

**File:** `backend/src/validators/email.validator.js`

Change `validateInviteVoter` to make `temporaryPassword` optional:

```javascript
export function validateInviteVoter(body) {
  const email = validateEmailField(body?.email);
  const temporaryPassword = body?.temporaryPassword;

  // temporaryPassword is optional — backend will auto-generate if not provided
  if (temporaryPassword && temporaryPassword.length < 8) {
    throw new ApiError(400, "Temporary password must be at least 8 characters");
  }

  return { email, temporaryPassword: temporaryPassword || undefined };
}
```

**Impact:** All three modules (Election, Competition, Polling) will now accept manual registration without requiring a temporary password from the frontend.

### Fix 2: Add CSV template download to Competition and Polling pages

**File:** `frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx`

Add the `downloadCsvTemplate` function and the download link in the CSV Upload section:

```jsx
function downloadCsvTemplate() {
  const headers = ["email"];
  const exampleRows = [["judge@example.com"]];
  downloadCsv("judge-import-template.csv", headers, exampleRows);
}
```

Add UI button:

```jsx
<button
  type="button"
  onClick={downloadCsvTemplate}
  className="text-sm text-v-primary hover:text-v-primary-hover underline"
>
  Download CSV template
</button>
```

**File:** `frontend/src/pages/organizer/polling/PollingRespondentsPage.jsx`

Same pattern with `downloadCsvTemplate`:

```jsx
function downloadCsvTemplate() {
  const headers = ["email"];
  const exampleRows = [["respondent@example.com"]];
  downloadCsv("respondent-import-template.csv", headers, exampleRows);
}
```

### Fix 3: Standardize CSV import flow for Competition module

**File:** `backend/src/controllers/pageant-organizer.controller.js`

Update `registerImportJudgesCsv` to use the shared `registerVotersFromCsv` from `csv-import.service.js` instead of its own loop. However, since judges need `is_judge=true` in `event_voters`, we need to ensure the shared function handles this.

**Alternative approach:** Keep the competition-specific CSV import but fix the `registerJudge` service call to not require `temporaryPassword` (already covered by Fix 1).

### Fix 4: Fix CSV import to properly handle preview data structure

**File:** `backend/src/services/csv-import.service.js`

Update `registerVotersFromCsv` to properly handle the preview data structure by:

1. Filtering out `alreadyEnrolled` rows before processing
2. Adding better error reporting for skipped rows

```javascript
export async function registerVotersFromCsv(eventId, organizerId, parsedData) {
  // Filter out already enrolled voters
  const toRegister = parsedData.filter((row) => !row.alreadyEnrolled);
  const skippedCount = parsedData.length - toRegister.length;

  if (toRegister.length === 0) {
    return {
      total: parsedData.length,
      succeeded: 0,
      failed: 0,
      skipped: skippedCount,
      results: [],
    };
  }

  const results = [];
  const enrolledVoterIds = [];

  for (const row of toRegister) {
    let result;
    try {
      if (row.type === "new") {
        result = await registerVoterToEvent({
          eventId,
          email: row.email,
          organizerId,
          // No temporaryPassword — auto-generate
          resetPasswordForExisting: false,
        });
        enrolledVoterIds.push(result.user.id);
      } else {
        result = await registerExistingVoter({
          eventId,
          email: row.email,
          organizerId,
        });
        enrolledVoterIds.push(result.user.id);
      }

      results.push({
        email: row.email,
        success: true,
        isNewVoter: row.type === "new",
        invitationSent: false,
      });
    } catch (err) {
      results.push({
        email: row.email,
        success: false,
        error: err.message,
      });
    }
  }

  return {
    total: parsedData.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    skipped: skippedCount,
    results,
  };
}
```

### Fix 5: Add import result feedback to Competition and Polling pages

**File:** `frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx`

The `importResult` state already exists but after CSV register, the result should show succeed/failed counts:

```jsx
{
  importResult && (
    <div className="mt-2 space-y-1">
      <p className="v-caption text-v-success">
        Registered {importResult.succeeded} of {importResult.total}.
      </p>
      {importResult.skipped > 0 && (
        <p className="v-caption text-v-warning">
          {importResult.skipped} already enrolled, skipped.
        </p>
      )}
      {importResult.failed > 0 && (
        <p className="v-caption text-v-danger">{importResult.failed} failed.</p>
      )}
    </div>
  );
}
```

**File:** `frontend/src/pages/organizer/polling/PollingRespondentsPage.jsx`

Same pattern for the polling respondents page.

### Fix 6: Add file input reset for multiple CSV uploads

**File:** `frontend/src/pages/organizer/election/ElectionVotersPage.jsx`
**File:** `frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx`
**File:** `frontend/src/pages/organizer/polling/PollingRespondentsPage.jsx`

Add a `fileInputRef` to allow re-selecting the same file:

```jsx
const fileInputRef = useRef(null)

// In the CSV upload section:
<input
  ref={fileInputRef}
  type="file"
  accept=".csv"
  className="v-caption"
  onChange={handleCsvPreview}
/>

// In handleCsvPreview, after processing:
if (fileInputRef.current) {
  fileInputRef.current.value = ''
}
```

### Fix 7: Fix Competition judges CSV import to use consistent flow

**File:** `backend/src/controllers/pageant-organizer.controller.js`

Update `registerImportJudgesCsv` to use the shared `registerVotersFromCsv` function, then mark registered users as judges:

```javascript
export const registerImportJudgesCsv = asyncHandler(async (req, res) => {
  const { data } = req.body;
  if (!data || !Array.isArray(data))
    throw new ApiError(400, "Invalid import data");

  // Use shared CSV registration (no email sent)
  const result = await registerVotersFromCsv(
    req.params.eventId,
    req.user.id,
    data,
  );

  // Mark all successfully registered users as judges
  if (result.succeeded > 0) {
    const { db } = await import("../foundation/db.js");
    const { DB_TABLES } = await import("../utils/constants.js");

    const successfulEmails = result.results
      .filter((r) => r.success)
      .map((r) => r.email);

    // Update event_voters to set is_judge = true
    for (const email of successfulEmails) {
      // Find the voter_id for this email
      const { data: voter } = await db()
        .from(DB_TABLES.USERS)
        .select("id")
        .eq("email", email)
        .single();

      if (voter) {
        await db()
          .from(DB_TABLES.EVENT_VOTERS)
          .update({ is_judge: true })
          .eq("event_id", req.params.eventId)
          .eq("voter_id", voter.id);
      }
    }
  }

  res.json({ success: true, ...result });
});
```

### Fix 8: Update Competition judges list to include `invitationSent` status

**File:** `backend/src/services/pageant.service.js`

The `listJudges` function already returns `invitationSent` from the invitations table. This is correct and already working.

### Fix 9: Fix `invitationSent` null vs false inconsistency in Competition judges table

**Root Cause:** The `pageant.service.js` `listJudges` function returns `invitationSent: invitationMap[row.users?.id] ?? null` for judges without invitations. This returns `null` (not `false`), while the frontend `CompetitionJudgesPage.jsx` checks `participant.invitationSent === false` using strict equality. This means judges with no invitation record — which is the default state after registration — will NOT show the "Send Invitation" button because `null === false` is `false`.

**Contrast with Election and Polling:**

- **Election** (`election.service.js`): Returns `invitationSent: invitationSentByVoter.get(row.voter_id) ?? false` — defaults to `false` ✓
- **Polling** (`polling.service.js`): Returns `invitationSent: invitationSentByVoter.get(row.voter_id) ?? false` — defaults to `false` ✓
- **Competition** (`pageant.service.js`): Returns `invitationSent: invitationMap[row.users?.id] ?? null` — defaults to `null` ✗

**File 1:** `backend/src/services/pageant.service.js`

Fix the `listJudges` function to return `false` instead of `null`:

```javascript
// Change this line:
invitationSent: invitationMap[row.users?.id] ?? null,
// To:
invitationSent: invitationMap[row.users?.id] ?? false,
```

**File 2:** `frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx`

Fix the strict equality check to use loose check (or `!` negation) for consistency:

```javascript
// Change this line:
if (participant.invitationSent === false) {
// To:
if (!participant.invitationSent) {
```

This also fixes the `pendingCount` calculation which uses `j.invitationSent === false` — same issue:

```javascript
// Change this line:
const pendingCount = judges.filter((j) => j.invitationSent === false).length;
// To:
const pendingCount = judges.filter((j) => !j.invitationSent).length;
```

**Impact:** After both fixes, judges with no invitation record will correctly show the "Send Invitation" button in the table, matching the behavior of the Election and Polling modules.

---

## Files to Change

| File                                                                 | Change                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `backend/src/validators/email.validator.js`                          | Fix 1 — Make `temporaryPassword` optional                                       |
| `frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx` | Fix 2, 5, 6 — Add CSV template download, import result feedback, file input ref |
| `frontend/src/pages/organizer/polling/PollingRespondentsPage.jsx`    | Fix 2, 5, 6 — Add CSV template download, import result feedback, file input ref |
| `backend/src/services/csv-import.service.js`                         | Fix 4 — Handle `alreadyEnrolled`, improve error reporting                       |
| `backend/src/controllers/pageant-organizer.controller.js`            | Fix 7 — Use shared `registerVotersFromCsv` for judges CSV                       |
| `frontend/src/pages/organizer/election/ElectionVotersPage.jsx`       | Fix 6 — Add file input ref for multiple uploads                                 |
| `frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx` | Fix 9 — Fix `invitationSent` strict equality check (`=== false` → `!`)          |
| `backend/src/services/pageant.service.js`                            | Fix 9 — Return `invitationSent` as `false` instead of `null` for consistency    |

---

## Testing Plan

### Manual Registration (all 3 modules)

1. **Election Voters:** Navigate to `/organizer/election/events/{id}/voters`
   - Enter a valid email in the "Register Manually" form
   - Click "Register"
   - **Expected:** Voter is registered without requiring a password. Shows "Registered" success toast.
   - Verify voter appears in the table with "Pending" invitation status.

2. **Competition Judges:** Navigate to `/organizer/competition/events/{id}/judges`
   - Enter a valid email in the "Register Manually" form
   - Click "Register"
   - **Expected:** Judge is registered without requiring a password. Shows success toast.
   - Verify judge appears in the table.

3. **Polling Respondents:** Navigate to `/organizer/polling/events/{id}/respondents`
   - Enter a valid email in the "Register Manually" form
   - Click "Register"
   - **Expected:** Respondent is registered without requiring a password. Shows success toast.

### CSV Registration (all 3 modules)

1. **Election Voters:**
   - Click "Download CSV template"
   - Open the downloaded CSV, edit the email to a new address
   - Upload the edited CSV
   - **Expected:** Preview shows the edited email, not the template example
   - Click "Register" in the preview modal
   - **Expected:** Voter is registered with the edited email

2. **Competition Judges:**
   - Verify "Download CSV template" link exists
   - Download, edit, upload
   - **Expected:** Same flow as election voters

3. **Polling Respondents:**
   - Verify "Download CSV template" link exists
   - Download, edit, upload
   - **Expected:** Same flow as election voters

### Invitation Flow (all 3 modules)

1. After registering a voter/judge/respondent via CSV or manual:
   - Verify "Send Invitation" button appears in the table row
   - Click "Send Invitation"
   - **Expected:** Invitation email is sent (or shows appropriate error if email service not configured)
   - Verify invitation status changes to "Sent"

2. "Send All Invitations" button:
   - With multiple pending registrations, click "Send All Invitations"
   - **Expected:** All pending invitations are sent
