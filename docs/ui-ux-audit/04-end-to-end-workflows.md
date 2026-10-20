# VOTRIX — End-to-End Workflow Documentation

## 1. Sign in and role landing

1. Guest opens `/` or `/login`.
2. Enters email, password, optionally Remember me; frontend validates email and non-empty password.
3. Sign-in calls auth service; shared API uses cookie credentials and bootstraps CSRF for mutations.
4. On success, guest routes redirect by role: admin, organizer, or participant dashboard. A forced password-change flag sends the user to `/change-password`.
5. Protected routes show a loading spinner during auth bootstrap, return guests to login with the requested location, and redirect a role mismatch to its own home.
6. Backend route middleware remains authoritative. Admin routes require admin; organizer router requires organizer and active account; participant router requires participant, active account, changed password, and module event participation where applicable.
7. Logout calls API, clears local session even if API logout fails, and returns to `/`.

## 2. Password recovery and first-login change

### Recovery

1. Login user chooses **Forgot password?**.
2. Enters email on `/forgot-password`; submit calls recovery endpoint.
3. UI displays backend message or request error; copy intentionally says reset link is sent if an account exists.
4. User follows link containing token to `/reset-password?token=…`.
5. Sets new password and confirmation (minimum eight characters, matching); missing token disables form.
6. Success routes to login with “Password reset” message.

### Forced password update

1. Authenticated user with `mustChangePassword` is redirected to `/change-password`.
2. Enter current password, new password, confirmation; admin must change password.
3. Organizer and participant roles can alternatively continue with temporary password.
4. On success, session is refreshed. Organizer/admin route to role home; participant honors a safe intended destination or asks the participant redirect API.

## 3. Admin manages organizers and participant accounts

1. Admin opens dashboard or **User Management**.
2. Chooses Organizer or Participant; participant tab has Election Voter, Competition Judge, Polling Respondent subtype.
3. Manual create opens a typed form. Organizer profile includes email, organizer/organization name, position, organization type and scope; scoped organizers select programs/sections. Participant forms include email, school ID, first/last name, program and year/section. Judge forms include identity, optional expertise/title/affiliation and optional organizer assignment.
4. Required identity/taxonomy fields are validated in browser and backend; taxonomy must be defined in system settings for participant entries.
5. Admin may instead download CSV template, preview a CSV/XLSX import, inspect valid/error rows, then confirm registration. Results show success/failure summary; export downloads CSV.
6. Success toasts and lists refresh. Account status can be suspended/reinstated/restored through a confirmation surface. Pool membership can be removed separately from the shared participant user account.
7. Organizer row opens `/admin/organizers/:id` for activity detail; event row’s activity action opens audit log pre-filtered by entity ID.

## 4. Organizer updates profile and brand

1. Organizer opens account chip → Organizer Profile.
2. Profile view loads organization name/type, organizer name and position; Edit opens fields validated through profile schema.
3. Save calls organizer-profile update, refreshes the user/profile, and displays toast; cancel returns to read view.
4. Organization logo upload is separately available from organizer dashboard.
5. Profile overlay and logo upload do not create new routes.

## 5. Create and publish an election or poll

1. Organizer starts from module dashboard/list and selects **Create event/poll**.
2. Details step collects title, optional description, required start/end date-time. Election also selects results visibility (real-time, hidden, public). Poll also offers optional banner and settings for anonymous responses and multiple submissions.
3. Date validation requires parseable start/end and end on/after start. All three forms use `CalendarCard` with start/end date bounds; exact time ordering is enforced by schema validation.
4. Organizer uploads optional banner in Branding. Forms use draft/autosave and unsaved-change protection. Leave dialog offers save & leave, leave without saving, or cancel.
5. Election organizer configures ballot sections/groups, positions and candidates. Position details include vote maximum/winner count/program eligibility; candidate profile includes name and optional biography/platform/party/photo.
6. Poll organizer adds questions using registry-driven types, required flag, options/config/images, and reorder controls.
7. Review shows setup summary and readiness. Election requires at least one position and candidate; voters need not be invited before publishing. Poll requires at least one question; respondents need not be invited before publishing.
8. **Publish** changes draft to scheduled and hands event to its schedule. It does not open voting immediately. Setup becomes locked. While scheduled, organizer may unpublish to return to draft; active/terminal states do not offer this.
9. Organizer enrolls voters/respondents using cohort invitations, before active status. Select Program or Year & Section, optionally request email, invite and inspect enrollment/email counts. Existing cohort members are skipped; removing roster members is separate.
10. At active state participant roster is locked under the default participant-lock feature setting; setup is locked after publication. Backend enforces event lifecycle rules.

## 6. Election participation

1. Admin has created a participant account and organizer enrolled the user by cohort. Participant sees the assigned event card in `/participant`.
2. Participant opens the election event. If not open, not eligible, archived, or already voted, the route displays the corresponding state.
3. For an open election, participant selects candidate(s) by position; selection count cannot exceed max. Required positions must have selection unless skip is allowed; ballot must have at least one selection.
4. Partial selection is saved locally by event and ballot section. A progress bar reports section and position completion.
5. Participant selects review, verifies the ballot and submits. Backend receives selected candidates, ballot-section ID, and voting nonce.
6. For multi-section elections the next ballot section loads after submit; a conflict/already-submitted response reconciles by fetching ballot state. Final submission clears that section draft and shows confirmation/eligible results.

## 7. Poll participation

1. Admin creates participant account; organizer enrolls respondent via cohort; active/open poll appears in Active events.
2. Respondent opens poll. Closed/expired and already-responded states block entry unless multiple submissions are enabled.
3. Participant fills dynamic question controls. Answers are locally saved and progress counts answered questions.
4. Client validates required/format constraints via poll validation and submits answers with start time.
5. Success removes local draft and shows confirmation. If multiple submissions remain allowed and poll is open, participant may start another response; otherwise return to dashboard.

## 8. Competition setup, judging, and official results

1. Organizer creates a competition event and configures event details/banner/type.
2. Select competition/category/divisions; if type is changed after child setup exists, a confirmation warns about removed draft configuration and assignments.
3. Configure rounds, contestants/entries, divisions, round participation, criteria/minor criteria, scoring scale/method/rules, deductions, and reviewer requirements. Configure judge account pool from admin if needed.
4. Organizer picks available judges, optionally requests invitation email, then assigns judges to relevant competition/round scope. Notification delivery is reported separately from enrollment.
5. Review requires contestants, judges, criteria, criteria completeness, scoring rules readiness, and acknowledgement/confirmation. Publish hands event to schedule and freezes official setup/rules.
6. When ready to score, organizer opens Live Control and starts session. Sessions can be active, paused, resumed and completed. Organizer can set round/division/contestant/stage arrangement, control contestant access, review judge progress, preview round advancement/finalization and confirm the resulting action.
7. Judges open assigned event/context from participant dashboard, score using configured criteria, save drafts and submit. Offline/retry queue and live sync are implemented.
8. Organizer reviews tabulation (submissions, matrix, deductions, results, audit trail), verifies/republishes official calculations where available, and exports report/workbook.
9. Public results are shown at the standalone public result route only when published. Page polls for publication updates and reports withdrawn/unavailable snapshots.

## 9. Search, filtering, notifications, reporting

- Global search opens via header control or Ctrl/Cmd+K. Role-scoped static routes are searched locally; admin also gets delayed server search for organizers/events once query is at least two characters. Selecting a scoped route uses current event ID if present or falls back to module list.
- Admin global events filters locally by title/organization, type and status; admin audit/email logs query backend with filters and pagination. Organizer event pages and participant tables include module-specific search/facets where implemented.
- Notification bell shows unread count; modal lists at most 50 fetched notifications, supports text search/all/unread/read, opens action URL, mark one/all read and updates the count.
- Reports hub lists reportable events. Module reports have refresh and CSV/Excel/PDF/JSON exports; global events and account management have CSV export. Some report values are live preview until official tabulation is published.

## 10. Status and locking reference

Event status values in frontend constants: `draft`, `scheduled`, `active`, `completed`, `cancelled`, `archived`. Setup is editable only in draft. Participants are editable through scheduled and, by default, locked at active; a frontend feature flag may disable that lock in test builds. Unpublish is available only in scheduled status. Completed, cancelled, and archived events are read-only in organizer UI. Competition scoring session has separate `idle`, `active`, `paused`, `completed` states.

## 11. Unverified behaviors

No live data/browser session was available, so exact result ordering, generated reports for real data, emails actually delivered, device-specific native date-picker behavior, deployment feature-flag values, and backend error copy were not observed. These should be validated in a staging environment before finalizing Figma prototypes.
