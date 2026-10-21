# VOTRIX User Manual Specification

**Document purpose:** Implementation-grounded specification for a separate documentation workflow to produce the official VOTRIX user manual for Admin, Organizer, and Participant users.

**Evidence policy:** Descriptions below are limited to behavior found in the current frontend, backend, shared calculation code, and database migrations. Deployment-dependent competition paths and unresolved behavior are marked explicitly.

## 1. Document Title and Purpose

This specification describes how to access and use the current VOTRIX web application. It is not a substitute for administrator deployment documentation. The final DOCX manual should retain the role restrictions, status conditions, and unresolved items in this file until those items are confirmed.

## 2. System Overview

VOTRIX provides three organizer-managed event modules:

- **Election:** ballot groups, positions, candidates, voter enrollment, ballots, turnout, and election results.
- **Competition Scoring:** contestants or entries, rounds, criteria, judges, live scoring, tabulation, rankings, and reports. The deployed competition interface can use legacy or native paths depending on feature flags.
- **Polling:** poll settings, registry-driven questions, respondent enrollment, submissions, analytics, and reports.

The current global account roles are **Admin**, **Organizer**, and **Participant**. Participant types are event- or account-level classifications, not separate global login roles: Election Voter, Competition Judge, and Polling Respondent. One Participant account may have more than one participant type.

The backend stores account records separately from event enrollments. Event access is checked against `event_participants` and the required participant type. Admin-managed participant pools are represented by participant-type memberships. An organizer can invite/enroll eligible pool accounts into an event; pool membership alone does not enroll a person in a specific event.

## 3. Scope and Intended Audience

This document is for:

- **Admins** who provision organizer and participant accounts and manage platform-wide settings and monitoring.
- **Organizers** who create, configure, schedule, publish, and review events they own.
- **Participants** who are enrolled as election voters, competition judges, or polling respondents.

Technical material appears in the Evidence Appendix. The main procedures use current interface labels where verified.

## 4. System Requirements and Supported Access Methods

- VOTRIX is a browser-based web application. A browser with JavaScript enabled and network access to the deployed frontend and API is required.
- The frontend and API URLs are deployment-specific. The repository provides environment examples but does not define one universal production URL.
- The app shell adapts to desktop and smaller screens. The minimum supported browser versions are not declared in the inspected source.
- Competition scoring/setup/results can be controlled by deployment feature flags. The visible workflow may differ between deployments.
- A live database, email provider, and image provider are required for the corresponding account, notification, upload, and data workflows. Availability is deployment-specific.

No minimum device, browser version, or network speed is specified by the application source.

## 5. Getting Started

1. Open the organization-provided VOTRIX URL.
2. Sign in using the email address and password issued for the account.
3. If the account requires a password change, complete that step or, for eligible account roles, choose **Continue with temporary password**.
4. Use the role-specific dashboard and navigation described below.
5. Use **Sign out** from the account menu when finished, especially on shared devices.

There is no public account-registration route in the current frontend. Account creation is performed by an Admin or by an external provisioning process.

## 6. Account Access and Authentication

### Sign In

**Who:** Admin, Organizer, Participant.

1. Open `/` or `/login`.
2. Enter **Email** and **Password**.
3. Optionally select **Remember me**.
4. Select **Sign in**.
5. If sign-in succeeds, the app routes to the role dashboard. A Participant may be redirected directly to the first active assigned event; otherwise the Participant dashboard opens.

The current login schema and backend validator require an email address and password for all roles. The README still says that Admin uses a username; that statement conflicts with the current login form and controller and needs confirmation before publication.

Suspended, archived, or otherwise non-active accounts cannot sign in. The backend returns a role/account error rather than treating account status as a dashboard filter.

### First Sign In and Password Change

1. Enter the temporary password sent when the account was created.
2. The app may route to **Change your password** before allowing access to protected pages.
3. Enter **Current password**, **New password**, and **Confirm new password**. The new password must contain at least eight characters and match the confirmation.
4. Select **Set new password**.

Organizers and Participants may be offered **Continue with temporary password** when a password change is required. Admins may not skip. Skipping clears the forced-change requirement without changing the temporary password.

### Forgot and Reset Password

1. From Sign In, select **Forgot password?**.
2. Enter the account email and select **Send reset link**.
3. If an eligible account exists and email delivery succeeds, follow the emailed link.
4. Enter **New password** and **Confirm new password**, then select **Reset password**.
5. Return to Sign In.

The page deliberately responds with a generic message: “If an account exists for this email, a reset link has been sent.” Reset tokens expire after the configured `PASSWORD_RESET_EXPIRY_MINUTES` value, which defaults to 60 minutes. The reset service excludes Admin accounts. The application has no Admin reset flow visible here; see Unresolved Questions.

### Account Menu, Profile, and Sign Out

- The shared header provides notifications and an account menu.
- Admin and Participant account menus display available identity/profile fields and **Sign out**; no participant profile-edit form is exposed in the inspected routes.
- Organizers open **Organizer Profile** from the account chip. They can edit organization name, organization type, organizer name, and position. The profile card also provides **Sign out**.
- The Organizer Dashboard has an organization logo upload control. Event creation pages provide event banners; candidate/contestant and poll question forms may provide image uploads.
- A normal password-change link is not exposed after the forced-change screen. The forced-change page's text says a password can be changed anytime from account settings, but the inspected account menus do not contain such a control.

## 7. General Interface and Navigation

- Role-specific navigation appears in the left sidebar for Admin and Organizer. The Participant shell has no sidebar.
- On narrower screens, the sidebar opens from the header's menu button. At smaller widths it may collapse automatically.
- The header's **Notifications** control opens a panel with search, All/Unread/Read filters, **Mark read**, and **Mark all read**.
- Selecting **Open** on a notification follows its action link when one exists.
- Admin and Organizer layouts have global search; it is not shown in the Participant shell.
- Event pages use setup stepper/footer navigation. Active or focus-heavy screens may auto-collapse the sidebar.

### Main Routes

| Role                | Route                                                              | Purpose                                      |
| ------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| All                 | `/` or `/login`                                                    | Sign in                                      |
| All                 | `/forgot-password`, `/reset-password`                              | Password recovery                            |
| All                 | `/change-password`                                                 | Required password-change flow                |
| Admin               | `/admin`                                                           | Admin dashboard                              |
| Admin               | `/admin/users`                                                     | Organizer and participant account management |
| Admin               | `/admin/events`                                                    | Global event monitoring                      |
| Organizer           | `/organizer`                                                       | Organizer overview                           |
| Organizer           | `/organizer/election`                                              | Election dashboard                           |
| Organizer           | `/organizer/competition`                                           | Competition Scoring dashboard                |
| Organizer           | `/organizer/polling`                                               | Polling dashboard                            |
| Organizer           | `/organizer/reports`                                               | Reports overview                             |
| Participant         | `/participant`                                                     | Participant event dashboard                  |
| Participant         | `/participant/events/:eventId`                                     | Election ballot                              |
| Participant         | `/participant/polling/events/:eventId`                             | Poll response form                           |
| Participant         | `/participant/competition/events/:eventId/score`                   | Judge scoring entry point                    |
| Public, conditional | `/competition/events/:eventId/competitions/:competitionId/results` | Published native competition snapshot        |

The current frontend redirects legacy `/voter/*` routes to `/participant/*`. Backend `/voter` route mounts remain for compatibility.

## 8. Admin User Manual

### Admin Dashboard

**Access:** **Admin dashboard** in the sidebar or `/admin`.

The dashboard shows platform counts, module event counts, recent activity, analytics, and an operational health summary. The dashboard offers **Add participant**, **Add organizer**, links to Global Events and Audit Logs, and a link to System Health when health information is unavailable. Health is loaded separately from the main dashboard request.

### User Management

**Access:** **User Management** in the sidebar or `/admin/users`.

The page has **Organizers** and **Participants** tabs. The Participants tab has participant-type choices: **Election Voters**, **Competition Judges**, and **Polling Respondents**. These are participant types within the Participant global role.

#### Add or Edit an Organizer

1. In the Organizers tab, select **Add organizer**. To edit, select **Edit** in that organizer's row.
2. Complete the required email, organizer name, position, organization name, and organization type fields.
3. Choose **All programs and sections** or **Selected programs** for **Voter access**.
4. For a scoped organizer, select at least one Program. Year & Sections are optional; an empty section selection means all sections for the selected programs.
5. Select **Create account** or **Save changes**.

A new organizer account is active immediately; the server generates a temporary password and attempts to email it. The Admin does not choose or see that password. The edit screen does not allow changing email.

The table supports search, status filters, **Template**, **Export CSV**, **Review CSV import**, and **Add organizer**. CSV import has a review/preview step before registration; invalid rows are listed and skipped. The table also supports **Edit**, **Suspend**, **Reinstate**, and **Archive** with confirmation.

Selecting a row opens Organizer Activity. That page filters audit records by action/entity, paginates, and opens record details.

#### Add or Edit an Election Voter or Polling Respondent

1. In the Participants tab, choose **Election Voters** or **Polling Respondents**.
2. Use **Template** to obtain the CSV template or **Import CSV** to choose a `.csv`, `.xlsx`, or `.xls` file. Select **Review & Register** after previewing the valid rows.
3. For one account, select **Add participant**. Enter Email, School ID, First name, Last name, Program, and Year & Section. These fields are required.
4. Select **Add Election Voter** or the corresponding participant-type button. To edit, select **Edit** and **Save changes**.

Programs and Year & Sections come from **System Settings > Participant taxonomy**. If the lists are empty, define them before adding participants. Email cannot be changed in the edit modal. An existing compatible account may be added to another participant type; conflicting shared identity/profile fields or school IDs are rejected.

Tables support search, Program, Year & Section, and account-status filters. Actions include **Edit**, **Suspend**, **Reinstate**, **Archive**, and **Remove from pool**. Removing a membership does not delete the shared account, its other participant types, or historical event enrollment. It does not remove existing event enrollment.

#### Add or Edit a Competition Judge

1. In Participants, choose **Competition Judges**.
2. Select **Add participant** or **Import CSV**. The CSV workflow provides a template and a preview before registration.
3. Enter Email, First name, and Last name. Expertise is optional; **Additional details** expands optional Title and Affiliation fields.
4. Optionally assign the judge to selected organizers. If no organizers are selected, the account is available to all organizers.
5. Select **Add Competition Judge**. Edit uses **Save changes**.

The table supports search, status filters, export, suspension/reinstatement/archive, and **Remove from pool**. Removing a judge membership does not delete the account or its other participant types.

#### Account Status and Shared-Account Effects

Account status values include `active`, `suspended`, and `archived` (plus `pending` in the account model). Suspending or archiving a shared Participant account blocks sign-in across its participant types. Removing a type from its pool is different from changing account status.

### Global Events

**Access:** **Global Events** or `/admin/events`.

1. Search by title or organization.
2. Filter by type (**All types**, **Election**, **Competition**, **Polling**) and status (**All statuses**, **Draft**, **Scheduled**, **Active**, **Completed**, **Cancelled**, **Archived**).
3. Review the event type, organization, status, and date range.
4. Use **Activity** to open event-related Audit Logs, **Export** to export that event's report, or **Organizer** to open the related organizer where available.
5. For an archived event, **Restore** prompts for confirmation and restores it as a completed, read-only event.
6. Use **Export CSV** to export the filtered global event list.

Admin Global Events does not expose event setup editing or publishing controls.

### System Settings and Participant Taxonomy

**Access:** **System Settings** or `/admin/settings`.

The generic settings editor displays the Platform name, Maintenance mode, Maximum organizers allowed, and additional stored settings with their detected types. Supported editor types are text, number, checkbox, and JSON textarea. Select **Save settings** after edits. Number and JSON values are validated before saving.

The adjacent **Participant taxonomy** panel manages the Programs and Year & Sections lists used by participant forms/imports and organizer cohort pickers. Add a value and select **Add** (or press Enter), remove a value using its remove control, then select **Save taxonomy**. Duplicate checks are case-insensitive.

The Admin UI describes `max_organizers` as a soft limit and maintenance mode as an admin-only sign-in mode. The inspected backend contains no references enforcing either setting; do not promise that they block account creation or sign-in until confirmed.

### Archival Policy

**Access:** **Archival Policy** or `/admin/archival`.

1. Set **Enable automatic archival**.
2. Set **Days after completion** from 1 to 3650 while enabled.
3. Select **Save policy**.
4. When enabled, **Run now** performs an immediate check. The application says automatic checks run once a day.

The policy only archives completed events whose end date is older than the configured threshold. Active, scheduled, draft, and cancelled events are excluded. Restored archived events are marked completed and remain read-only.

### Alerts

**Access:** **Alerts** or `/admin/alerts`.

The page configures **Failed email delivery**, **Event completion**, and **Suspicious activity (failed logins)**. Each can be enabled/disabled. Failed email and suspicious activity settings expose thresholds when enabled. Select **Save alerts**. The exact delivery destinations and provider behavior depend on server configuration.

### System Health, Audit Logs, and Email Delivery

- **System Health** (`/admin/health`) displays overall status and status for database, Cloudinary, and Resend. It shows database schema readiness when reported and has **Refresh**.
- **Audit Logs** (`/admin/audit-logs`) supports search, date range, action/entity filters, sorting, pagination, detail views, and exports. Event/organizer links can open filtered audit history.
- **Email Delivery** (`/admin/email-delivery`) filters by recipient email, workflow, delivery status, and dates; it supports **Refresh** and pagination. Provider credentials and raw payloads are not shown.

### Admin Features Not Exposed as Screens

Backend routes exist for session listing/revocation, platform search, and several exports. No dedicated session-management screen is present in the inspected frontend route map. Do not present API-only routes as ordinary Admin UI features in the final manual.

## 9. Organizer User Manual

### Organizer Overview and Profile

**Access:** `/organizer` or **Overview**.

The dashboard summarizes the organizer's owned events. Module dashboards are available for Election, Competition Scoring, and Polling. **Reports** opens the reports overview. The account chip opens **Organizer Profile**; **Edit profile** can update organization name/type, organizer name, and position. The Organizer Dashboard exposes organization-logo upload.

An organizer must have a complete profile (organization name/type, organizer name, and position) before using module/dashboard APIs. Admin-created accounts are provisioned with this information; an Organizer may edit it from the profile card.

### Shared Event Lifecycle

| State       | Verified meaning and effect                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft`     | Setup fields are editable. Review & Publish can publish only when that module's readiness checks pass.                                              |
| `scheduled` | UI describes the event as published and waiting for its schedule. Setup is locked; organizers may unpublish to draft while still scheduled.         |
| `active`    | Voting, polling, or scoring is operational according to schedule/module controls. Setup is locked. Participant rosters lock by default once active. |
| `completed` | Terminal/read-only event state.                                                                                                                     |
| `cancelled` | Terminal/read-only event state.                                                                                                                     |
| `archived`  | Read-only and no longer accepts operational activity. Admin may restore it as completed.                                                            |

Setup is editable only in draft. Scheduled events can be unpublished back to draft; active and terminal events cannot be unpublished using the current shared helper. Participant rosters are editable through scheduled and lock at active by default; backend environment configuration can disable that lock for testing. Event end dates and module enabled flags control actual opening; publishing alone does not mean immediate open.

#### Task: Create and publish an election

**Who:** Organizer who owns the event.

**Prerequisites:** Active Organizer account, completed Organizer profile, and configured Program/Year & Section taxonomy for cohort operations.

1. Open the Election dashboard, choose Events, then create an election.
2. In Event Details, enter the required title, start date/time, and end date/time. The end cannot precede the start. Description is optional. Choose results visibility: **Real-time results**, **Hidden results**, or **Public results**.
3. Choose **Next: Branding**. Optionally upload an event banner.
4. Choose **Create & continue**. The system creates the event in draft and opens Positions.
5. In Positions, create at least one election group and add its positions. Group names are organizer-defined; SSG/FSTLP are examples, not required values. Position configuration includes name, description, number of winners, maximum selections, display order, and optional program eligibility.
6. The group progress control shows the current group. The current group needs at least one position before **Next: [group name]** becomes available. The final group advances to Candidates. Previously completed groups can be revisited; future groups are locked.
7. In Candidates, add at least one candidate to every position in each group. Candidate fields include position, name, party, biography, platform, and optional photo.
8. Choose **Next: [group name]** to advance through configured groups. The final group advances to Voters.
9. In Voters, invite existing Election Voter accounts by **Program** or **Year & Section**. Select the cohort values, optionally choose **Email an invitation to newly enrolled voters**, then select **Invite**. Already enrolled participants are skipped. Group-level and position-level eligibility can further restrict who receives each ballot section.
10. Review the event. Every group must have at least one position and every position must have at least one candidate. Voter enrollment is not required before publication.
11. Select **Finish & Publish**. The event is scheduled according to its start/end dates; this does not immediately open voting.

**Restrictions:** Setup changes require draft status. Voter enrollment can be managed while roster edits are allowed, normally through scheduled; active events lock the roster by default. Eligible participants can submit only groups/positions for which they qualify.

#### Task: Configure election groups and ballot positions

1. Open the event's **Positions** stage.
2. Use **Manage election groups** to create a group, rename, reorder, or delete one. Group names must be non-empty and unique within the event. Creating more than one group is optional.
3. Select the current group in the group-progress control.
4. Add a position. Set its name, winners count, maximum selections, and optional description/display order. If offered, choose whether all programs eligible for the group can vote or only selected Programs.
5. Add at least one position before moving to the next group.
6. In **Candidates**, select a position and register its candidate information. Continue until each position has a candidate.
7. Review & Publish repeats readiness by group so a direct sidebar jump cannot bypass publication checks.

Deleting an election group can delete its positions; read the confirmation before proceeding. Position delete confirmation states that candidates for that position are also deleted. The source does not expose a vote-change or ballot-withdrawal workflow after submission.

#### Task: Invite election voters

1. Open the event's **Voters** stage.
2. Select **By Program** or **By Year & Section**.
3. Select one or more cohorts. The page displays new/enrolled counts.
4. Optionally select **Email an invitation to newly enrolled voters**.
5. Select **Invite** and review the enrollment/email summary.
6. Remove an enrolled voter only when roster changes are permitted. Removing event enrollment is separate from removing an account's global pool membership.

A shared Organizer scope may limit which voters/cohorts the Organizer can manage. A group may use all enrolled voters or a selected enrolled-voter list; position program eligibility may narrow that set but cannot add voters excluded at group level.

#### Task: Create and publish a poll

1. Open Polling > Events and create a poll.
2. Enter Poll title, optional Description, and required Start Date and End Date. The end must be on or after the start.
3. Choose **Next: Branding** and optionally upload a poll banner.
4. Choose **Next: Settings**. Configure **Anonymous responses** and **Allow multiple submissions**.
5. The current form uses the event end date as the poll expiration; there is no separate poll-expiration control in the inspected form.
6. Choose **Create & continue** to create the draft and open the Builder.
7. In Builder, add one or more questions. Select a question type, enter the question text, choose whether it is **Required**, provide options when the type requires them, and upload optional question/option images. Select **Add question** or **Update**. Questions can be edited, duplicated, deleted, and reordered by drag and drop while setup is editable.
8. In Respondents, invite by Program or Year & Section; invitations may be emailed. Review & Publish requires at least one question; respondents are not required before publication.
9. Select **Finish & Publish**. The poll follows its schedule and optional expiration; publishing does not open it immediately.

The available question-type list is registry-driven and may vary by organization. Built-in seed types include Single Choice, Multiple Choice (legacy single-choice alias), Multiple Selection, Yes / No, Rating Scale, Likert Scale, Open Text, and Ranking. Free-option types require at least two non-empty options. Required fields and type-specific bounds are validated again by the backend.

#### Task: Manage poll respondents

Use the Polling **Respondents** stage and the shared cohort-invite workflow. Add existing accounts by Program or Year & Section, optionally email invitations, and remove event enrollment while roster changes are allowed. A completed/responded poll account may remain visible to the Organizer; removal from an event does not erase prior submissions.

#### Task: Create and publish a competition

**Availability note:** The native Competition Scoring setup and scoring experience is controlled by `VITE_COMPETITION_NATIVE_SETUP_ENABLED`, `VITE_COMPETITION_NATIVE_SCORING_ENABLED`, `VITE_COMPETITION_NATIVE_TABULATION_ENABLED`, and `VITE_COMPETITION_NATIVE_RESULTS_ENABLED`. If disabled, the app renders legacy Pageant/competition pages instead. The deployment values are not visible to this source audit.

1. Open Competition Scoring > Events and create an event.
2. Enter a title and required start/end dates; end must not precede start. Description and banner are optional.
3. Choose the competition type (the current selector includes types such as Pageant, Dance, Music, Visual Arts, Dramatic Arts, Literary Arts, and Others; the exact list is sourced from shared setup data).
4. Configure competitions/categories or the corresponding native setup children, rounds, criteria, scoring rules, divisions, entries, and judges in the available stages.
5. Register contestants or entries. Entry types include Individual, Pair/Duo, Team/Group, and Other. Round assignment and qualification are separate from registration.
6. Add existing Competition Judge pool accounts and configure judge roles/assignments. Roles include Judge, Head judge, and Independent score reviewer where enabled.
7. Review readiness and acknowledge the official scoring rules. Publication may require criteria readiness, contestants, judges, confirmed rules, and a reviewer depending on scoring method/approval settings.
8. Select **Finish & Publish**. Publishing freezes the official setup/rules. Scoring is started later from **Live Control**.

Exact steps differ between legacy Pageant and native competition deployment modes. Use the labels displayed by the installed deployment.

#### Task: Configure competition rounds and criteria

- In **Rounds & Scoring**, create a round using **Create Round**. Enter a round name, choose purpose, score progression, optional category/division scope, and contribution percentage when the round contributes to a combined result. The form validates values and total contribution readiness.
- Round purposes include ordinary/qualification/final and special-award contexts. Special awards are separate from the overall competition result.
- Advancement choices include none, Top N, Top percent, threshold, and manual. Top N requires a positive whole number; Top percent must be greater than 0 and at most 100. Threshold requires a numeric official score and is incompatible with rank-based/manual methods. Tied cutoff entries may advance beyond the planned number.
- In **Criteria**, configure major criteria and optional minor criteria with weights, input scales, and bounds. Criteria readiness checks configured coverage and totals before publication.
- In **Scoring rules**, choose the official method, tie behavior, precision, round result source, reviewer requirement, and optional deduction rules. Select **Save Draft**, **Continue to Settings**, **Save & Review**, then **Confirm Configuration** when ready.

#### Task: Manage contestants and judges

- Contestants & Entries: register an individual, pair, team/group, or other entry; enter entry name and positive entry number, optional description/photo, and a division when divisions are enabled. Assign entries to rounds separately. Qualification is confirmed separately and does not happen merely because an entry exists.
- Judges: select existing Competition Judge pool accounts, optionally email invitations, then set their role and scope/assignments. The page includes **Add [n] judges**, **Remove**, and assignment controls. Judge panel and assignments can lock after publication/activation depending on the setup mode.

#### Task: Run live scoring

1. After publishing, open **Live Control**.
2. Prepare a stage lineup, select a round, organize contestants, and plan scoring access. Select **Save Stage Lineup & Continue to Live Session**.
3. Start with **Start Live Session**. The control panel can Pause, Resume, and End Session. The Organizer may move to the previous/next contestant or slot and open/close contestant or criterion access.
4. Judges score only when their event, competition/round, judge assignment, contestant, criterion, and session access permit it.
5. Close a round before finalizing its standing. Review the finalization preview and confirm the action. Advancement and qualification are distinct from scoring and require the appropriate authorized confirmation.
6. Continue to Tabulation for calculations, review, verification, finalization, publication, and permitted exports.

The native judge sheet saves numeric drafts, validates scores against the frozen bounds, and provides **Lock** per major criterion. A criterion can only be locked when all of its required minor scores and applicable deduction inputs are complete and in range. **Submit Scores** is enabled only after the required criteria are locked. The judge must confirm **Submit scores for this round?** with **Yes, Submit Scores**. Drafts, criterion locks, and round submission are separate states.

#### Task: Review rankings, results, and reports

- **Rankings** can show a live preview before publication or an official ranking after published tabulation. It supports contestant search, optional Division and Round filters, and Refresh.
- Tabulation surfaces score matrices, judge turnout, incomplete sources, calculation histories, and result transitions according to method and authorization.
- **Reports** overview links to each owned Election, Competition, and Polling report. Module reports offer Refresh and CSV, Excel, PDF, and JSON exports where implemented. Native competition report/export paths can depend on feature flags and current source digest.
- The public native results route shows only an approved published snapshot. Corrections require replacement or withdrawal through the authorized publication flow; a withdrawn result is unavailable.

### Organizer Restrictions and Errors

- Events are editable only while `draft`. Scheduled events may be unpublished back to draft; active, completed, cancelled, and archived events are locked for ordinary setup edits.
- Admin-created organizer scope limits the Organizer's voter/cohort management. Event ownership is also checked by the backend.
- The roster locks when event status is active by default; `LOCK_PARTICIPANTS_ON_ACTIVE=false` changes this for testing.
- Typical verified errors include profile incomplete, event published/setup locked, event active/roster locked, event archived, invalid/missing required fields, no event enrollment, no judge assignment, closed round/criterion, stale rules/source digest, and incomplete scoring sources.

## 10. Participant User Manual

### Participant Dashboard

**Access:** `/participant`.

The dashboard shows **Active events**, **Assigned events**, and **Completed events**, with counts and event-specific status/action labels. Cards may represent an Election, Competition, or Poll and may show the event banner, group/round action, role, and status. A participant with multiple participant types can receive events of each type.

- **Active** means the event currently has an actionable voting, scoring, or response path according to its module state.
- **Assigned** means the participant is enrolled but the action is not currently open.
- **Completed** means the relevant ballot/round/response has been submitted according to the dashboard classification.

Only events for which the account is enrolled with the appropriate participant type are returned. After sign-in/password handling, the app may open the first active assigned event; if none is active, it opens the dashboard.

### Task: Submit an election ballot

**Prerequisites:** Active Participant account enrolled as `ELECTION_VOTER`; voter must be eligible for the group and positions. The election must be open by its enabled flag and schedule.

1. Open the active Election card or its **Cast vote** action.
2. Review the current ballot group and positions. The backend supplies only eligible groups/positions and their candidates.
3. Select candidate(s) for each required position. Respect each position's maximum selections. A position may be left blank only when that position permits skipping.
4. Select **Review ballot**.
5. Review selections for the displayed group. Select **Back to editing** to make changes before submission.
6. Select **Submit [group name] ballot** to submit the current group.
7. Continue with the next eligible ballot group when presented. Completion is recorded after all groups eligible to that voter have been submitted.

A ballot must contain at least one selection. The backend checks position and candidate membership, duplicate candidate IDs in a position, maximum selection count, required positions, event enrollment, current group order, voting window, and a per-session nonce. The database RPC atomically stores votes and marks the section submitted. Duplicate or stale/replayed section submissions are rejected or treated as already submitted; the participant cannot edit or withdraw a submitted section through the current UI/API.

Unsubmitted election selections are also stored in browser local storage for draft restoration. They are not a submitted vote; clearing browser storage can remove the local draft.

### Election Result Visibility

The election's organizer-selected results visibility controls voter access:

- **Hidden results:** the participant cannot view election results.
- **Real-time results:** enrolled participants may view results while voting is open.
- **Public results:** voter-facing results are shown only after the election has genuinely concluded (scheduled end has passed or the event has been finalized/closed/archived). A temporary pause does not reveal public results.

Returned results are filtered to groups/positions the participant is eligible to access. A participant who has no eligible positions/groups cannot retrieve results through the voter endpoint.

### Task: Submit a poll response

**Prerequisites:** Active Participant account enrolled as `POLLING_RESPONDENT`; poll is open and the participant may submit under the multiple-submission setting.

1. Open the Poll card or its response action.
2. Complete the displayed questions. A required question must be answered; a question type may impose option count, range, step, maximum length, or ranking constraints.
3. The page shows the number of answered questions and a progress bar. Unsubmitted answers can be restored from browser local storage on the same browser.
4. Select **Submit response**.
5. If successful, the page shows **Response submitted**. If multiple submissions are enabled and the poll remains open, **Submit another response** is available.

When multiple submissions are disabled, the database atomically permits only the first submission. When enabled, repeat submissions are accepted while open. The server checks the poll's enabled state, start/end schedule, optional expiration, enrollment, required answers, option IDs, numeric limits, text limits, and ranking rules. There is no current UI/API for editing or withdrawing a prior submission.

For anonymous polls, the submission and answer write path stores `NULL` for respondent IDs at rest. The system still tracks event enrollment/responded status and aggregate analytics; do not interpret “anonymous” as hiding the account's participation state from all organizers or the system.

### Task: Score a competition as a judge

**Prerequisites:** Active Participant account enrolled as `COMPETITION_JUDGE`, selected competition/round assigned to that judge, and scoring access opened by the Organizer. The native scoring path also depends on deployment feature flags.

1. Open the assigned Competition card or **Open scoresheet** / category-round link.
2. Select the assigned competition and round when multiple choices are listed.
3. If the organizer has not opened the category or the live session is unavailable, the page displays a locked/waiting notice and disables score inputs.
4. Enter each configured score within its displayed minimum and maximum, using the allowed decimal precision. Complete all minors for a major criterion.
5. Select the corresponding **Lock**. Locking commits the criterion and makes it read-only for the judge in that scoring context.
6. Continue until the required criteria for every assigned contestant are locked.
7. Select **Submit Scores**, then confirm **Yes, Submit Scores**.

In the native workflow, drafts are saved separately from locks and round submission. The Organizer controls the live session, current round, eligible contestants, and open criteria. Once submitted, scores are not ordinarily editable. Authorized correction/reopening workflows can invalidate and require a new submission; they are audited and may require independent approval. Judges do not see official results until they are published to an authorized result view.

### Participant Profile and Account Management

The Participant account menu shows available identity, school ID, Program, Year & Section, and judge profile details. No self-service profile-edit page is exposed in the current frontend. Use **Sign out** to end the session.

## 11. Competition Scoring Rules and Examples

### Two Scoring Paths

1. **Legacy Pageant/competition scoring:** uses the legacy scoring configuration and `backend/src/modules/scoring-engine.js`. This path remains available for existing events or deployments where native scoring is disabled.
2. **Native/versioned Competition Scoring:** uses frozen rules, rounds, judge submissions, server/shared calculation logic, source digests, calculation records, review transitions, and published result snapshots. This path is enabled by deployment flags.

Do not assume the two paths use identical labels, formulas, or persistence behavior. The event's visible scoring rules and deployed feature flags determine which path applies.

### Score Inputs

- Legacy score types supported in code include 1-10, 1-100, decimal 0-10, and custom ranges. The native workflow validates against the configured criterion/minor-criterion bounds and input precision.
- A configured minor score must be present and within bounds before its major criterion can be locked.
- The versioned numeric engine does not convert missing values into zero. Missing/incomplete submissions keep results incomplete and block calculation readiness.
- In percentage-based native criteria, minor scores are normalized as `raw score / minor maximum * 100`. Unweighted minors are averaged; configured minor percentages may weight them. The major criterion's percentage contributes to the judge total.
- In points-based criteria, configured point values contribute directly rather than being normalized by minor maximum.

### Official Calculation Methods

The native official engine recognizes the following methods. Some older legacy methods may appear only for compatible legacy rules.

| Method                                     | Verified behavior                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Average of judge scores / weighted average | Each judge's weighted criterion total is calculated; the official numeric base is the arithmetic mean of complete judge totals.                                                                                                                                                                     |
| Sum of judge scores                        | Adds complete judge totals.                                                                                                                                                                                                                                                                         |
| Highest judge score                        | Uses the highest complete judge total.                                                                                                                                                                                                                                                              |
| Remove extreme scores / lowest removal     | Removes the configured number of lowest and highest whole judge totals, then averages the remaining totals. At least one judge total must remain in each applicable panel.                                                                                                                          |
| Rank-based placement                       | Ranks contestants within each judge's eligible panel, combines judge placements, and treats lower combined placement totals as better. Equal judge totals share placements; tied combined totals share ranks (for example 1, 1, 3). Rank-based ties use shared ranking in the native configuration. |
| Manual official results                    | Does not calculate numeric totals. An authorized person records positive integer placements with a reason and documented basis; independent verification is required.                                                                                                                               |

For example, if two judges' complete weighted totals are 80 and 90, the average method produces $85$. Under sum, the result is $170$. This example concerns judge totals only; actual inputs depend on configured criteria and rules.

### Rounds, Ties, Deductions, and Publication

- **Back to Zero:** the selected final round alone determines overall placements; earlier rounds do not add points to that result.
- **Carry forward:** adds applicable earlier round results through the selected round; round contribution weights are not used for that carry-forward result.
- **Weighted progression:** combines configured round contributions; where weighted rounds form the final result, their contributions must total 100%. Categories can group and weight rounds where enabled.
- **Special award** rounds keep independent standings from the overall competition result.
- Advancement options include none, Top N, Top percent, numeric threshold, or manual selection. Threshold cannot be used with rank-based/manual scoring. A tie at a cutoff may advance more entries than the planned count.
- Numeric methods may use shared ranks or compare the highest major criterion as a tiebreak. Rank-based uses shared placements/ranks.
- Optional deductions can be configured by an Organizer and/or judge according to the saved rules. Approval may be required; manual placements cannot use automatic numeric deductions. Placement penalties are specific to rank-based methods.
- Numeric results calculate automatically when required current sources are complete and decisions are resolved. Manual results require an explicit authorized calculation/decision. Results are reviewed/verified and published as a versioned snapshot; changed sources require recalculation.
- Competition rankings may be labeled **Live rankings preview** until tabulation is officially published. Do not describe a preview as final.

## 12. Voting Rules and Restrictions

### Election

- A vote requires authenticated enrollment as `ELECTION_VOTER` and eligibility for the relevant ballot group/position.
- The event must have `voting_enabled` and be within its start/end schedule. The backend checks this independently of the frontend.
- Each eligible group must be submitted in section order. Each section is atomically recorded once. A ballot must include at least one selection and must satisfy required-position and `maxVote` constraints.
- Multiple candidates may be selected only within that position's configured maximum.
- Submitted sections cannot be changed or withdrawn through the current participant workflow.
- Results visibility follows the event configuration and server rules described in Section 10.

### Polling

- A response requires authenticated enrollment as `POLLING_RESPONDENT`, an open poll, and valid answers.
- The event start/end schedule, `polling_enabled`, and optional `pollExpiresAt` are checked server-side.
- Single-submission polls atomically reject a second submission. Multiple submissions are allowed only when the Organizer enables them and while the poll remains open.
- The server revalidates required questions and type-specific answer rules. Frontend validation alone is not the enforcement boundary.
- Anonymous mode stores response records without respondent IDs at rest, but event participation state remains tracked.

### Competition Scoring

- A judge must be enrolled as a Competition Judge and assigned to the relevant context. In the native workflow, the live session and per-round/criterion/contestant access must be open.
- The judge's score values must match the displayed scale and precision. Required criteria must be locked before round submission.
- Draft edits, criterion locks, and submission are distinct. After round submission, ordinary edits are blocked; corrections follow authorized review/amendment rules.

## 13. Competition and Poll Statuses

### Account Statuses

| Status      | Verified meaning                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `active`    | Account may sign in, subject to role and password requirements.                                    |
| `suspended` | Account sign-in is blocked.                                                                        |
| `archived`  | Account sign-in is blocked; historical records remain.                                             |
| `pending`   | Defined in account constants; exact user-facing behavior is not fully exposed in the inspected UI. |

### Event Statuses

| Stored status | Typical UI meaning              | Setup/roster effects                                                                              |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `draft`       | Draft / setup                   | Setup editable.                                                                                   |
| `scheduled`   | Published — waiting on schedule | Setup locked; may be unpublished to draft. Roster remains editable while allowed.                 |
| `active`      | Voting/scoring/poll operation   | Setup locked; participant roster locks by default.                                                |
| `completed`   | Completed/closed                | Read-only terminal state.                                                                         |
| `cancelled`   | Cancelled                       | Read-only terminal state.                                                                         |
| `archived`    | Archived                        | Read-only; does not accept operational submissions. Admin restore sets it to completed/read-only. |

“Published” is a UI label for the scheduled state, not a separate event status constant.

### Participant Dashboard Buckets and Labels

Dashboard buckets are **Active**, **Assigned**, and **Completed**. Event-specific labels include Election **Voting open**, **Waiting to open**, **Voted**; Poll **Poll open**, **Waiting to open**, **Poll closed**, **Open — submit again**, **Responded**; Competition labels depend on scoring path and may include **Scoring open**, **Scoring paused**, **Round submitted**, **Waiting to open**, or reviewer status. These are not interchangeable with event database statuses.

### Competition Session and Round States

Native scoring exposes live session states such as active, paused, and completed, plus round/category states such as open, paused, submitted, and closed. Organizer access controls can lock a criterion or contestant even while a broader session is active.

## 14. Role-Permission Matrix

| Feature or Action                                            | Admin         | Organizer     | Participant   | Evidence or Notes                                                                                           |
| ------------------------------------------------------------ | ------------- | ------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| Sign in                                                      | Allowed       | Allowed       | Allowed       | Current login UI accepts email/password. Active account and role checks apply.                              |
| Create own account in UI                                     | Not available | Not available | Not available | No public registration route. Admin accounts are not created from the inspected Admin UI.                   |
| Create organizer account                                     | Allowed       | Not available | Not available | Admin User Management. Admin provides full profile/scope; password is generated and emailed.                |
| Create/manage election voter or poll respondent pool account | Allowed       | Not available | Not available | Admin participant pool forms/import. Organizer enrolls existing accounts into an event.                     |
| Create/manage Competition Judge pool membership              | Allowed       | Not available | Not available | Admin Judges pool; an existing Participant may have multiple types.                                         |
| Change Organizer/Participant account status                  | Allowed       | Not available | Not available | Suspend/archive applies to shared account access; membership removal is a separate action.                  |
| Manage participant taxonomy                                  | Allowed       | Not available | Not available | System Settings > Participant taxonomy.                                                                     |
| Create/edit/publish an event                                 | Not available | Conditional   | Not available | Organizer must own the event; setup/publish status gates apply.                                             |
| View global events                                           | Allowed       | Not available | Not available | Admin Global Events is platform-wide. Organizers see owned module events.                                   |
| Restore archived event                                       | Allowed       | Not available | Not available | Restored as completed, read-only.                                                                           |
| Invite/enroll participant in event                           | Not available | Conditional   | Not available | Organizer ownership, participant scope, event module/type, and roster status apply.                         |
| Configure election positions/candidates/groups               | Not available | Conditional   | Not available | Owned election, normally draft; participant eligibility is separately enforced.                             |
| Configure poll questions/settings                            | Not available | Conditional   | Not available | Owned poll, normally draft.                                                                                 |
| Configure competition structure/rules/judges                 | Not available | Conditional   | Not available | Owned event, draft/frozen-rule gates and deployment feature flags apply.                                    |
| Cast election ballot                                         | Not available | Not available | Conditional   | Enrolled as Election Voter, eligible group/position, valid schedule, valid ballot.                          |
| Submit poll response                                         | Not available | Not available | Conditional   | Enrolled as Polling Respondent, open schedule, answer validation; resubmission depends on poll setting.     |
| Enter competition scores                                     | Not available | Not available | Conditional   | Enrolled Competition Judge, assignment and session access required.                                         |
| View election results                                        | Not available | Not available | Conditional   | Enrollment, eligibility, and event results-visibility setting apply.                                        |
| View official competition results                            | Conditional   | Conditional   | Conditional   | Organizer-owned report/tabulation; judges after publication; public native published snapshot when enabled. |
| Configure system health/alerts/archive policy                | Allowed       | Not available | Not available | Admin-only routes and UI.                                                                                   |
| View/mark notifications                                      | Allowed       | Allowed       | Allowed       | Authenticated notifications endpoints.                                                                      |
| Sign out                                                     | Allowed       | Allowed       | Allowed       | Account menu.                                                                                               |

## 15. Notifications and Confirmation Messages

The shared Notifications panel provides unread counts, search, All/Unread/Read filters, **Open**, **Mark read**, and **Mark all read**. Notification content and action links vary by event/module. Backend notification routes are authenticated and authorize the three role classes.

Other verified messages include:

- Event creation, publish, unpublish, cohort invite, candidate/position changes, and score operations return success/error messages where implemented.
- Invitation/credential email status is reported separately from account enrollment. An enrollment can succeed even if email delivery fails.
- CSV import preview shows row errors and valid rows; import results separate account outcome from email outcome.
- Error messages are surfaced from server responses where the page handles them. Use the Troubleshooting section for recovery suggestions.

Exact email content and delivery outcomes depend on email configuration; never assume an invitation reached a mailbox solely because a participant was enrolled.

## 16. Troubleshooting Guide

| Symptom                                                                   | Likely cause supported by source                                                                                              | Recommended action                                                                                                                   |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Sign-in says credentials are invalid                                      | Wrong email/password or account not found                                                                                     | Re-enter the issued email/password. Use Forgot password for eligible accounts. Ask Admin to verify account status and email.         |
| Account is suspended/archived                                             | Account status blocks authentication                                                                                          | Contact Admin to reinstate/restore the account if appropriate.                                                                       |
| Redirected to Change your password                                        | Account has `must_change_password` set                                                                                        | Set a new password, or use the offered temporary-password option if Organizer/Participant. Admin must change.                        |
| Forgot-password form shows a generic success message but no email arrives | The message is intentionally non-enumerating; account may not exist, may be Admin, or delivery may fail                       | Confirm email and contact support/Admin. Current reset service does not issue links to Admin accounts.                               |
| Organizer cannot open a module                                            | Account inactive, forced password change, missing profile fields, wrong role, or event ownership/scope                        | Ask Admin to check account status/profile; ensure the correct Organizer owns the event.                                              |
| Event setup is read-only                                                  | Event is scheduled/active/completed/cancelled/archived or official competition rules are frozen                               | If scheduled, use **Unpublish to draft** where available. Active/terminal events require the supported correction/amendment process. |
| Participant cannot see an event                                           | Account is not enrolled for that event/type, is inactive, or is outside group/position/judge eligibility                      | Ask the Organizer to check event enrollment, pool/type membership, scope, and assignment.                                            |
| Election ballot is not open                                               | Voting disabled or current time outside start/end window; event not published                                                 | Check event status and schedule; contact the Organizer.                                                                              |
| Ballot submission reports a stale/invalid section or nonce                | Another request submitted the section, section order changed, or the voting session expired                                   | Refresh/reopen the ballot and submit the next available section. Submitted sections cannot be changed through the UI.                |
| Ballot rejects a position                                                 | Required position omitted, too many selections, duplicate/invalid candidate, or ineligible position                           | Review the named position and the displayed maximum/eligibility. Return to ballot editing before submitting.                         |
| Poll cannot submit                                                        | Poll closed/expired, respondent not enrolled, already responded with multiple submissions off, or an answer failed validation | Check poll status and ask the Organizer about enrollment/multiple-submission settings. Correct required/type-specific answers.       |
| Judge cannot score                                                        | No judge enrollment/assignment, live session not started/paused, category/round/criterion/contestant closed                   | Contact Organizer to confirm assignment and open scoring access. Do not treat a locked score field as a saved score.                 |
| Lock button is disabled                                                   | A minor score is missing/out of range, criterion closed, contestant closed, or deductions are invalid/incomplete              | Complete each displayed input and verify configured bounds; contact Organizer if the criterion is intentionally closed.              |
| Submit Scores is disabled                                                 | One or more required criteria are not locked, pending writes remain, session is not active, or scoring window is closed       | Resolve drafts, lock all required criteria, and confirm live session/window status.                                                  |
| Competition ranking says preview or incomplete                            | No published tabulation, missing judge submissions, pending decisions, or current source changes                              | Complete scoring/review and ask Organizer to recalculate/verify/publish. A preview is not official.                                  |
| CSV import contains errors                                                | Invalid fields, duplicate rows/emails, taxonomy mismatch, or conflicting shared profile                                       | Download the error file, correct source rows, and preview the file again. Invalid preview rows are skipped.                          |
| No programs/sections appear                                               | Admin taxonomy is empty or the account's Organizer scope excludes them                                                        | Ask Admin to define taxonomy or update Organizer scope.                                                                              |

Contact the organization's VOTRIX administrator/support person for account access, deployment/API errors, or missing data that cannot be corrected through the user interface.

## 17. Frequently Asked Questions

**Can I register my own VOTRIX account?** No public sign-up route was found. Accounts are created/provisioned by Admin or an external process.

**Does publishing immediately open voting, polling, or scoring?** No. Publishing schedules the event and locks setup. Election/poll windows follow configured schedule/enabled state. Competition scoring is started separately in Live Control.

**Can I vote in every election group?** Only groups and positions for which you are enrolled and eligible are returned to the participant ballot.

**Can I change a submitted election ballot?** No participant edit/withdraw endpoint is exposed for a submitted ballot section. Contact the Organizer if a correction process exists outside the current UI.

**Can a poll accept more than one response?** Only if **Allow multiple submissions** is enabled and the poll remains open.

**Does anonymous polling hide that I participated?** The answer/submission write stores no respondent ID at rest when anonymous. Event-level respondent status and aggregate participation are still tracked.

**Are competition rankings official as soon as judges enter scores?** Not necessarily. Rankings can be a live preview. Official results require current sources, any required approvals, and publication.

**Can an Admin edit Organizer event setup?** No Admin event-edit/publish screen or Admin event mutation route was found. Admin can monitor/export global events and restore archived events as completed/read-only.

**Does `Maximum organizers allowed` block new accounts?** The UI describes this as a soft limit; no backend enforcement reference was found.

## 18. Security and Responsible System Use

- Use only the account and event access assigned to you. Do not share temporary passwords or session access.
- Sign out on shared devices. The application uses authenticated HTTP-only access cookies, CSRF protection, refresh sessions, token-version checks, and per-session revocation in the inspected backend.
- Do not share participant ballot drafts or browser profiles. Unsubmitted election selections and poll answers are cached in browser local storage for restoration.
- Submit only your own ballot/response. Election and polling writes are atomically committed and validated server-side.
- Respect official scoring rules and do not enter scores outside the configured scale. Locks and round submission establish the judging record; corrections require authorized workflows.
- Anonymous poll answers are stored without respondent IDs at rest, but enrollment and responded status remain tracked.
- Do not publish or represent preview rankings as official results.
- Admin should review CSV preview errors and import results; account creation and email delivery are separate outcomes.

## 19. Glossary of System Terms

| Term                            | Meaning in VOTRIX                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| Admin                           | Platform-level account manager.                                                                     |
| Organizer                       | Account that owns and manages events within its configured scope.                                   |
| Participant                     | Global user role for event participants.                                                            |
| Participant type                | Election Voter, Competition Judge, or Polling Respondent classification.                            |
| Event enrollment                | A participant's enrollment in a specific event and participant type.                                |
| Election group / ballot section | Ordered ballot subset containing positions; eligibility can be group-specific.                      |
| Position                        | Election office or ballot choice group; has winner count, max selections, and optional eligibility. |
| Contestant / entry              | Individual, pair, team/group, or other competition participant.                                     |
| Criterion / minor criterion     | Major judging category and its subordinate score inputs.                                            |
| Draft                           | Unpublished setup state; event details and setup are editable.                                      |
| Scheduled                       | Published but waiting for its schedule; setup is locked.                                            |
| Live session                    | Competition operational state controlled from Live Control.                                         |
| Lock                            | Judge commits a completed criterion's scores in the native workflow.                                |
| Round submission                | Judge submits all required locked criteria for a competition round.                                 |
| Preview ranking                 | Current result computed/displayed before official publication.                                      |
| Official result                 | Verified/published calculation snapshot or manual placement decision.                               |
| Taxonomy                        | Admin-defined Programs and Year & Sections used for participant data and cohort filtering.          |

## 20. Screenshot Inventory and Capture Checklist

No authenticated Admin, Organizer, or Participant page was available in a shared browser session. The local integrated browser rendered the public Sign In page, but no screenshot image has been saved in the project. Capture the remaining images with authorized test accounts and representative data; do not include real passwords or sensitive participant data.

| ID    | Screen/workflow to capture     | Role                | Must show                                                           | Suggested caption                            | Status                                                     |
| ----- | ------------------------------ | ------------------- | ------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| UM-01 | `/` Sign In                    | All                 | Email, Password, Remember me, Forgot password?, Sign in             | “Sign in with your provisioned account”      | Locally browser-inspected; image not saved to repository   |
| UM-02 | Admin dashboard                | Admin               | platform stats, module links, activity, health summary              | “Platform overview”                          | Capture needed                                             |
| UM-03 | User Management > Organizers   | Admin               | search/status filters, Add organizer, CSV template/preview actions  | “Manage organizer accounts and access scope” | Capture needed                                             |
| UM-04 | User Management > Participants | Admin               | participant-type tabs and add/import actions                        | “Manage participant pools”                   | Capture needed                                             |
| UM-05 | Election Position Builder      | Organizer           | group progress, Manage election groups, position form, Next gate    | “Configure one or more ballot groups”        | Capture needed; use a single-group and multi-group example |
| UM-06 | Election Candidates and Review | Organizer           | group progress, candidate form, per-group publish readiness         | “Complete candidates for every position”     | Capture needed                                             |
| UM-07 | Poll Builder                   | Organizer           | question type, options/config, required flag, question list/reorder | “Build a registry-driven poll”               | Capture needed                                             |
| UM-08 | Competition Rounds & Scoring   | Organizer           | rounds, criteria, method, result review/confirmation                | “Configure official competition rules”       | Capture needed for each deployed scoring mode              |
| UM-09 | Live Control                   | Organizer           | session status, contestant/criterion access, judge progress         | “Open scoring and monitor the live session”  | Capture needed                                             |
| UM-10 | Election ballot                | Participant         | group/position, selection limit, Review ballot, submission footer   | “Review and submit one ballot section”       | Capture needed; anonymize identities                       |
| UM-11 | Poll response                  | Participant         | question types, response progress, Submit response                  | “Complete and submit a poll response”        | Capture needed; avoid real answers                         |
| UM-12 | Judge scoresheet               | Participant / Judge | bounds, Lock buttons, submission state, closed-state notice         | “Score, lock criteria, and submit a round”   | Capture needed                                             |
| UM-13 | Published competition results  | Public/Participant  | publication version, method, standings, public result route         | “View an approved published snapshot”        | Capture needed; only after result publication              |

## 21. Evidence Appendix and Source References

### Routes, Roles, and Navigation

- [frontend/src/routes/index.jsx](frontend/src/routes/index.jsx) — current role-protected frontend routes and legacy `/voter/*` redirect.
- [frontend/src/routes/ProtectedRoute.jsx](frontend/src/routes/ProtectedRoute.jsx) and [frontend/src/routes/GuestRoute.jsx](frontend/src/routes/GuestRoute.jsx) — authentication, role, and forced-password-change guards.
- [frontend/src/layouts/DashboardLayout.jsx](frontend/src/layouts/DashboardLayout.jsx), [frontend/src/layouts/ElectionLayout.jsx](frontend/src/layouts/ElectionLayout.jsx), [frontend/src/layouts/PageantLayout.jsx](frontend/src/layouts/PageantLayout.jsx), and [frontend/src/layouts/PollingLayout.jsx](frontend/src/layouts/PollingLayout.jsx) — sidebar labels and route groups.
- [backend/src/routes/index.js](backend/src/routes/index.js), [backend/src/routes/admin.routes.js](backend/src/routes/admin.routes.js), [backend/src/routes/organizer.routes.js](backend/src/routes/organizer.routes.js), and [backend/src/routes/voter.routes.js](backend/src/routes/voter.routes.js) — API mounts and role middleware.
- [backend/src/middleware/auth.js](backend/src/middleware/auth.js) — cookie authentication, role authorization, active account, password-change, profile, and event-participant guards.

### Authentication and Accounts

- [frontend/src/pages/auth/LoginPage.jsx](frontend/src/pages/auth/LoginPage.jsx), [frontend/src/components/auth/LoginForm.jsx](frontend/src/components/auth/LoginForm.jsx), [frontend/src/pages/auth/ChangePasswordPage.jsx](frontend/src/pages/auth/ChangePasswordPage.jsx), [frontend/src/pages/auth/ForgotPasswordPage.jsx](frontend/src/pages/auth/ForgotPasswordPage.jsx), and [frontend/src/pages/auth/ResetPasswordPage.jsx](frontend/src/pages/auth/ResetPasswordPage.jsx) — visible authentication forms.
- [backend/src/controllers/auth.controller.js](backend/src/controllers/auth.controller.js), [backend/src/services/auth.service.js](backend/src/services/auth.service.js), [backend/src/services/password-reset.service.js](backend/src/services/password-reset.service.js), and [backend/src/validators/auth.validator.js](backend/src/validators/auth.validator.js) — login, password, session, and reset behavior.
- [frontend/src/pages/admin/UserManagementPage.jsx](frontend/src/pages/admin/UserManagementPage.jsx), [frontend/src/pages/admin/OrganizerManagementPage.jsx](frontend/src/pages/admin/OrganizerManagementPage.jsx), [frontend/src/components/admin/VotersPanel.jsx](frontend/src/components/admin/VotersPanel.jsx), [frontend/src/components/admin/JudgesPanel.jsx](frontend/src/components/admin/JudgesPanel.jsx), and [frontend/src/components/admin/CreateOrganizerModal.jsx](frontend/src/components/admin/CreateOrganizerModal.jsx) — Admin account and pool operations.
- [backend/src/controllers/admin.controller.js](backend/src/controllers/admin.controller.js), [backend/src/services/admin-organizer.service.js](backend/src/services/admin-organizer.service.js), and [backend/src/services/admin-participant.service.js](backend/src/services/admin-participant.service.js) — account creation, membership, import, and status validation.

### Election and Polling

- [frontend/src/pages/organizer/election/ElectionEventFormPage.jsx](frontend/src/pages/organizer/election/ElectionEventFormPage.jsx), [frontend/src/pages/organizer/election/ElectionPositionsPage.jsx](frontend/src/pages/organizer/election/ElectionPositionsPage.jsx), [frontend/src/pages/organizer/election/ElectionCandidatesPage.jsx](frontend/src/pages/organizer/election/ElectionCandidatesPage.jsx), [frontend/src/pages/organizer/election/ElectionVotersPage.jsx](frontend/src/pages/organizer/election/ElectionVotersPage.jsx), and [frontend/src/pages/organizer/election/ElectionReviewPage.jsx](frontend/src/pages/organizer/election/ElectionReviewPage.jsx) — election setup and publish gates.
- [frontend/src/components/organizer/ElectionGroupStepper.jsx](frontend/src/components/organizer/ElectionGroupStepper.jsx) and [frontend/src/utils/electionGroupProgress.js](frontend/src/utils/electionGroupProgress.js) — current implementation of optional group progression/readiness.
- [frontend/src/components/organizer/CohortInviteManager.jsx](frontend/src/components/organizer/CohortInviteManager.jsx) and [frontend/src/components/organizer/ElectionGroupEligibility.jsx](frontend/src/components/organizer/ElectionGroupEligibility.jsx) — event enrollment and group eligibility controls.
- [backend/src/routes/election-organizer.routes.js](backend/src/routes/election-organizer.routes.js), [backend/src/routes/election-voter.routes.js](backend/src/routes/election-voter.routes.js), [backend/src/controllers/election-voter.controller.js](backend/src/controllers/election-voter.controller.js), [backend/src/services/election.service.js](backend/src/services/election.service.js), and [backend/src/utils/eventSchedule.js](backend/src/utils/eventSchedule.js) — election operations, ballot validation, results visibility, and schedules.
- [backend/src/database/migrations/078_election_ballot_sections.sql](backend/src/database/migrations/078_election_ballot_sections.sql), [backend/src/database/migrations/080_election_groups.sql](backend/src/database/migrations/080_election_groups.sql), and [backend/src/database/migrations/130_election_position_program_eligibility.sql](backend/src/database/migrations/130_election_position_program_eligibility.sql) — section eligibility and atomic ballot submission constraints.
- [frontend/src/pages/organizer/polling/PollingEventFormPage.jsx](frontend/src/pages/organizer/polling/PollingEventFormPage.jsx), [frontend/src/pages/organizer/polling/PollingBuilderPage.jsx](frontend/src/pages/organizer/polling/PollingBuilderPage.jsx), [frontend/src/pages/organizer/polling/PollingRespondentsPage.jsx](frontend/src/pages/organizer/polling/PollingRespondentsPage.jsx), and [frontend/src/pages/organizer/polling/PollingReviewPage.jsx](frontend/src/pages/organizer/polling/PollingReviewPage.jsx) — poll setup, questions, respondents, and readiness.
- [frontend/src/pages/voter/VoterEventPage.jsx](frontend/src/pages/voter/VoterEventPage.jsx), [frontend/src/pages/voter/VoterPollPage.jsx](frontend/src/pages/voter/VoterPollPage.jsx), and [frontend/src/components/voter/polling/PollQuestionField.jsx](frontend/src/components/voter/polling/PollQuestionField.jsx) — participant response flows.
- [backend/src/routes/polling-organizer.routes.js](backend/src/routes/polling-organizer.routes.js), [backend/src/routes/polling-voter.routes.js](backend/src/routes/polling-voter.routes.js), [backend/src/controllers/polling-voter.controller.js](backend/src/controllers/polling-voter.controller.js), [backend/src/services/polling.service.js](backend/src/services/polling.service.js), [backend/src/modules/poll-question-types.js](backend/src/modules/poll-question-types.js), and [backend/src/validators/polling.validator.js](backend/src/validators/polling.validator.js) — poll permissions and answer validation.
- [backend/src/database/migrations/017_polling_question_type_registry.sql](backend/src/database/migrations/017_polling_question_type_registry.sql), [backend/src/database/migrations/060_poll_cast_response_rpc.sql](backend/src/database/migrations/060_poll_cast_response_rpc.sql), and [backend/src/database/migrations/087_anonymous_poll_at_rest_rpc.sql](backend/src/database/migrations/087_anonymous_poll_at_rest_rpc.sql) — built-in question types, atomic submissions, and anonymous-at-rest behavior.

### Competition Scoring, Results, and Reports

- [frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx](frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx), [frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx), [frontend/src/components/organizer/competition/CompetitionRoundsTab.jsx](frontend/src/components/organizer/competition/CompetitionRoundsTab.jsx), [frontend/src/components/organizer/competition/CriteriaManager.jsx](frontend/src/components/organizer/competition/CriteriaManager.jsx), [frontend/src/components/organizer/competition/CompetitionRulesEditor.jsx](frontend/src/components/organizer/competition/CompetitionRulesEditor.jsx), and [frontend/src/pages/organizer/competition/CompetitionReviewPage.jsx](frontend/src/pages/organizer/competition/CompetitionReviewPage.jsx) — Organizer setup, rules, and publish readiness.
- [frontend/src/pages/organizer/competition/CompetitionContestantsPage.jsx](frontend/src/pages/organizer/competition/CompetitionContestantsPage.jsx), [frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx](frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx), and [frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx](frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx) — entries, judges, and operations.
- [frontend/src/components/voter/competition/NativeCompetitionWorkspace.jsx](frontend/src/components/voter/competition/NativeCompetitionWorkspace.jsx), [frontend/src/components/voter/competition/CompetitionScoringForm.jsx](frontend/src/components/voter/competition/CompetitionScoringForm.jsx), and [frontend/src/pages/voter/JudgeScoringPage.jsx](frontend/src/pages/voter/JudgeScoringPage.jsx) — judge scoring UI and boundary dispatch.
- [backend/src/modules/scoring-engine.js](backend/src/modules/scoring-engine.js) — legacy scoring calculations.
- [shared/competition-calculation.js](shared/competition-calculation.js), [shared/competition-rule-configuration.js](shared/competition-rule-configuration.js), [shared/competition-score-input.js](shared/competition-score-input.js), [shared/competition-progression-validation.js](shared/competition-progression-validation.js), and [shared/competition-participation.js](shared/competition-participation.js) — versioned scoring formulas, input validation, round progression, and participation behavior.
- [backend/src/services/competition-workflow.service.js](backend/src/services/competition-workflow.service.js), [backend/src/services/competition-native-tabulation.service.js](backend/src/services/competition-native-tabulation.service.js), and [backend/src/services/competition-native-results.service.js](backend/src/services/competition-native-results.service.js) — calculation, review, publication, and public-result projection.
- [backend/src/database/migrations/087_competition_workflow.sql](backend/src/database/migrations/087_competition_workflow.sql), [backend/src/database/migrations/104_competition_scoped_rules.sql](backend/src/database/migrations/104_competition_scoped_rules.sql), [backend/src/database/migrations/105_competition_scoped_scoring.sql](backend/src/database/migrations/105_competition_scoped_scoring.sql), [backend/src/database/migrations/106_competition_scoped_tabulation.sql](backend/src/database/migrations/106_competition_scoped_tabulation.sql), and [backend/src/database/migrations/107_competition_scoped_results.sql](backend/src/database/migrations/107_competition_scoped_results.sql) — native session, scoring, tabulation, and public results storage/permissions.

### Admin, Notifications, Lifecycle, and Reports

- [frontend/src/pages/admin/AdminDashboardPage.jsx](frontend/src/pages/admin/AdminDashboardPage.jsx), [frontend/src/pages/admin/GlobalEventsPage.jsx](frontend/src/pages/admin/GlobalEventsPage.jsx), [frontend/src/pages/admin/SystemSettingsPage.jsx](frontend/src/pages/admin/SystemSettingsPage.jsx), [frontend/src/components/admin/ParticipantTaxonomyPanel.jsx](frontend/src/components/admin/ParticipantTaxonomyPanel.jsx), [frontend/src/pages/admin/AlertConfigPage.jsx](frontend/src/pages/admin/AlertConfigPage.jsx), [frontend/src/pages/admin/ArchivalPolicyPage.jsx](frontend/src/pages/admin/ArchivalPolicyPage.jsx), [frontend/src/pages/admin/HealthDashboardPage.jsx](frontend/src/pages/admin/HealthDashboardPage.jsx), [frontend/src/pages/admin/AuditLogsPage.jsx](frontend/src/pages/admin/AuditLogsPage.jsx), [frontend/src/pages/admin/EmailDeliveryLogsPage.jsx](frontend/src/pages/admin/EmailDeliveryLogsPage.jsx), and [frontend/src/pages/admin/OrganizerDetailPage.jsx](frontend/src/pages/admin/OrganizerDetailPage.jsx) — Admin page controls.
- [backend/src/middleware/eventGuards.js](backend/src/middleware/eventGuards.js), [backend/src/utils/eventLifecycle.js](backend/src/utils/eventLifecycle.js), [backend/src/utils/eventSchedule.js](backend/src/utils/eventSchedule.js), and [backend/src/utils/constants.js](backend/src/utils/constants.js) — event/account states and edit/operation rules.
- [frontend/src/pages/voter/VoterDashboardPage.jsx](frontend/src/pages/voter/VoterDashboardPage.jsx) and [backend/src/services/voter.service.js](backend/src/services/voter.service.js) — Participant dashboard classification and auto-redirect.
- [frontend/src/components/ui/NotificationsModal.jsx](frontend/src/components/ui/NotificationsModal.jsx) and [backend/src/routes/notifications.routes.js](backend/src/routes/notifications.routes.js) — notification UI and API.
- [frontend/src/pages/organizer/reports/ReportsOverviewPage.jsx](frontend/src/pages/organizer/reports/ReportsOverviewPage.jsx), [frontend/src/pages/organizer/reports/ElectionReportPage.jsx](frontend/src/pages/organizer/reports/ElectionReportPage.jsx), [frontend/src/pages/organizer/reports/CompetitionReportPage.jsx](frontend/src/pages/organizer/reports/CompetitionReportPage.jsx), and [frontend/src/pages/organizer/reports/PollingReportPage.jsx](frontend/src/pages/organizer/reports/PollingReportPage.jsx) — report content and export formats.

## 22. Unresolved Questions and Items Requiring Verification

1. **Admin login identifier:** README says username; current login form/schema/controller use email. Confirm the deployed Admin credential policy and correct the README/manual source of truth.
2. **Admin password recovery:** Forgot-password service intentionally does not issue reset links for Admin accounts. Document the supported Admin recovery/provisioning procedure.
3. **Normal password change:** The forced-change page says users can change passwords anytime in account settings, but no normal change-password link/page is exposed after the flag clears. Confirm whether the UI is missing a feature or the helper copy is outdated.
4. **Maintenance mode and organizer capacity:** Admin UI exposes these settings, but no backend runtime references were found for `maintenance_mode` or `max_organizers`. Confirm whether another deployment service consumes them.
5. **Native competition feature flags:** Confirm production values for `VITE_COMPETITION_NATIVE_SETUP_ENABLED`, `VITE_COMPETITION_NATIVE_SCORING_ENABLED`, `VITE_COMPETITION_NATIVE_TABULATION_ENABLED`, and `VITE_COMPETITION_NATIVE_RESULTS_ENABLED`; the actual screenshots/manual flow depend on them.
6. **Database/runtime verification:** Source and migrations were inspected, but no connected Supabase database or production records were queried. Confirm migration version and deployed schema before publishing operational instructions.
7. **Browser/API connectivity:** The local login page rendered, but authentication requests to `http://localhost:5000/api` failed CORS in the integrated browser. Authenticated Admin/Organizer/Participant screens could not be visually inspected.
8. **Screenshots:** Only the local Sign In screen was inspected. Capture authenticated screens with test accounts and non-sensitive data before producing the DOCX.
9. **Participant profile/password access:** Participant profile fields display as read-only in the account menu. Confirm whether participants should have profile editing or a post-initial password-change route.
10. **Legacy/native scoring mapping:** Confirm which competition types/events use the legacy Pageant scoring engine versus native competition children in the production installation. Do not combine their workflows into one unqualified guide.
11. **Public competition result policy:** The native results route is intentionally public but requires a published snapshot. Confirm whether this is the intended release policy for every native competition.
12. **Terms used in the institution:** Labels such as “Participant,” “Election Voter,” “Competition Judge,” and “Polling Respondent” are implementation names; confirm whether the institution wants different user-facing terms in the official manual.

## 23. Final Documentation Validation Checklist

- [x] Separate Admin, Organizer, and Participant sections are present.
- [x] The role matrix uses Allowed, Restricted, Conditional, or Not available with implementation notes.
- [x] Election, polling, and competition scoring workflows are traced through frontend and backend source.
- [x] Election duplicate/replay, group-order, eligibility, and result-visibility behavior is documented.
- [x] Poll scheduling, answer validation, multiple submissions, and anonymous-at-rest behavior is documented.
- [x] Legacy and native competition scoring paths are distinguished; numeric and rank/manual result behavior is described from code.
- [x] Statuses, permissions, imports, email outcomes, and recovery guidance are included.
- [x] Evidence appendix uses repository-relative source references.
- [x] Unverified behavior is listed rather than asserted.
- [x] Screenshot inventory distinguishes the locally inspected Sign In screen from screens that still require capture.
- [ ] Confirm unresolved deployment/account questions in Section 22 before releasing the official manual.

**Readiness assessment:** Core workflows for all three roles are implementation-grounded. Election ballot submission, poll submission, organizer event setup/publishing, participant enrollment/eligibility, legacy/native competition scoring, and published results were traced through source. The local Sign In page was browser-inspected; role-protected screenshots remain to be captured. Admin password recovery, ordinary password-change access, settings enforcement, live feature-flag values, and deployment database state require confirmation before the official user manual is finalized.
