# Features

---

## 1. Authentication

**Purpose:** Secure login/logout for all three roles with JWT cookies, CSRF protection, and first-login password change enforcement.

**Status:** Complete

**Files Involved:**
- `backend/src/controllers/auth.controller.js`
- `backend/src/routes/auth.routes.js`
- `backend/src/middleware/auth.js`
- `backend/src/services/auth.service.js`, `token.service.js`, `user.service.js`
- `backend/src/utils/jwt.js`, `password.js`, `cookies.js`, `csrf.js`
- `frontend/src/pages/auth/AdminLoginPage.jsx`, `OrganizerLoginPage.jsx`, `VoterLoginPage.jsx`
- `frontend/src/pages/auth/ChangePasswordPage.jsx`, `ForgotPasswordPage.jsx`, `ResetPasswordPage.jsx`
- `frontend/src/hooks/useLogin.js`, `useAuth.js`, `useAuthBootstrap.js`, `useCsrfBootstrap.js`
- `frontend/src/store/auth.store.js`
- `frontend/src/services/api.js`, `auth.service.js`

**Database Tables:** `users`, `password_reset_tokens`

**API Endpoints:**
- `GET /api/auth/csrf`
- `POST /api/auth/admin/login`
- `POST /api/auth/organizer/login`
- `POST /api/auth/voter/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`

**Business Rules:** See `docs/ai/BUSINESS_RULES.md` — Auth Rules section

**Dependencies:** `jsonwebtoken`, `bcrypt`, `cookie-parser`

**Future Improvements:**
- OAuth / social login
- 2FA / MFA support
- Session management UI (active sessions list)

---

## 2. Admin Dashboard

**Purpose:** System-wide management: create organizer accounts, view global events, manage system settings, view audit logs, and monitor analytics.

**Status:** Complete

**Files Involved:**
- `backend/src/controllers/admin.controller.js`
- `backend/src/routes/admin.routes.js`
- `backend/src/services/admin.service.js`, `dashboard.service.js`
- `frontend/src/pages/admin/AdminDashboardPage.jsx`
- `frontend/src/pages/admin/OrganizerManagementPage.jsx`
- `frontend/src/pages/admin/GlobalEventsPage.jsx`
- `frontend/src/pages/admin/SystemSettingsPage.jsx`
- `frontend/src/pages/admin/AuditLogsPage.jsx`
- `frontend/src/components/admin/CreateOrganizerModal.jsx`

**Database Tables:** `users`, `organizations`, `events`, `audit_logs`, `system_settings`

**API Endpoints:**
- `GET /api/admin/overview`
- `GET /api/admin/dashboard`
- `GET /api/admin/analytics`
- `GET /api/admin/organizers`
- `POST /api/admin/organizers`
- `PATCH /api/admin/organizers/:organizerId/status`
- `GET /api/admin/events`
- `GET /api/admin/settings`
- `PUT /api/admin/settings`
- `GET /api/admin/audit-logs`

**Business Rules:** Admin role required for all endpoints; organizers created by admin only; account status managed by admin.

**Future Improvements:**
- Bulk organizer import
- Advanced audit log filtering and export
- Real-time admin dashboard stats via WebSocket

---

## 3. Organizer Management (General)

**Purpose:** Organizer-level overview, dashboard, and cross-module voter invitation/notification management.

**Status:** Complete

**Files Involved:**
- `backend/src/controllers/organizer.controller.js`
- `backend/src/routes/organizer.routes.js`
- `backend/src/services/organization.service.js`, `invitation.service.js`, `email.service.js`
- `frontend/src/pages/organizer/OrganizerDashboardPage.jsx`
- `frontend/src/services/organizer.service.js`

**Database Tables:** `organizations`, `events`, `event_voters`, `invitations`

**API Endpoints:**
- `GET /api/organizer/overview`
- `GET /api/organizer/dashboard`
- `GET /api/organizer/analytics`
- `POST /api/organizer/events/:eventId/voters/invite`
- `POST /api/organizer/events/:eventId/voters/:voterId/resend-invitation`
- `POST /api/organizer/events/:eventId/notify`

**Dependencies:** `resend`

---

## 4. Election Module

**Purpose:** Organizers create elections with positions and candidates; voters cast ballots; analytics show turnout and vote distribution.

**Status:** Complete

**Files Involved:**
- `backend/src/controllers/election-organizer.controller.js`, `election-voter.controller.js`
- `backend/src/routes/election-organizer.routes.js`, `election-voter.routes.js`
- `backend/src/services/election.service.js`, `csv-import.service.js`
- `backend/src/validators/election.validator.js`
- `frontend/src/pages/organizer/election/` (multiple pages)
- `frontend/src/pages/voter/VoterEventPage.jsx`
- `frontend/src/services/election.service.js`
- `frontend/src/components/voter/election/`

**Database Tables:** `events` (type=election), `positions`, `candidates`, `election_votes`, `event_voters`, `invitations`

**API Endpoints (Organizer):**
- `GET /api/organizer/election/dashboard`
- `POST /api/organizer/election/organization/logo`
- `GET/POST /api/organizer/election/events`
- `GET/PATCH /api/organizer/election/events/:eventId`
- `PATCH /api/organizer/election/events/:eventId/voting` — enable/disable voting
- `POST /api/organizer/election/events/:eventId/banner`
- `GET/POST /api/organizer/election/events/:eventId/positions`
- `PATCH/DELETE /api/organizer/election/events/:eventId/positions/:positionId`
- `GET/POST /api/organizer/election/events/:eventId/candidates`
- `PATCH/DELETE /api/organizer/election/events/:eventId/candidates/:candidateId`
- `POST /api/organizer/election/events/:eventId/candidates/:candidateId/photo`
- `GET /api/organizer/election/events/:eventId/voters`
- `POST /api/organizer/election/events/:eventId/voters/invite`
- `POST /api/organizer/election/events/:eventId/voters/invite-existing`
- `POST /api/organizer/election/events/:eventId/voters/import`
- `GET /api/organizer/election/events/:eventId/analytics`

**API Endpoints (Voter):**
- `GET /api/voter/election/events`
- `GET /api/voter/election/events/:eventId/ballot`
- `GET /api/voter/election/events/:eventId/results`
- `POST /api/voter/election/events/:eventId/vote`

**Business Rules:** See `docs/ai/BUSINESS_RULES.md` — Election Rules section

**Future Improvements:**
- Real-time ballot results with WebSocket
- Multi-language ballot support
- Ranked-choice voting

---

## 5. Competition Scoring Module (Pageant)

**Purpose:** Organizers manage contestants, criteria, categories, and rounds; judges score contestants; rankings are computed with weighted averages.

**Status:** Complete (includes advanced Phase 4–6 features: categories, rounds, first-class judges, judge assignments)

**Files Involved:**
- `backend/src/controllers/pageant-organizer.controller.js`, `pageant-judge.controller.js`, `competition.controller.js`
- `backend/src/routes/pageant-organizer.routes.js`, `pageant-judge.routes.js`, `competition-organizer.routes.js`
- `backend/src/services/pageant.service.js`, `competition.service.js`, `pageant-csv.service.js`
- `backend/src/modules/scoring-engine.js`
- `backend/src/validators/competition.validator.js`, `pageant.validator.js`
- `frontend/src/pages/organizer/pageant/`
- `frontend/src/pages/voter/JudgeScoringPage.jsx`
- `frontend/src/modules/competition/`

**Database Tables:** `events` (type=pageant), `contestants`, `criteria`, `judge_scores`, `competition_categories`, `competition_rounds`, `competition_judges`, `competition_judge_assignments`, `competition_round_contestants`, `competition_round_criteria`, `competition_scores`, `event_voters` (is_judge flag for legacy)

**API Endpoints (Organizer):**
- `GET /api/organizer/pageant/dashboard`
- `GET/POST /api/organizer/pageant/events`
- `GET/PATCH /api/organizer/pageant/events/:eventId`
- `PATCH /api/organizer/pageant/events/:eventId/scoring`
- `POST /api/organizer/pageant/events/:eventId/banner`
- `GET/POST/PATCH/DELETE /api/organizer/pageant/events/:eventId/contestants`
- `POST /api/organizer/pageant/events/:eventId/contestants/:contestantId/photo`
- `GET/POST/PATCH/DELETE /api/organizer/pageant/events/:eventId/criteria`
- `GET /api/organizer/pageant/events/:eventId/judges`
- `POST /api/organizer/pageant/events/:eventId/judges/invite`
- `POST /api/organizer/pageant/events/:eventId/judges/import`
- `GET /api/organizer/pageant/events/:eventId/rankings`
- `GET /api/organizer/pageant/events/:eventId/analytics`
- Competition sub-routes under `/events/:eventId/categories`, `/rounds`, `/scoring-config`, `/foundation`, `/judges-v2`, `/judges-v2/:judgeId/assignments`

**API Endpoints (Judge/Voter):**
- `GET /api/voter/pageant/events`
- `GET /api/voter/pageant/events/:eventId/score`
- `POST /api/voter/pageant/events/:eventId/score`

**Business Rules:** See `docs/ai/BUSINESS_RULES.md` — Competition Rules section

**Future Improvements:**
- Live ranking broadcast via WebSocket
- Judge assignment conflict detection

---

## 6. Polling Module

**Purpose:** Organizers create dynamic surveys with registry-driven question types; respondents submit answers; analytics display charts and percentages.

**Status:** Complete (includes Phase 7 question type registry)

**Files Involved:**
- `backend/src/controllers/polling-organizer.controller.js`, `polling-voter.controller.js`
- `backend/src/routes/polling-organizer.routes.js`, `polling-voter.routes.js`
- `backend/src/services/polling.service.js`, `polling-registry.service.js`
- `backend/src/modules/poll-question-types.js`
- `backend/src/validators/polling.validator.js`
- `frontend/src/pages/organizer/polling/`
- `frontend/src/pages/voter/VoterPollPage.jsx`
- `frontend/src/services/polling.service.js`
- `frontend/src/components/voter/polling/`
- `frontend/src/utils/pollValidation.js`

**Database Tables:** `events` (type=polling), `poll_questions`, `poll_options`, `poll_answers`, `poll_submissions`, `system_poll_question_types`, `poll_question_types`

**Question Types (built-in):** `single_choice`, `multiple_choice`, `checkbox`, `yes_no`, `rating`, `likert_scale`, `open_text`, `ranking`

**API Endpoints (Organizer):**
- `GET /api/organizer/polling/dashboard`
- `GET/POST /api/organizer/polling/events`
- `PATCH /api/organizer/polling/events/:eventId`
- `GET /api/organizer/polling/events/:eventId/settings`
- `PATCH /api/organizer/polling/events/:eventId/open`
- `POST /api/organizer/polling/events/:eventId/banner`
- `GET/POST/PATCH/DELETE /api/organizer/polling/events/:eventId/questions`
- `GET /api/organizer/polling/events/:eventId/analytics`
- `GET /api/organizer/polling/question-types`
- `GET/POST /api/organizer/polling/question-types/custom`
- `PATCH/DELETE /api/organizer/polling/question-types/custom/:typeId`
- `POST /api/organizer/polling/events/:eventId/respondents/invite`
- `POST /api/organizer/polling/events/:eventId/respondents/invite-existing`
- `POST /api/organizer/polling/events/:eventId/respondents/import`

**API Endpoints (Voter/Respondent):**
- `GET /api/voter/polling/events`
- `GET /api/voter/polling/events/:eventId`
- `POST /api/voter/polling/events/:eventId/submit`

**Business Rules:** See `docs/ai/BUSINESS_RULES.md` — Polling Rules section

**Future Improvements:**
- Real-time poll results
- Branching/conditional questions
- Export to CSV/PDF

---

## 7. Voter Dashboard

**Purpose:** Unified voter view showing assigned, active, and completed events across all modules.

**Status:** Complete

**Files Involved:**
- `backend/src/controllers/voter.controller.js`
- `backend/src/routes/voter.routes.js`
- `backend/src/services/voter.service.js`
- `frontend/src/pages/voter/VoterDashboardPage.jsx`
- `frontend/src/services/voter.service.js`
- `frontend/src/components/voter/VoterEventCard.jsx`, `VoterStatusBadge.jsx`

**Database Tables:** `event_voters`, `events`, `organizations`

**API Endpoints:**
- `GET /api/voter/overview`
- `GET /api/voter/login-redirect`

---

## 8. File Uploads (Cloudinary)

**Purpose:** Upload organization logos, event banners, candidate/contestant photos via multipart form.

**Status:** Complete

**Files Involved:**
- `backend/src/middleware/upload.js`
- `backend/src/services/upload.service.js`
- `backend/src/config/cloudinary.js`
- `frontend/src/components/upload/ImageUploadField.jsx`, `OrganizationLogoUpload.jsx`
- `frontend/src/services/` (upload calls embedded in each module service)

**Database Tables:** `organizations.logo_url`, `events.banner`, `candidates.photo`, `contestants.photo`

**Business Rules:**
- Images uploaded to Cloudinary; URL stored in DB
- `multer` handles multipart parsing with in-memory storage before Cloudinary upload
- Upload rate-limited (`uploadLimiter`)

**Dependencies:** `cloudinary`, `multer`

---

## 9. Email Notifications

**Purpose:** Transactional emails for organizer invitations, voter invitations, password resets, and event notifications.

**Status:** Complete

**Files Involved:**
- `backend/src/services/email.service.js`, `mailer.service.js`, `invitation.service.js`, `password-reset.service.js`
- `backend/src/config/resend.js`
- `backend/src/templates/email/`

**Business Rules:**
- Emails sent via Resend API
- Invitation emails include temporary passwords for new voter/organizer accounts
- Password reset links expire (token stored in `password_reset_tokens`)
- Email rate-limited (`emailLimiter`)

**Dependencies:** `resend`

---

## 10. Notifications (In-App)

**Purpose:** In-app notification center for all roles; unread count badge; mark read/all-read.

**Status:** Complete

**Files Involved:**
- `backend/src/controllers/notifications.controller.js`
- `backend/src/routes/notifications.routes.js`
- `backend/src/services/notification.service.js`
- `frontend/src/components/ui/NotificationsModal.jsx`
- `frontend/src/services/notifications.service.js`

**Database Tables:** `notifications`

**API Endpoints:**
- `GET /api/notifications/`
- `GET /api/notifications/unread-count`
- `PATCH /api/notifications/:notificationId/read`
- `PATCH /api/notifications/read-all`

---

## 11. Analytics & Reports

**Purpose:** Organizer reporting hub — election turnout, vote summaries, competition rankings, polling charts.

**Status:** Complete

**Files Involved:**
- `backend/src/controllers/reports-organizer.controller.js`
- `backend/src/routes/reports-organizer.routes.js`
- `backend/src/services/reports.service.js`
- `frontend/src/pages/organizer/reports/`
- `frontend/src/components/analytics/`, `frontend/src/components/reports/`
- `frontend/src/services/reports.service.js`
- `frontend/src/utils/exportReport.js`

**API Endpoints:**
- `GET /api/organizer/reports/` (and sub-routes per module)

---

## 12. Security Hardening

**Purpose:** Platform-wide security — CSRF, rate limiting, input sanitization, atomic vote prevention.

**Status:** Complete

**Files Involved:**
- `backend/src/middleware/csrf.js`, `rateLimiter.js`
- `backend/src/utils/sanitize.js`, `crypto.js`
- `backend/src/config/security.js`

**Business Rules:** See `docs/ai/BUSINESS_RULES.md` — Security Rules section

---

## 13. WebSocket Realtime

**Purpose:** Live event updates pushed to browsers without polling.

**Status:** Complete

**Files Involved:**
- `backend/src/websocket/ws-server.js`, `ws-rooms.js`, `ws-emitter.js`
- `backend/src/server.js`
- `frontend/src/services/socket.service.js`
- `frontend/src/hooks/useSocketEvent.js`

See `docs/ai/REALTIME.md` for full details.

---

## 14. Invite Registered Voter

**Purpose:** Organizers can invite already-registered voters to a new event without re-creating their account or resending a new temporary password.

**Status:** Complete

**Files Involved:**
- `backend/src/routes/election-organizer.routes.js` — `POST /events/:eventId/voters/invite-existing`
- `backend/src/routes/polling-organizer.routes.js` — `POST /events/:eventId/respondents/invite-existing`
- `backend/src/controllers/election-organizer.controller.js` — `inviteExistingVoter`
- `backend/src/controllers/polling-organizer.controller.js` — `inviteExistingRespondent`
- `docs/invite-registered-voter-feature.md` — feature specification

**Database Tables:** `event_voters`, `invitations`, `users`

**Business Rules:**
- Voter must already exist in the system
- No new account created, no temporary password issued
- Voter receives event invitation email only
- Duplicate assignments are prevented

---

**Last Updated:** 2026-07-04
**Documentation Version:** 1.0.0
**Related Files:** All controller and route files
**Related Documentation:** `docs/ai/API.md`, `docs/ai/BUSINESS_RULES.md`, `docs/ai/DATABASE.md`
