# Election Module Enhancement - Phase 1: Quick Wins

## [x] 1. Audit Logging for All Election Actions (C1)

- [x] Backend: Added `recordAudit()` calls to `election.service.js` for all mutations
- [x] Events: create, update, voting toggle (+ enable/disable)
- [x] Positions: create, delete
- [x] Candidates: create, delete

## [ ] 2. Candidate Search & Filter (H2)

- [ ] Frontend: Add search input to `ElectionCandidatesPage.jsx`
- [ ] Frontend: Add position dropdown filter
- [ ] Frontend: Client-side filtering logic

## [ ] 3. Voter List CSV Export (M4)

- [ ] Frontend: Add "Export CSV" button to `ElectionVotersPage.jsx`
- [ ] Frontend: CSV generation and download function

## [ ] 4. CSV Template Download (L2)

- [ ] Frontend: Add "Download CSV template" link to `ElectionVotersPage.jsx`

## [ ] 5. Dashboard Caching (M1)

- [ ] Backend: Add in-memory cache to `getOrganizerDashboard()`
- [ ] Backend: Cache invalidation on vote submission and event mutations

## [ ] 6. CSV Duplicate Detection (M2)

- [x] Backend: Already partially implemented in `previewCsv()` - verified correct
- [ ] Frontend: Show duplicate warnings in CSV preview modal

---

# Polling Module Implementation - Phase 1: Quick Wins

## [x] 1. Question Duplication (C1)

- [x] Backend: Add duplicate endpoint to polling-organizer.routes.js
- [x] Backend: Add duplicateQuestion method to polling.service.js
- [x] Frontend: Add duplicate button to PollingBuilderPage.jsx

## [x] 2. Progress Indicator for Respondents (H2)

- [x] Frontend: Add styled progress bar to VoterPollPage.jsx

## [x] 3. Completion Time Analytics (H3)

- [x] Backend: Add started_at/completed_at to poll_submissions (migration 027)
- [x] Frontend: Track started_at in VoterPollPage
- [x] Backend: Compute avg completion time in analytics
- [ ] Frontend: Display in PollingAnalyticsPage

## [ ] 4. Accessibility Improvements (H4)

- [ ] Frontend: Add fieldset/legend to PollQuestionField
- [ ] Frontend: Add aria-pressed to rating buttons
- [ ] Frontend: Add aria-live for ranking changes

## [x] 5. Poll Status Display (M3)

- [x] Frontend: Show start/end dates when poll is closed

## [x] 6. Autosave Restoration Notification (M6)

- [x] Frontend: Add toast when draft is restored

## [ ] 7. Rating Chart Visualization (M7)

- [ ] Frontend: Replace text ratings with bar charts in PollingAnalyticsPage

## [ ] 8. Poll Scheduling UX (M8)

- [ ] Frontend: Add start_date/end_date to PollingEventFormPage
