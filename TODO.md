# TODO: Participant Information Form Feature

## Status Overview

| Phase     | Description                                 | Status      |
| --------- | ------------------------------------------- | ----------- |
| Phase 1   | Database Migration (Migration 030)          | ✅ Complete |
| Phase 2   | Backend API (controllers, routes, services) | ✅ Complete |
| Phase 2.5 | Frontend API service methods                | ✅ Complete |
| Phase 3   | Shared Frontend Form Builder Component      | ✅ Complete |
| Phase 4   | Election Module integration                 | ✅ Complete |
| Phase 5   | Competition Module integration              | ✅ Complete |
| Phase 6   | Polling Module integration                  | ✅ Complete |
| Phase 7   | Verification & Testing                      | ⏳ Pending  |

---

## Completed Work

### Phase 1: Database Migration ✅

- `migrations/030_event_information_form_schema.sql` — adds `events.information_form_schema JSONB` column
- `migrations/030_down_event_information_form_schema.sql` — rollback

### Phase 2: Backend API ✅

- `event.service.js` — `getEventInformationForm()` and `setEventInformationForm()` with validation
- **Election Controller**: `getInformationForm`, `updateInformationForm`
- **Pageant/Competition Controller**: `getInformationForm`, `updateInformationForm`
- **Polling Controller**: `getInformationForm`, `updateInformationForm`
- **Routes**: All 3 modules have `GET/PATCH /events/:eventId/information-form`

### Phase 2.5: Frontend API Services ✅

- `election.service.js` — `getInformationForm(eventId)`, `updateInformationForm(eventId, schema)`
- `pageant.service.js` — `getInformationForm(eventId)`, `updateInformationForm(eventId, schema)`
- `polling.service.js` — `getInformationForm(eventId)`, `updateInformationForm(eventId, schema)`

### Phase 3: Shared Frontend Component — Form Builder ✅

- `frontend/src/components/organizer/ParticipantInformationFormBuilder.jsx` — Complete component with:
  - Add field button (text, dropdown, number)
  - Field definition rows with label, type selector, required toggle
  - Dynamic options list for dropdown type
  - Remove field button per row
  - Preview section showing how form looks
  - Toggle to enable/disable the form

### Phase 4: Election Module ✅

- `ElectionEventFormPage.jsx` — Added Information Form step (Step 3)
- Route: `/organizer/election/events/:eventId/form`
- Navigation from branding step → information form → positions

### Phase 5: Competition Module ✅

- `CompetitionEventFormPage.jsx` — Added Information Form step (Step 3)
- Route: `/organizer/competition/events/:eventId/form`
- Navigation from branding step → information form → contestants

### Phase 6: Polling Module ✅

- `PollingEventFormPage.jsx` — Added Information Form step (Step 4)
- Route: `/organizer/polling/events/:eventId/form`
- Navigation from settings step → information form → builder

---

## Remaining Work

### Phase 7: Verification

- [ ] Test full flow across all 3 modules
- [ ] Verify form data is saved/retrieved via API
- [ ] Test voter/respondent side - ensure information form is displayed when accessing event
