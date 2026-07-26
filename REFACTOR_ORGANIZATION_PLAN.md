# Organization Refactoring Plan

## Problem Confirmed

The current design creates **3 separate organization rows** per organizer:

- `getOrCreateElectionOrganization()` → "My Elections" (type: election)
- `getOrCreateCompetitionScoringOrganization()` → "My Competitions" (type: competition_scoring)
- `getOrCreatePollingOrganization()` → "My Polls" (type: polling)

Each also has its own **organization logo upload endpoint**, which is redundant.

## Target Architecture

```
1 Organizer → 1 Organization (no organization_type) → N Events (each with event_type)
```

**Changes needed:**

1. Remove the `organization_type` ENUM from the `organizations` table
2. Remove the `logo` column from `organizations` and move it to `users` table as `organization_logo`
3. Consolidate `getOrCreate*Organization()` into a single `getOrCreateOrganization()`
4. Remove the 3x duplicated logo upload endpoints

---

## Step-by-step Plan

### Phase 1: Database Migration

**File:** `backend/src/database/migrations/028_single_organization_per_organizer.sql`

1. Add `organization_name` column to `users` table (default: "My Organization")
2. Add `organization_logo` column to `users` table (nullable TEXT)
3. Migrate existing organization names and logos to `users` table (pick the first/first-created org per organizer)
4. Backfill any organizers missing an organization reference with a default
5. Add `organizer_id` unique constraint to the `organizations` table (ensure 1:1)
6. **Do NOT drop `organization_type` yet** — mark as deprecated for backward compatibility

**Down migration:** `backend/src/database/migrations/028_down_single_organization_per_organizer.sql`

### Phase 2: Backend — Consolidate Organization Service

**File:** `backend/src/services/organization.service.js`

Replace:

- `getOrCreateElectionOrganization(organizerId)`
- `getOrCreateCompetitionScoringOrganization(organizerId)`
- `getOrCreatePollingOrganization(organizerId)`
- `getOrCreatePageantOrganization(organizerId)`

With a single:

```js
export async function getOrCreateOrganization(organizerId) {
  if (!organizerId) throw new ApiError(400, "organizerId is required");

  const orgs = await listOrganizations(organizerId);
  if (orgs.length > 0) return orgs[0]; // Return first/only organization

  return createOrganization(organizerId, {
    organizationName: "My Organization",
  });
}
```

**Remove:**

- `updateOrganizationLogo(organizerId, organizationType, logoUrl)` → Replace with `updateOrganizationLogo(organizerId, logoUrl)` that updates `users.organization_logo`

### Phase 3: Backend — Update Service Dependencies

**Files to update:**

| File                  | Current Call                                             | New Call                               |
| --------------------- | -------------------------------------------------------- | -------------------------------------- |
| `election.service.js` | `getOrCreateElectionOrganization(organizerId)`           | `getOrCreateOrganization(organizerId)` |
| `pageant.service.js`  | `getOrCreateCompetitionScoringOrganization(organizerId)` | `getOrCreateOrganization(organizerId)` |
| `polling.service.js`  | `getOrCreatePollingOrganization(organizerId)`            | `getOrCreateOrganization(organizerId)` |

### Phase 4: Backend — Remove Duplicated Logo Endpoints

**Files to update:**

1. **`election-organizer.controller.js`** — Remove `uploadOrganizationLogo` handler
2. **`pageant-organizer.controller.js`** — Remove `uploadOrganizationLogo` handler
3. **`polling-organizer.controller.js`** — Remove `uploadOrganizationLogo` handler
4. **`election-organizer.routes.js`** — Remove `POST /organization/logo` route
5. **`pageant-organizer.routes.js`** — Remove `POST /organization/logo` route
6. **`polling-organizer.routes.js`** — Remove `POST /organization/logo` route

Add a **single** `POST /organization/logo` route on the **main organizer router** (`organizer.routes.js`):

```js
router.post(
  "/organization/logo",
  uploadLimiter,
  uploadImage("logo"),
  organizerController.uploadOrganizationLogo,
);
```

### Phase 5: Backend — Update Event Service

**File:** `backend/src/services/event.service.js`

Update `getEventById()` to read `organization_logo` from the `users` table instead of `organizations.logo`:

```sql
events JOIN organizations ON ... JOIN users ON organizations.organizer_id = users.id
```

Or simpler: add a `getOrganizationProfile` function that returns the organization name and logo from the `users` table.

### Phase 6: Backend — Update Admin Service

**File:** `backend/src/services/admin.service.js`

Update `getOrganizersList()` — the organization summary should reflect the new 1:1 model. Since each organizer now has exactly 1 organization, simplify the summary.

### Phase 7: Frontend — Update Event Form Pages

**Files:**

- `frontend/src/pages/organizer/election/ElectionEventFormPage.jsx`
- `frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx`
- `frontend/src/pages/organizer/polling/PollingEventFormPage.jsx`

These all currently have a "Step 2: Branding" that uploads an **event banner** only — this is correct and does NOT need to be removed. The banner is per-event, not per-organization.

However, add a user-facing Organization Settings page with a single logo upload.

### Phase 8: Frontend — Add Organization Settings Page

**New file:** `frontend/src/pages/organizer/OrganizationSettingsPage.jsx`

A simple page where organizer can:

- View/edit organization name
- Upload organization logo (single upload, applies to all events)

**Add route:** in `frontend/src/routes/index.jsx`:

```jsx
<Route path="organization" element={<OrganizationSettingsPage />} />
```

### Phase 9: Frontend — Display Organization Logo

Ensure the organization logo is displayed consistently across all voter-facing pages (dashboard, event pages). Currently the logo is fetched per-module — it should be fetched once and shown globally.

### Phase 10: Cleanup

1. Update `BUSINESS_RULES.md` to reflect the enforced 1:1 rule
2. Update `docs/ai/DATABASE.md` to reflect schema changes
3. Add data migration script to merge existing 3-org organizers into 1

---

## Files Impacted (Complete List)

### Backend (18 files)

| File                                                                             | Change                                   |
| -------------------------------------------------------------------------------- | ---------------------------------------- |
| `backend/src/database/migrations/028_single_organization_per_organizer.sql`      | NEW - migration                          |
| `backend/src/database/migrations/028_down_single_organization_per_organizer.sql` | NEW - down migration                     |
| `backend/src/services/organization.service.js`                                   | REWRITE - consolidate functions          |
| `backend/src/services/election.service.js`                                       | UPDATE - use new getOrCreateOrganization |
| `backend/src/services/pageant.service.js`                                        | UPDATE - use new getOrCreateOrganization |
| `backend/src/services/polling.service.js`                                        | UPDATE - use new getOrCreateOrganization |
| `backend/src/services/event.service.js`                                          | UPDATE - logo from users table           |
| `backend/src/services/admin.service.js`                                          | UPDATE - simplify org summary            |
| `backend/src/controllers/election-organizer.controller.js`                       | REMOVE - uploadOrganizationLogo          |
| `backend/src/controllers/pageant-organizer.controller.js`                        | REMOVE - uploadOrganizationLogo          |
| `backend/src/controllers/polling-organizer.controller.js`                        | REMOVE - uploadOrganizationLogo          |
| `backend/src/controllers/organizer.controller.js`                                | ADD - uploadOrganizationLogo handler     |
| `backend/src/routes/election-organizer.routes.js`                                | REMOVE - /organization/logo route        |
| `backend/src/routes/pageant-organizer.routes.js`                                 | REMOVE - /organization/logo route        |
| `backend/src/routes/polling-organizer.routes.js`                                 | REMOVE - /organization/logo route        |
| `backend/src/routes/organizer.routes.js`                                         | ADD - single /organization/logo route    |
| `backend/src/utils/constants.js`                                                 | UPDATE - ORG_TYPES deprecation           |
| `docs/ai/BUSINESS_RULES.md`                                                      | UPDATE - reflect enforced rules          |

### Frontend (5+ files)

| File                                                        | Change                                    |
| ----------------------------------------------------------- | ----------------------------------------- |
| `frontend/src/pages/organizer/OrganizationSettingsPage.jsx` | NEW - org settings page                   |
| `frontend/src/routes/index.jsx`                             | ADD - organization route                  |
| `frontend/src/pages/organizer/OrganizerDashboardPage.jsx`   | UPDATE - show org logo from single source |
| Various voter pages                                         | MINOR - use users.organization_logo       |

---

## Risk Assessment

| Risk                                       | Impact         | Mitigation                                                                                              |
| ------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------- |
| Existing organizers with 3 orgs            | Data loss      | Migration picks the first-created org and merges                                                        |
| Frontend still references old routes       | 404 errors     | Update all frontend API calls to use new single logo endpoint                                           |
| Voter-facing pages fetch logo per module   | Missing logo   | Update to fetch from organizer's user record                                                            |
| Polling question type registry uses org_id | Broken lookups | Registry uses organization_id which still references the organizations table; consolidate to single org |
