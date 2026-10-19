# VOTRIX Complete Event Process

This document explains the user processes implemented in the current VOTRIX working tree, traced on October 11, 2026. Its emphasis is what each person does, what the application does in response, what records change, and how those records make the next activity possible. Competition scoring is the main journey; the other implemented modules and administrative processes are also explained.

This is source-based documentation. No application page was opened, no backend was started, and no database operation, scoring submission, migration, or email was executed during this analysis. Existing uncommitted repository changes are included in the description. This document is the only file created for this request; existing source and documentation were left unchanged.

The labels used throughout have specific meanings:

- **UNCONFIRMED — repository evidence is insufficient.** A deployed fact or successful runtime outcome cannot be established by reading the available code.
- **NOT FOUND IN REPOSITORY.** No implementation of the stated feature or process was identified.
- **IMPLEMENTATION INCOMPLETE / PARTIALLY IMPLEMENTED.** Some supporting pieces exist, but the complete described process is not implemented consistently.
- **IMPLEMENTATION MISMATCH.** Connected frontend, backend, or database pieces do not agree.

File references are relative to the repository root. Files retaining the name `pageant` implement much of the current competition module; that filename does not imply a separate pageant application.

## Complete User Journey

The process begins with an Administrator making the necessary accounts available. The Administrator registers an Organizer with organization information and scope, and registers participant accounts that can belong to the judge pool. The Organizer and Judge do not create each other's accounts through the current competition setup page. When a new account is created, the system stores its password as a bcrypt hash, sets its account and first-login flags, and attempts the account email. Judge-pool membership and actual enrollment in a particular competition are separate records.

The Organizer signs in, passes the applicable password and profile checks, and opens Competition Scoring Events. From there, the Organizer starts the create form, enters a title, optional description and competition-type label, and selects start and end dates with times. The Organizer proceeds to Branding and can choose a banner. During this activity, the application can save unfinished form data as a create draft. When the Organizer chooses **Create & continue**, the backend creates the actual event with an event identifier and draft status. The Organizer is taken to Structure & Scoring. Creating this event does not start a session, assign judges, or automatically create the rounds suggested by the selected competition type.

In Structure & Scoring, the Organizer decides whether to use rounds and divisions, creates the parent criteria, adds the minor criteria that Judges normally score, and sets the available precision and score-removal settings. The Organizer then adds contestants, including names, contestant numbers, optional division and photo, and connects contestants to rounds when rounds are used. Each saved structure record references the same event, directly or through a membership record. This is what lets the later scoresheet distinguish the correct competition, contestant, round, and scoring target.

The Organizer next visits Judges, selects existing eligible accounts from the pool, and optionally asks the system to email an event invitation to newly added Judges. The system creates their event enrollments. The Organizer can then add event, round, category, or division assignment records. The current live submission path does not enforce every assignment restriction implemented by the older batch scoring path; the assignment process and this enforcement difference are described separately below.

Once contestants, criteria, and Judges are present, the Organizer opens Review & Publish and chooses **Finish & Publish**. The system releases the draft event to scheduled status, locks much of setup, and makes Live Control the next operational activity. The Organizer still has to choose **Start Live Session**. The start service checks prerequisites, creates an active competition session, stores its current round and contestant order, and attempts to mark the event active with scoring enabled. For competitions, the background lifecycle service follows live-session state rather than treating the planned end date as an automatic competition finish.

After signing in, an enrolled Judge reaches the participant dashboard or an active event destination. Opening the competition loads the current session scoresheet. While no active session is available, the page waits. During an active session, it shows the session field of contestants and the applicable criteria and minor criteria. Closed contestants or criteria remain visible with disabled inputs. The Judge enters numeric scores within the displayed ranges and presses **Lock** for one completed parent criterion for one contestant. Merely typing a number does not save a score to the backend.

When the Judge locks a criterion, the backend validates the current session, contestant availability, criterion completion, score ranges, and prior locks. It saves the values and locked parent IDs in a session score record, then mirrors the newly committed values into individual ranking-store score rows. The page reloads saved values and displays the criterion as locked; the Organizer's live progress view can refresh. The Judge repeats this for the remaining available criteria and contestants. The Organizer can pause/resume scoring, change session context, or explicitly unlock a score for correction.

Live ranking reads aggregate the stored score rows using the scoring engine. Separately, the Organizer can preview and finalize round standings for advancement, or open Tabulation, add official deductions, select a calculation method, and choose **Calculate**. Calculate stores a result snapshot for review; **Finalize results** freezes that snapshot's workflow status, and **Publish results** makes the published event-wide snapshot the official source used by results and reports. The system does not automatically perform these three publication actions just because the last Judge has locked a score.

Ending the live session is another separate action. **End Session** marks the session completed and attempts to complete the event and disable scoring. It performs a best-effort score-store reconciliation and ranking update, but does not publish official tabulation. **IMPLEMENTATION MISMATCH.** The current organizer route guard rejects deductions and tabulation mutations after the event is completed, although the sidebar places Tabulation after Live Control. Therefore the source does not establish an uninterrupted “end session, then calculate/finalize/publish” workflow. The document describes the implemented actions and this boundary without changing them.

Evidence: [admin-participant.service.js](backend/src/services/admin-participant.service.js), [CompetitionEventFormPage.jsx](frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx), [CompetitionWorkspacePage.jsx](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx), [CompetitionJudgesPage.jsx](frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx), [CompetitionReviewPage.jsx](frontend/src/pages/organizer/competition/CompetitionReviewPage.jsx), [JudgeScoringPage.jsx](frontend/src/pages/voter/JudgeScoringPage.jsx), [competition-session.service.js](backend/src/services/competition-session.service.js), [competition-tabulation.service.js](backend/src/services/competition-tabulation.service.js), [eventGuards.js](backend/src/middleware/eventGuards.js).

## Organizer Process

### Entering event management

The Organizer enters through the shared login screen. `useLogin.handleSubmit` calls the unified login API, stores the returned user display information, and redirects according to the account role and first-login status. The backend also requires the Organizer's organizational profile to be complete before module access. The current Administrator registration form supplies that profile, so an ordinary newly registered Organizer need not fill a separate competition-specific onboarding form.

The Organizer opens the competition event-management area at `/organizer/competition/events`. `CompetitionEventsPage` retrieves the Organizer's competition events and exposes creation and event-opening navigation. Event ownership comes from the event's organization and that organization's `organizer_id`; an event is not a standalone record shared indiscriminately among Organizers.

Evidence: [useLogin.js](frontend/src/hooks/useLogin.js), [ProtectedRoute.jsx](frontend/src/routes/ProtectedRoute.jsx), [organizer.routes.js](backend/src/routes/organizer.routes.js), [CompetitionEventsPage.jsx](frontend/src/pages/organizer/competition/CompetitionEventsPage.jsx), [event.service.js](backend/src/services/event.service.js), `assertOrganizerOwnsEvent`.

### Entering event information and branding

The Organizer opens `/organizer/competition/events/new`. The Details form accepts the title, optional description, start date/time, end date/time, and optional competition-type label. Its catalog includes Pageant, Dance Competition, Singing Competition, Talent Competition, and Simple / Blank, with an Others option for a custom label. The custom-label input is limited to 32 characters. Competition is already the selected module; the optional competition label is not a switch to the election or polling module.

The title is required and the frontend schema limits it to 200 characters. Both dates are required and must be parseable; end must be on or after start. The calendar component supplies the start value as the end picker's minimum. The form converts local date/time input to an ISO value for the backend. A competition venue/location field, venue table, or competition venue operation is **NOT FOUND IN REPOSITORY.** Status is not an ordinary editable select in this create form; the normal create process supplies draft status through the backend default.

The Organizer chooses **Next: Branding**. Before the actual event exists, the application can persist the partial form in `event_drafts`, scoped by Organizer and module. Branding accepts an optional banner upload. Uploading creates or reuses an image asset and stores its URL/reference with the draft. The frontend keeps a file in memory until the upload operation completes. Unfinished draft data is not a competition session, contestant enrollment, or submitted judge score.

Evidence: [CompetitionEventFormPage.jsx](frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx), `handleNext`, `handleNextBranding`, `getCompetitionTypeValue`; [event.schemas.js](frontend/src/schemas/event.schemas.js), `pageantEventSchemaStep1`, `localInputToIso`; [CalendarCard.jsx](frontend/src/components/ui/CalendarCard.jsx); [useSilentDraftAutosave.js](frontend/src/hooks/useSilentDraftAutosave.js); [draft.service.js](backend/src/services/draft.service.js).

### Saving the actual event and moving to configuration

On **Create & continue**, the form calls `handleContinueToContestants`. Despite that function's name, its actual destination is the workspace. It POSTs to `/api/organizer/competition/drafts/publish` with validated details. The draft controller merges the saved banner/asset with the request, validates create fields, and invokes `createCompetitionEvent`. This service resolves the Organizer organization and inserts an `events` row with `organization_id`, title, description, banner/asset, dates, competition label, `event_type='competition_scoring'`, `status='draft'`, and `scoring_enabled=false`.

The database-generated event UUID is returned in `{success:true,event}` with HTTP 201. The frontend replaces the create route with `/organizer/competition/events/:eventId/workspace`. Subsequent configuration requests place that ID in the URL. The create service attempts draft cleanup and schedule synchronization and records event activity. The optional type label does not seed the template's rounds or scoring structure. Existing template definitions describe examples and supply hints, but the actual create service leaves structure creation to the Organizer.

The name `/drafts/publish` can be misleading in a process description: it means create the real event from unfinished form data. It does not perform the later **Finish & Publish** action. A separate direct POST `/api/organizer/competition/events` also creates an event through the same competition create service.

Evidence: [draft.controller.js](backend/src/controllers/draft.controller.js), `CREATE_MAP`, `publishDraft`; [draft.service.js](backend/src/services/draft.service.js), `publishDraft`; [pageant.service.js](backend/src/services/pageant.service.js), `createCompetitionEvent`; [competition.validator.js](backend/src/validators/competition.validator.js), `validateCompetitionEvent`; [mapper.js](backend/src/foundation/mapper.js), `mapEvent`.

### Configuring and reviewing the event

In the workspace, the Organizer uses Rounds, Criteria, Divisions, and Scoring rules. The page loads the event foundation snapshot so these controls share the same rounds, contestants, Judges, assignments, and scoring configuration. A successful mutation causes the page to reload that snapshot. Categories still have supporting code and API operations, but the ordinary Categories tab is hidden; the normal user should not be described as always creating a category before creating a round.

The Organizer proceeds to Contestants, then Judges, then Review & Publish. The common event navigation is defined by `EVENT_STAGES`: Details, Branding, Structure & Scoring, Contestants, Judges, Review & Publish, Live Control, Tabulation, Rankings, Analytics, Report. These navigation “stages” track the setup/process pages. They are not judging-stage database records, and marking a step completed does not automatically open scoring.

On Review & Publish, the screen displays counts of contestants, Judges, and criteria. **Finish & Publish** becomes available when all three are present. The backend separately requires at least one active Judge enrollment, a contestant and a criterion, and draft status. It changes the event to scheduled and rereads it after lifecycle reconciliation. Weight totals and round membership have separate checks at session start; a published setup is not proof all stricter start prerequisites have passed.

Once published, setup mutations protected by `assertSetupEditable` are locked. Scheduled events can be unpublished back to draft for setup changes. The participant roster normally remains editable while draft or scheduled and locks on active status; the backend has a feature flag allowing active roster changes when explicitly set. The actual deployed flag is **UNCONFIRMED — repository evidence is insufficient.**

Evidence: [eventStages.js](frontend/src/utils/eventStages.js), [CompetitionWorkspacePage.jsx](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx), [CompetitionReviewPage.jsx](frontend/src/pages/organizer/competition/CompetitionReviewPage.jsx), `handlePublish`, `handleUnpublish`; [pageant.service.js](backend/src/services/pageant.service.js), `publishCompetitionEvent`, `unpublishCompetitionEvent`; [eventLifecycle.js](backend/src/utils/eventLifecycle.js).

## Event Structure

An event belongs to one organization, and that organization belongs to an Organizer account. The event UUID links its configuration, contestant field, enrolled Judges, sessions, deductions, and result calculations. Some links are direct `event_id` fields; others reach the event through a parent record. The application uses these relationships to retrieve the correct competition at each page rather than creating independent copies of an event for each Judge.

Rounds are optional event segments. A round can optionally belong to a category and division. Contestants and criteria can each be connected to several rounds using separate membership tables. Parent criteria can contain several minor criteria; a Judge normally enters a separate score for each minor. An optional division groups contestants and can also be attached to other configuration entities. Categories group weighted round contributions; they are not a mandatory layer between every division and round.

Judges are users enrolled as `COMPETITION_JUDGE` in `event_participants`. Their assignments reference that enrollment, not a contestant record. A session belongs to the event and stores the current round, current presentation division, contestant order, primary contestant and scoring gates. The same session is used by multiple Judges; a new session is not created every time a Judge opens a contestant or locks a criterion.

Session score records preserve each Judge's values and locks. Separate flattened score records are used by the ranking engine. Round-result rows preserve finalized advancement decisions. Tabulation calculations preserve result/configuration snapshots for review and publication. Official deductions are separate records and do not replace the original numeric judge score.

A separate mandatory judging-stage entity above rounds, round-type entity, individual performance entity, and contestant approval workflow are **NOT FOUND IN REPOSITORY.** A session stage-group/gate and the frontend stepper exist, but neither constitutes such an entity.

Evidence: migrations [015 competition foundation](backend/src/database/migrations/015_competition_scoring_foundation.sql), [023 live session](backend/src/database/migrations/023_competition_live_session.sql), [038 divisions](backend/src/database/migrations/038_competition_divisions.sql), [041 judge unification](backend/src/database/migrations/041_unify_competition_judges.sql), [058 advancement](backend/src/database/migrations/058_round_advancement.sql), [071 minor criteria](backend/src/database/migrations/071_minor_criteria.sql), [081 deductions](backend/src/database/migrations/081_competition_deductions.sql), [082 result calculations](backend/src/database/migrations/082_competition_result_calculations.sql).

## Round / Stage Creation Process

The Organizer creates a round in the workspace's Rounds tab. The ordinary creation form accepts a round name and weight percentage, with optional category/division selectors when those structures are available. The page checks the remaining round-weight budget before calling `pageantService.createRound`. The backend checks event ownership and draft-only setup editing, validates supplied category/division ownership, and inserts the round with its `event_id`. After the response, the page reloads foundation and shows the new round.

The backend round contract also supports description, display order, starts/ends timestamps, open flag and progression settings. These fields are not all exposed by the ordinary add-round form. That form sends name, weight, category and division; the validator/service default `display_order` to zero and `is_open` to false. Lists order rounds by display order and then creation time, so default-created rounds can be displayed in creation order while sharing the same stored order number. An ordinary round-order editor in this page is **NOT FOUND IN REPOSITORY.**

When expanding a round, the Organizer sees its contestant count and assigned criterion-weight summary. Actual contestant assignment is performed on Contestants; criterion assignment is performed in Criteria. The expanded panel allows setting independent/cumulative score policy and advancement mode, with a number for top-N, percentage, or threshold. **Save settings** sends the existing round fields together with these progression values. The create service itself does not insert supplied progression properties; new rows use schema defaults until the separate update persists them.

The current round for scoring is later stored in `competition_sessions.current_round_id`, not inferred solely from the round's timestamps or name. Session start picks the first ordered round. The Organizer's Live Control selection can change it, rebuilding contestant order and resetting the relevant gates. Round `is_open`, session `status`, criterion openness, and `finalized_at` are separate concepts. A round record is not automatically finalized when the Organizer changes selection.

**IMPLEMENTATION MISMATCH.** Round open/close controls send a PATCH containing only `{isOpen}`, while `validateRound` requires a nonblank name even for PATCH. In addition, `updateRound` calls the draft-only setup guard, so it rejects round mutation after publication. The Live Control round-close action therefore cannot be described as a confirmed successful step merely because its button exists.

**IMPLEMENTATION MISMATCH.** Next-round discovery selects a round whose `display_order` is strictly greater than the finalized round. Rounds created by the normal form default to the same value, zero. Displaying them in chronological creation order does not establish a next-round link for advancement. The later progression operation depends on the stored order values actually being distinct.

Evidence: [CompetitionWorkspacePage.jsx](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx), `RoundsTab.submit`, `toggleOpen`, `RoundAssignmentPanel.saveAdvancement`; [competition.controller.js](backend/src/controllers/competition.controller.js), `createRound`, `updateRound`; [competition.validator.js](backend/src/validators/competition.validator.js), `validateRound`; [competition.service.js](backend/src/services/competition.service.js), `createRound`, `updateRound`; [competition-session.service.js](backend/src/services/competition-session.service.js), `setActiveRound`, `getNextRound`.

## Criteria and Scoring Rules

### Creating parent and minor criteria

The Organizer opens Criteria in the workspace and selects a round if rounds exist. The parent creation form accepts a criterion name and percentage. The frontend requires a positive, finite weight within the remaining budget. It creates the event criterion first and then attaches the returned criterion ID to the selected round through a second request. Existing event criteria can be attached or detached instead of duplicated. Since creation and attachment are separate writes, creating a criterion is not by itself proof it was successfully linked to a round.

Within a parent criterion, the Organizer can add minor criteria. Each minor has a name and score type: 1–100, 1–10, Decimal (0–10), or Custom range. Custom range requires a numeric minimum and maximum, with maximum greater than minimum. The minor does not carry its own percentage; the parent supplies the criterion percentage. When another minor is added, the UI defaults its scale to the last minor's scale for that parent.

These entries create `competition_criteria`, `competition_round_criteria` and `competition_minor_criteria` records as appropriate. The minor references both its event and parent. A criterion/minor description entry in the current editor is **NOT FOUND IN REPOSITORY.** Parent min/max columns exist, but the current normal Judge inputs obtain their bounds from the minor's scale. If a parent has no minors, live scoring supplies a fallback input for the parent against the event scale. The editor encourages at least one minor, but the fallback remains implemented.

Minor reads order by display order and creation time. The backend minor API accepts display order; the ordinary add-minor form does not send a custom order. Parent foundation reads also use display order, while the current parent validator does not expose an order field. Live round-criterion membership is read without an explicit order clause, then used to order parents. A stored minor inactive flag is not filtered out by the current live criteria loader.

Evidence: [CriteriaManager.jsx](frontend/src/components/organizer/competition/CriteriaManager.jsx), `handleCreate`, `MinorCriteriaManager.add`; [pageant-organizer.controller.js](backend/src/controllers/pageant-organizer.controller.js); [competition.validator.js](backend/src/validators/competition.validator.js), `validateCriteria`, `validateMinorCriteria`; [pageant.service.js](backend/src/services/pageant.service.js), `createCriteria`, `createMinorCriteria`; [competition-session.service.js](backend/src/services/competition-session.service.js), `loadActiveScoringCriteria`.

### Configuring how submitted scores combine

The Organizer uses Scoring rules to save decimal precision, counts of highest/lowest scores to drop, and an overall-ranking option when divisions are enabled. That screen saves a partial `events.scoring_config`; it does not currently expose the calculation-method or tie-breaker selector. Calculation method is selected later in Tabulation. The backend configuration API and engine also support those additional properties, so API capability and actual screen inputs must be distinguished.

Precision accepts zero through six decimal places. Removal counts must be nonnegative integers. Drop counts affect reduction only when the applicable method is `lowest_removal`; setting a number does not mean every calculation method drops scores. The default configuration is weighted average, two decimal places, and a 1–100 fallback event scale. Normal minor scales remain independent of that fallback.

Criterion percentages describe relative contributions inside the selected round, or the flat event when no rounds are configured. Round weights describe how segments combine into an event result. Minors are first reduced across Judges, normalized to a percentage of their own maximum, and averaged equally inside their parent. The parent percentages and round weights are then applied by the engine. This makes configuring criteria part of both the scoresheet's input definition and the final-result calculation.

For example, if a Judge-average minor value is 8 on a 1–10 scale, its normalized value is 80. A Judge-average value of 90 on a 1–100 scale is 90. A parent containing those two minors has a value of 85 before parent/round weighting. This is an illustration of the confirmed formula, not a claim that the repository contains an event with those values. Custom normalization divides by maximum; it does not subtract the minimum first.

Penalties are implemented as separate official deduction records in Tabulation. A per-minor negative penalty field or automatic elapsed-time penalty is **NOT FOUND IN REPOSITORY.** Saving scoring settings does not itself create a deduction or produce an official result snapshot.

Evidence: [CompetitionWorkspacePage.jsx](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx), `ScoringTab.save`; [competition.service.js](backend/src/services/competition.service.js), `setScoringConfig`; [competition.validator.js](backend/src/validators/competition.validator.js), `validateScoringConfig`; [scoring-engine.js](backend/src/modules/scoring-engine.js), `resolveScoreBounds`, `reduceScores`, `computeRankings`; [tabulation.js](backend/src/modules/tabulation.js).

## Contestant Process

The Organizer proceeds to Contestants and enters a name, positive contestant number, optional division, and optional photo. **Add contestant** calls `handleCreate`, which POSTs the text/number/division information. The backend validates the payload and inserts `competition_contestants` with the current event ID. The generated UUID identifies the contestant throughout membership and scoring; the visible number is a display/order value and is not a login account ID.

If a photo was selected, the page sends it through a second upload request using the returned contestant ID. The photo URL and image reference are associated with that saved record. The page then reloads the field and requests the next number. Editing fills the same form from an existing contestant and sends a PATCH; the current UI disables number editing. A competitor account, self-registration screen, approval decision, and contestant submission-status field are **NOT FOUND IN REPOSITORY.** The Organizer creates the competition entry directly.

When divisions exist, the database defines contestant-number uniqueness per event/division, plus a separate uniqueness rule for event-wide contestants with no division. A number can therefore be reused across distinct divisions under the declared migrations. The Organizer can filter the list by division and distinguish entries by both division and number. No direct contestant-category field is used in this creation flow.

If rounds exist, the Organizer selects a round and toggles or bulk changes contestants' membership. The membership row contains a round ID and contestant ID; it does not create another contestant entry. Later, the live session uses an ordered list of contestant IDs to load names/photos/numbers for the Judge sheet.

**IMPLEMENTATION MISMATCH.** The live `buildContestantOrder` puts explicitly assigned contestants first, then appends eligible unassigned event contestants. The round-standing calculation instead restricts to assigned contestants when membership exists. Thus a Judge's visible/scorable field is not necessarily identical to the field used for finalized round standings. The stored memberships and this source behavior are documented separately.

Evidence: [CompetitionContestantsPage.jsx](frontend/src/pages/organizer/competition/CompetitionContestantsPage.jsx), `handleCreate`, `refreshNextNumber`, round membership handlers; [pageant.service.js](backend/src/services/pageant.service.js), contestant CRUD/number functions; [039 numbering migration](backend/src/database/migrations/039_per_division_contestant_number.sql); [competition-session.service.js](backend/src/services/competition-session.service.js), `buildContestantOrder`, `computeRoundStanding`.

## Judge Process

### Getting an account and an event

The Administrator registers a Judge through User Management's judge panel or the corresponding import process. For a new Judge, the service creates an active participant user with name/professional profile, a hashed temporary password, and `must_change_password=true`, then adds active global `COMPETITION_JUDGE` membership. For an existing eligible participant account, it can add judge membership rather than issue a second identity; shared-name conflicts are checked. Global role is `participant`, with legacy `voter` compatibility accepted by current authorization code. Judge is an event/pool type, not a distinct global login role.

The Organizer must still add that account to a specific event. Receiving an account-created email establishes credentials; receiving an event invitation is a separate notification of competition enrollment. Optional event email failure does not undo the enrollment, so a Judge's association is established by records rather than by proof of email delivery.

The Judge signs in at the common login page using email and password. The backend verifies the password and active account, issues HTTP-only access/refresh cookies, and returns user and CSRF data. The frontend can redirect to password change first. The implementation also permits a non-admin user to skip the required-change flag through the designated endpoint. Once the flags allow access, the participant dashboard aggregates that user's enrolled events. If an event is classified active, `getVoterLoginRedirect` can send the user directly there; otherwise the dashboard is used.

The competition card links to `/participant/competition/events/:eventId/score`. Opening it runs `JudgeScoringPage`, which requests the live session view. The server checks event enrollment of type `COMPETITION_JUDGE`. A Judge without enrollment cannot gain this access merely because the account belongs to the global judge pool.

Evidence: [JudgesPanel.jsx](frontend/src/components/admin/JudgesPanel.jsx), [admin-participant.service.js](backend/src/services/admin-participant.service.js), `createJudge`, `insertJudge`; [user-participant-type.service.js](backend/src/services/user-participant-type.service.js); [auth.service.js](backend/src/services/auth.service.js); [useLogin.js](frontend/src/hooks/useLogin.js); [voter.service.js](backend/src/services/voter.service.js), `getVoterDashboard`, `getVoterLoginRedirect`; [pageant-judge.routes.js](backend/src/routes/pageant-judge.routes.js).

### What the Judge sees and what access is actually checked

Before live scoring, the page displays **No active session** and waits for the Organizer. It requests updated session data every five seconds while local session state is not active. When the current session is active, the Judge sees the event header, Judge identity, current round label where available, scoring availability summary, and the contestant/criteria sheet. Desktop shows a table; mobile shows contestant cards. The sheet includes contestant numbers, names/photos, parent percentages, minor names/ranges, and lock progress.

The entire current session field is returned, with closed entries disabled, rather than a single contestant-selection wizard owned by the Judge. The Organizer controls availability and round context. A standalone Judge-created judging session, Judge-owned round activation, criterion-specific assignment entity, or final “complete my entire assignment” endpoint is **NOT FOUND IN REPOSITORY.** Completion is represented by locks for contestant/criterion combinations and full-lock flags for rows.

**IMPLEMENTATION MISMATCH.** Event assignment records exist, and the legacy batch endpoint enforces assignment scopes, reviewer restrictions, inactive enrollment and allowed divisions. The current live sheet/submission functions do not invoke those checks. The Organizer progress function does use scope/role filtering. Therefore a scope-restricted Organizer progress list does not prove that live Judge submissions are filtered the same way. The Judge page also contains division-selection behavior expecting `allowedDivisions`, but the current live-view response does not populate that field.

**IMPLEMENTATION MISMATCH.** Participant competition dashboard classification uses planned-date scoring-open checks and `has_scored`, while live submission uses active session state and does not set that event-wide completion flag. Dashboard “Waiting” or “Pending” therefore is not a reliable substitute for inspecting live session/criterion lock state.

Evidence: [JudgeScoringPage.jsx](frontend/src/pages/voter/JudgeScoringPage.jsx), [CompetitionScoringForm.jsx](frontend/src/components/voter/competition/CompetitionScoringForm.jsx), [competition-session.service.js](backend/src/services/competition-session.service.js), `getJudgeSessionView`, `submitJudgeSessionScore`, `getJudgeProgress`; [pageant.service.js](backend/src/services/pageant.service.js), `getJudgeAssignmentContext`, `canJudgeScore`, `submitJudgeScores`; [voter.service.js](backend/src/services/voter.service.js), `classifyCompetition`.

## Judge Assignment Process

The Organizer opens Judges and searches the registered pool by name/email. The pool contains active accounts with active judge membership; its GET also uses optional professional-profile Organizer assignments to limit displayed accounts. Already enrolled accounts are marked Added and cannot be selected again through the normal checkboxes. The Organizer selects remaining accounts, optionally checks **Email an invitation to newly added judges**, and presses **Add judges**.

`handlePick` sends `{userIds,notify}` to `/judges-v2/pick`. The service checks event ownership and roster editability, matches eligible accounts, skips existing enrollment, and calls `registerParticipant` for each new Judge. That shared operation ensures participant account eligibility and the correct event type, then writes `event_participants` with the event ID, user ID, `COMPETITION_JUDGE`, judge role/display information, and activity state. The response counts matches, enrollments, existing accounts and notifications, and the frontend reloads the pool/list/foundation.

The Organizer then uses **Judge assignments** on the same page. The panel offers Event, Round, Category and, when enabled, Division. For Event, the target is the current event ID; otherwise the Organizer chooses a saved scope item. **Add assignment** creates an assignment for one enrolled Judge. **Assign all** attempts the chosen scope for all enrolled Judges with independent requests; it is not a single transactional all-Judges write.

The assignment record stores `participant_id`, `scope`, and `scope_id`. The URL parameter called `judgeId` in this organizer assignment API means the Judge's `event_participants.id`. By contrast, `judge_id` on a submitted score is the account's `users.id`. The assignment's event is obtained through its participant record, and the scope target is validated to belong to that event. A unique triple prevents duplicate assignment rows. The schema also defines a trigger guarding the polymorphic scope reference.

Leaving a Judge with no assignments defaults to event-wide scoring in the existing batch permission helper. Explicit scopes describe narrower intended work. There is no separate assignment-to-session or assignment-to-minor-criterion record. Historical organizer judge invite/register/import wrappers remain in some files, but their old competition routes are not mounted; current Organizer selection does not create new judge accounts or credentials.

**IMPLEMENTATION MISMATCH.** The pool GET applies `profile_data.organizerIds` visibility, but the pick POST does not repeat that exact filter on supplied IDs. The live enforcement differences described in Judge Process also remain. These facts constrain what “assigned” means in the current system.

Evidence: [CompetitionJudgesPage.jsx](frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx), `handlePick`; [JudgeAssignmentPanel.jsx](frontend/src/components/organizer/competition/JudgeAssignmentPanel.jsx), `addAssignment`, `bulkAssignAll`; [competition.service.js](backend/src/services/competition.service.js), `getJudgePool`, `pickJudges`, `createJudgeAssignment`; [participant.service.js](backend/src/services/participant.service.js), `registerParticipant`; [041 migration](backend/src/database/migrations/041_unify_competition_judges.sql), [063 scope guard](backend/src/database/migrations/063_judge_assignment_scope_guard.sql).

## Competition Start / Session Process

After publishing setup, the Organizer opens Live Control and chooses **Start Live Session**. `performAction('start')` calls the session-start API. The backend verifies event ownership/type, rejects draft events or an already active session, and requires contestants, at least one active Judge enrollment, and criteria. It checks parent percentages against 100, using round membership when present or the flat event total otherwise. When rounds exist, it also requires some round-contestant membership. The preflight error refers to open rounds, but the query does not test the round's open flag.

The service attempts to update the event to active with scoring enabled, selects the first ordered round if any, builds the contestant order, and inserts an active `competition_sessions` row. It assigns the first available contestant as primary and stores the ordered IDs and start timestamp. The row is shared by the Organizer and all enrolled Judges. The response returns the session; the UI reloads it and the backend emits session-status events.

The planned event date/time remains stored, but the competition lifecycle scheduler follows active/paused/completed sessions. A published competition with no session stays scheduled, even after its planned end date. Active or paused session means the event remains active/scoring-enabled; a completed session without a live session means completed/scoring-disabled. The current live submission function does not independently reject scores based on the planned dates. The older batch endpoint does.

The Organizer can pause and resume. Pause stores paused status/time; resume uses a lookup including paused sessions and returns the session to active. Judge GET uses an active-only view, so a freshly loaded page while paused returns no active session. A Judge already connected may instead hold a paused state received through an event and display that message. These are different routes to the waiting screen.

During active operation, the Organizer can select a round or presentation division, set the contestant gate, and open parent criteria. The full contestant field remains available to the sheet, with `open=false` entries shown disabled. The contestant gate uses null for all-open and an empty array for none-open. The criterion gate uses an empty array for all-open, so closing the last remaining parent by storing an empty set actually restores all-open interpretation. Opening a parent exposes all its minor inputs; there is no independent live minor gate.

The Organizer can preview/publish contestant arrangements: default, primary division first, secondary first, or alternating divisions. Publishing updates `contestant_order` and arrangement metadata; it rejects a session that already has any score row. It does not reorder contestant identities or modify judge assignment rows. A standalone performance timer/countdown governing score deductions is **NOT FOUND IN REPOSITORY.** Background timers here synchronize lifecycle and waiting data.

**IMPLEMENTATION MISMATCH.** The session migration declares uniqueness on `(event_id,status)`, restricting more than just active rows. The UI offers **Start New Session**, but repeated completed-session history depends on this constraint, and the start function checks active sessions rather than both active and paused. Successful repeated-session behavior is **UNCONFIRMED — repository evidence is insufficient.**

Evidence: [CompetitionLiveControlPage.jsx](frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx), `performAction`, `NoSessionView`; [competition-session.service.js frontend](frontend/src/services/competition-session.service.js); [competition-session.service.js backend](backend/src/services/competition-session.service.js), `startSession`, `pauseSession`, `resumeSession`, `setActiveRound`, `setOpenContestants`, `setActiveCriteria`, `publishArrangement`; [event-schedule-sync.service.js](backend/src/services/event-schedule-sync.service.js); [023 migration](backend/src/database/migrations/023_competition_live_session.sql).

## Judge Scoring Process

The Judge opens the competition while the Organizer's session is active. `getJudgeSessionView` loads event information, the session field, its current-round criteria, the minor scoring targets, and this Judge's saved values/locks. When round criteria exist, they are used; when the loader finds no applicable criteria rows, it falls back to the event criteria. The page merges saved values into its local score map and shows the current round name.

The Judge works across the contestant rows/cards. For a selected row's available parent criterion, the Judge enters a numeric score in each minor input. The score input displays minimum and maximum bounds. Fixed ranges are 1–10, 1–100, or 0–10 for decimal; custom minors use their stored custom bounds. The component supplies a 0.5 input step, but server validation checks numeric bounds rather than requiring exact half-point increments. The authenticated account determines the Judge identity; the Judge does not submit a selectable Judge ID in this action.

The interface displays percentages and individual ranges and counts locked parents. A Judge-visible computed overall weighted total, final ranking, or editable deduction calculation in this scoring form is **NOT FOUND IN REPOSITORY.** Those calculations happen in backend ranking/tabulation operations. The numbers typed into the form remain local React state until the Judge explicitly presses **Lock**.

Each Lock control belongs to one parent criterion for one contestant. The form enables it only when all that parent's targets are filled and in range, and when the contestant and parent are open. Once clicked, the page revalidates the complete criterion and sends only those scores. A successful response is followed by a saved confirmation and a sheet reload; the parent displays Locked and its inputs are disabled. The status for the contestant shows partial lock count until all configured parents have been committed.

Before locking, the Judge can edit numbers freely. After locking, changing those parent scores requires the Organizer's explicit unlock operation. Unlock removes a parent lock or all parent locks for that contestant, optionally for one Judge, and records an audit. It retains existing saved values and ranking rows until the Judge changes and recommits them. A finalized round is separately rejected by the submit service, so unlocking alone does not override finalized-round protection.

Refreshing or leaving the page discards ordinary unsent React score edits. Returning reloads saved server values, not an autosaved normal Judge draft. An in-page refresh merges saved values over local state, preserving other unsaved keys where not returned. The key combines contestant and target ID, not round ID, so local state does not contain a separately namespaced score map for every round.

A network failure without an HTTP response adds the attempted submission to an event-keyed localStorage retry queue. Automatic retry occurs when the WebSocket is connected; a **Retry Now** control also retries. The queue contains contestant ID, scores and timestamp, but not the original Judge/session/round identity. Retry submits against the then-current authenticated account/session; successful removal filters by contestant ID. Auth-store draft cleanup does not remove that queue prefix. This retry mechanism is different from saving every typed score automatically.

Evidence: [JudgeScoringPage.jsx](frontend/src/pages/voter/JudgeScoringPage.jsx), `scoresFromSheet`, `onScoreChange`, `buildCriterionPayload`, `submitCriterion`, retry functions; [CompetitionScoringForm.jsx](frontend/src/components/voter/competition/CompetitionScoringForm.jsx), `CritLock`, `RowStatus`, `ScoreInputComponent`; [ScoreInput.jsx](frontend/src/components/ui/ScoreInput.jsx); [competition-session.service.js](backend/src/services/competition-session.service.js), `getJudgeSessionView`, `unlockSessionScore`; [draftStorage.js](frontend/src/utils/draftStorage.js).

## Score Submission Process

### From the Lock click to persistence

When the Judge presses Lock, `submitCriterion(contestantId,criterionId)` calls `buildCriterionPayload`. It finds the parent, checks open state and requires a valid number for every minor. The page sets a busy key for that contestant/parent and calls `pageantService.submitSessionScore(eventId,scoreMap,contestantId)`.

The request is POST `/api/participant/competition/events/:eventId/session-score`, with the payload below. The event ID comes from the route. The Judge's user ID comes from authentication, and session/round context comes from the backend's active session, not from this payload.

```json
{
  "contestantId": "contestant UUID",
  "scores": {
    "minor criterion UUID": 8.5,
    "another minor criterion UUID": 91
  }
}
```

The example demonstrates the payload shape and mixed scales; its identifiers/values are illustrative. When a parent has no minors, its own UUID is the key instead.

The route applies participant authentication/account/password checks, `COMPETITION_JUDGE` event enrollment, archived-operation guard and score rate limit. `competition-session.controller.submitJudgeSessionScore` passes the current event, authenticated Judge and body to the service. That service confirms active session and primary contestant presence, target membership in the session field, contestant gate, and absence of round finalization.

It reads this Judge's prior score row for the session/round/contestant. It loads the round's parents, including currently closed parents for completion accounting. Among the open, unlocked parents, it selects those whose targets are all present. It rejects a request with no complete available parent or one where all open parents are already locked. It validates numeric values and bounds, merges accepted values with the prior JSON map, and unions submitted parent IDs into `locked_criteria`.

The service inserts a new `competition_session_judge_scores` row or updates the existing row. `is_locked=true` means every scope parent is locked, including parents not currently open; `locked_at` is only set when full completion is reached. Thus partially submitted parent scores are already saved even when the entire contestant row is not yet fully locked.

Next, `bridgeSessionScoresToRankingStore` resolves target minors to their parents, deletes old flattened cells for the same Judge/contestant/parent/round, and inserts the newly committed values into `competition_scores`. It mirrors only submitted parents so previous committed parents remain. The service records an audit and emits an Organizer progress event. The response includes success, `locked`, `lockedCriteria` and a message. The frontend shows confirmation and GETs the sheet again to display server lock state.

**IMPLEMENTATION MISMATCH.** JSON persistence and ranking-store delete/insert are separate operations. A failure during the mirror can leave the JSON row saved and locked even though the request returns an error. The service does not roll that saved JSON row back. Completion/resync backfill later reads only fully locked JSON rows; partial rows are not included in that backfill. The document does not describe these writes as one atomic submission transaction.

### Entered, submitted, fully locked, and official are different states

A number entered into a React input is unsaved local data. A completed parent committed through Lock is saved and parent-locked. A contestant's Judge row becomes fully locked only after every required scope parent has been locked. A ranking can already use flattened partial submissions before full completion. An official result exists only after the separate calculated snapshot has been finalized and published. There is no single flag meaning all four of these states.

The current live path does not update `event_participants.has_scored`. The older batch POST `/score` does: it requires a complete contestant-by-parent array, checks assignment/schedule rules, claims that event-wide flag and inserts flat scores once. That endpoint remains mounted, but it is not the current Judge page's Lock workflow. A global Judge completion count based solely on `has_scored` may therefore differ from live row-lock progress.

Evidence: [pageant.service.js frontend](frontend/src/services/pageant.service.js), `submitSessionScore`, `submitScores`; [pageant-judge.routes.js](backend/src/routes/pageant-judge.routes.js); [competition-session.controller.js](backend/src/controllers/competition-session.controller.js); [competition-session.service.js](backend/src/services/competition-session.service.js), `submitJudgeSessionScore`, `bridgeSessionScoresToRankingStore`; [pageant.service.js backend](backend/src/services/pageant.service.js), `submitJudgeScores`.

## Score Data Connections

A saved live score is not a linear chain of separate “Judge Assignment → Stage → Score → Submission” objects. It is a session score row whose foreign-key fields identify several existing entities, with numeric targets stored in JSON. The separate assignment record is not referenced by an assignment ID on that score row.

`competition_session_judge_scores.session_id` identifies the shared session, `event_id` identifies the competition, and `round_id` identifies the round when configured. `judge_id` points to the account in `users`; `participant_id` points to that account's event enrollment. `contestant_id` points to the Organizer-created competitor. The `scores` keys normally identify minor criteria, which themselves point to parent criteria through `criteria_id`. `locked_criteria` contains parent IDs, because Lock commits the whole parent for that contestant.

The ranking-store row carries `judge_id`, `participant_id`, `contestant_id`, `criteria_id`, `minor_criteria_id`, optional `round_id`, `category_id`, `division_id`, and numeric `score`. A nullable `event_id` column is added by schema reconciliation, but the current mirror insert omits it and rankings recover event context through contestants. There is no `session_id` column on this flat record. Mirroring therefore does not preserve an independent flat row history for each session when the same Judge/contestant/parent/round cells are reused.

Migration 064 triggers derive participant IDs on inserts from the supplied user/event or contestant context; migration 065 requires those participant IDs after safety checks. The current service can omit the participant field because those schema definitions supply it. Whether all these migrations/triggers exist in a deployed database is **UNCONFIRMED — repository evidence is insufficient.**

Session-row uniqueness is declared across Judge/session/round/contestant; flat uniqueness spans Judge/contestant/parent/minor/round. Several round/minor links are nullable. JSON queries use an equality operation even for null current round, while the flat mirror explicitly performs a null-aware delete. The successful no-round deployed query behavior is **UNCONFIRMED — repository evidence is insufficient.**

Evidence: [competition-session.service.js](backend/src/services/competition-session.service.js), mirror/submission functions; [061 participant columns](backend/src/database/migrations/061_add_participant_id_to_ballots.sql), [062 participant FKs](backend/src/database/migrations/062_validate_participant_id_fks.sql), [064 triggers](backend/src/database/migrations/064_autofill_participant_id.sql), [065 constraints](backend/src/database/migrations/065_participant_id_not_null.sql), [071 minors](backend/src/database/migrations/071_minor_criteria.sql), [073 locks](backend/src/database/migrations/073_session_locked_criteria.sql).

## Multiple Competition Types

### Multi-round pageant or other segmented competition

The type catalog and setup hints include Pageant, with Talent, Evening Gown, and Q&A examples. The Organizer can create those or differently named rounds, give each parent/minor criteria, assign contestants, and set round weights. A fixed mandatory Introduction → Talent → Evening Wear → Q&A workflow is **NOT FOUND IN REPOSITORY.** The labels are examples; the saved rounds determine the actual structure.

The session stores one current round at a time. Selecting another round changes the scope loaded for scoring and the per-round context saved with submissions. When round-to-criterion memberships exist, the engine separates cells by round, calculates each segment, and combines segment values using weights. A criterion reused in several rounds is not meant to merge those round cells into one result; exact-round grouping handles that.

For advancement, the Organizer can preview standings, review qualifiers, adjust selections and finalize. Top-N/top-percent include tied contestants at the cutoff, and threshold uses the current round's own score. Division competitions select qualifiers per division. Finalization stores `competition_round_results` and attempts to seed the next higher-ordered round's membership. This does not activate the next round; the Organizer separately changes session selection.

Independent policy uses only the round score for advancement. Cumulative policy adds prior finalized round snapshot scores to that standing. Overall weighted ranking remains a separate combination of rounds; it does not automatically reapply cumulative advancement to every overall contribution. If earlier snapshots already contain accumulated values, the current cumulative code adds those saved values as they stand rather than extracting only incremental contributions.

The round-order, live-field membership and published round-update mismatches described earlier remain relevant. They mean the existence of multi-round records is confirmed, while every UI path for closing and advancing them cannot be assumed successful.

Evidence: [competition-templates.js](backend/src/modules/competition-templates.js), [CompetitionWorkspacePage.jsx](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx), `TYPE_HINTS`, `RoundAssignmentPanel`; [competition-session.service.js](backend/src/services/competition-session.service.js), `computeRoundStanding`, `computeRoundAdvancement`, `finalizeRound`; [advancement.js](backend/src/modules/advancement.js).

### Single-performance or flat competition

The same structure supports configuring an event without explicit rounds. The Simple hint describes contestants plus criteria; Singing and Talent hints allow flat criteria unless heats/finals are needed. Dance can use divisions/rounds, but the label does not require them. The Organizer can also use a custom label for choir, drawing, or visual arts; distinct named implementations for each of those examples are **NOT FOUND IN REPOSITORY.**

In flat configuration, parent criteria belong to the event, and a live session has no current round ID. Judges work against the event-wide field/criteria using the same inputs and parent Lock actions. The engine treats missing explicit rounds as an implicit Overall round with weight 100. Alternatively, an Organizer can create one explicit round of weight 100 and connect the field/criteria to it; that uses the ordinary round-aware model. The application does not create a separate performance record for each contestant or enforce one contestant performance per session.

All criteria being scored in one shared session is a configuration possibility; the Organizer can still control when contestants/parents open. It is not a separate scoring mode with a different submission endpoint. **IMPLEMENTATION INCOMPLETE / PARTIALLY IMPLEMENTED.** No-round support is present in configuration, criteria loading, and engine fallbacks, while the session-score equality/uniqueness operations retain nullable-round behavior whose successful deployed outcome is unconfirmed.

Evidence: [CompetitionWorkspacePage.jsx](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx), flat hints; [competition-session.service.js](backend/src/services/competition-session.service.js), `startSession`, `loadActiveScoringCriteria`, submission queries; [scoring-engine.js](backend/src/modules/scoring-engine.js), implicit Overall path.

## Monitoring and Round Finalization Process

As Judges lock criteria, Live Control can reload a Judge-by-contestant progress grid. `getJudgeProgress` selects active enrolled Judges, loads their assignments and filters them using the current round/division and role helper. It loads score rows including partial rows, then returns locked-parent IDs/counts and fully locked submissions. The Organizer sees completion at the contestant/criterion level rather than only a count of submitted event-wide Judge flags.

The Organizer can explicitly unlock a criterion or contestant row for one/all Judges. The service records who reopened it and emits a refresh signal. This is a correction step controlled by the Organizer; it does not create a new session or contestant. Score editing continues through the Judge's normal Lock submission afterward.

For a round, **Finalize round & advance** opens a read-only preview and permits qualifier overrides. Confirmation calls `finalizeRound`. The service requires the round to be closed and normally not previously finalized; it rejects empty standings. It first claims an unfinalized round by writing the timestamp conditionally, stores standing/rank/qualified rows, and seeds qualifier IDs into the next higher-ordered round. These writes use compensation on failure rather than a single encompassing transaction. Existing next-round memberships are not removed by seeding, and the session's active round is not switched automatically.

A recompute/force path can refresh an existing standing, retaining its original finalized timestamp and first backfilling fully locked live scores. Round finalization does not require every Judge to have completed every cell. The source computes from the available ranking-store data, which can produce zero values for missing cells. Its error text “no scored contestants” should not be read as a separate all-Judges-complete assertion.

The open/close control's draft/name restrictions and default order issue are **IMPLEMENTATION MISMATCH.** They constrain the user progression despite the implemented preview/finalization service.

Evidence: [CompetitionLiveControlPage.jsx](frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx), `refreshJudgeProgress`, `openFinalize`, `confirmFinalize`; [competition-session.service.js](backend/src/services/competition-session.service.js), `getJudgeProgress`, `unlockSessionScore`, `previewRoundAdvancement`, `finalizeRound`; [058 result schema](backend/src/database/migrations/058_round_advancement.sql).

## Tabulation Process

### When calculation happens

Submitted values are available for live ranking once they reach `competition_scores`. A ranking GET calls the backend engine on the current stored scores. It is not an automatic creation of an official result record on every Lock. The live Lock service emits an Organizer progress event but does not emit a freshly calculated ranking payload on every submit.

For a reviewable official calculation, the Organizer opens Tabulation. The page loads contestants, active deductions, and the latest stored calculation. The Organizer selects Weighted average, Average, Sum, Highest score, Lowest-score removal, or Rank-based and presses **Calculate**. The backend loads live rankings for the selected method, applies active deductions, and inserts `competition_result_calculations` with calculated status, configuration snapshot and result snapshot. It does not wait for an automatic “all Judges finished” trigger, require an ended session, or assert every expected score is present.

The snapshot records the selected method, scoring rules, selected round/division where supplied, weight totals, Judge count summary and deduction authority. Its table has a session field, but the current calculation insert does not populate it. The page sends an event calculation without selecting a session. Changing scores or deductions later does not silently rewrite the saved result snapshot; another Calculate creates another snapshot.

Evidence: [CompetitionTabulationPage.jsx](frontend/src/pages/organizer/competition/CompetitionTabulationPage.jsx), `load`, `calculate`; [competition-tabulation.service.js frontend](frontend/src/services/competition-tabulation.service.js); [competition-tabulation.service.js backend](backend/src/services/competition-tabulation.service.js), `calculateResults`; [082 schema](backend/src/database/migrations/082_competition_result_calculations.sql).

### How multiple Judges and scoring levels combine

`getLiveRankings` reads flat score rows, retains those associated with the event's selected contestant field, adds criteria/minor and round membership information, and calls `computeRankings`. For an ordinary method, the engine first reduces Judge scores for each minor. Weighted average and average take the arithmetic mean of present values; sum adds them; highest score takes the maximum; lowest removal sorts and drops configured high/low entries before averaging what remains. Removal counts are clamped so a nonempty list retains at least one value.

Missing Judge submissions are not automatically inserted as zeros into a present cell's averaging denominator. However, a minor with no scores reduces to zero, and that minor remains part of its parent's equal-minor average. This distinction determines how partially filled competitions appear in live calculations. No separate quorum/complete-panel validation is imposed by the calculation function.

The following formulas describe the actual ordinary numeric path. `R` means the selected Judge-score reduction; `P` is the sum of parent percentages linked to the current round, with the code's 100 fallback when that sum is zero.

```text
MinorPercent = R(submitted minor scores) / minor maximum * 100
ParentValue = mean(configured MinorPercent values)
ScopedRoundValue = sum(ParentValue * parent percentage / P)

Without categories:
  EventFinal = sum(RoundValue * round weight / 100)

With categories:
  CategoryValue = sum(its RoundValue * round weight / 100)
  EventFinal = sum(CategoryValue * category weight / 100)
               + sum(uncategorized RoundValue * round weight / 100)
```

A parent without minors reduces direct parent scores instead. Scoped mode is used when rounds and a nonempty criterion-membership map are supplied. It applies within-round parent percentages for the ordinary reduction methods. If a criterion belongs to only one round and its exact-round bucket is empty, the engine uses a round-agnostic fallback bucket; that bucket contains available cells across round IDs, not exclusively null-round cells.

Legacy flat mode ignores round IDs and reuses the same parent pool across explicit rounds when no membership map exists. Weighted average applies normalized parent percentages; other ordinary methods average parent values equally at that stage. A no-round event gets one implicit Overall round. With repeated flat explicit rounds and no categories, final round weights are normalized by their sum; scoped/category formulas use the stored weights. Precision rounding occurs at intermediate/public stages, with zero through six configured places.

Evidence: [pageant.service.js](backend/src/services/pageant.service.js), `getLiveRankings`; [scoring-engine.js](backend/src/modules/scoring-engine.js), `reduceScores`, `computeLegacyPerRound`, `computeScopedPerRound`, `combineRoundsToFinal`, `computeRankings`.

### Recording and applying deductions

The Organizer selects a contestant, enters a positive deduction amount and reason, and presses Apply. The service validates that the contestant belongs to the event, the amount is finite and greater than zero, and the reason is not blank. It inserts `competition_deductions`, identifies the applying user and authority, and records audit/activity. The normal default authority is Organizer; the service accepts Organizer or both authority configurations. A Judge deduction-submission endpoint is **NOT FOUND IN REPOSITORY.**

Void marks an active deduction voided with user/time, preserving its historical record. Calculate obtains active deductions only. Ordinary numeric results subtract deduction totals from base score and are reranked descending. There is no zero floor. With a round filter, deductions for other nonnull rounds are excluded while event-wide null-round deductions still apply. Without a round filter, all active event deductions are included. A stored deduction session ID does not act as a calculation filter.

The pure helper has an alternate placement path that adds deductions to placement totals and sorts ascending. **IMPLEMENTATION INCOMPLETE / PARTIALLY IMPLEMENTED.** The rank-based engine returns a different row shape from the ordinary engine, while `getLiveRankings`' public mapping assumes `perCriterion`/`perRound` and omits placement totals. Selecting Rank-based is supported by the enums/UI, but a complete successful current calculation through that mapper is not established. The placement deduction helper does not by itself prove that end-to-end path works.

Evidence: [CompetitionTabulationPage.jsx](frontend/src/pages/organizer/competition/CompetitionTabulationPage.jsx), `addDeduction`, `voidDeduction`; [competition-tabulation.service.js](backend/src/services/competition-tabulation.service.js), deduction functions; [tabulation.js](backend/src/modules/tabulation.js), `applyDeductionsToRankings`; [081 schema](backend/src/database/migrations/081_competition_deductions.sql).

## Ranking Process

For ordinary numeric scores, the engine sorts final rounded values from highest to lowest and assigns standard competition ranks. If two contestants tie for second, their ranks are 2 and 2 and the next ordinal rank is 4. Equal final values alone produce tied ranks unless the optional highest-criterion tie breaker is configured. That tie breaker compares the best parent average among tied contestants; a shared final and shared tie key remain tied. Tie-breaking logic is therefore present, although the current workspace does not expose its selector.

When a round view is requested, the service uses that round's calculated value as `rankingScore`, sorts by it and reranks, while retaining overall final score for reference. Division requests filter contestants and configuration entities to the selected division plus null event-wide records, and score rows to selected/null division context. This is a scoped read, not a different contestant or score submission.

The rank-based engine, considered on its own, converts each Judge's weighted numeric results to placements, sums placements, and uses a lower placement total as better standing. It uses a negative internal value to participate in descending sorting, with additional average placement/raw-score comparisons. The public mapper incompatibility described in Tabulation is **IMPLEMENTATION MISMATCH.** This document does not treat the presence of the method as proof a working Judge-to-report rank-based journey.

Deductions rerank calculated snapshot rows using their resulting final values. The deduction helper's ties compare only that resulting value; it does not reapply the engine's highest-criterion tie breaker. Round-advancement standing also has its own final score sort/rank function. Thus live ranking, advancement ranking and deduction-adjusted snapshot ranking are related calculations, not one shared ranking table updated by every operation.

The public ranking row includes contestant identity, photo/number, rank, final/weighted/ranking scores, and breakdowns. Its “Awaiting scores,” “Partially scored,” and “Fully scored” states come from criterion score-presence counts; they do not certify that every enrolled Judge submitted every minor. Submitted Judge count in live rankings is the number of distinct Judge user IDs with flat score rows.

**IMPLEMENTATION MISMATCH.** Ordinary engine result skeletons do not retain each contestant's division ID, so an unfiltered public row can have null division identity despite the contestant's saved division. Published snapshot division grouping depends on those mapped values. This differs from the live division-query path and can affect later official division results.

Evidence: [scoring-engine.js](backend/src/modules/scoring-engine.js), `assignRanks`, `computeRankings`; [pageant.service.js](backend/src/services/pageant.service.js), `getLiveRankings`, `getOfficialRankings`; [tabulation.js](backend/src/modules/tabulation.js); [CompetitionRankingsPage.jsx](frontend/src/pages/organizer/competition/CompetitionRankingsPage.jsx).

## Results Process

### Reviewing, finalizing, and publishing official results

Calculate displays its saved preview in Tabulation, including ranks, base scores, deductions, final values and Judge submission summary. The Organizer chooses **Finalize results** to transition a calculated snapshot to finalized. The backend requires that prior state and records finalizer/time/audit; it does not rerun the scoring formula at this click.

The Organizer then chooses **Publish results**. The service accepts only a finalized snapshot, changes it to published, and records publisher/time/audit. The original event ID stays on the calculation, and its result JSON retains contestant IDs/values. Calculation status is distinct from event status and round finalization. Publishing one calculation does not mark older publications superseded, even though the schema includes that possible status.

The event-wide official lookup selects the latest published calculation by publish time with null round ID. A nonempty published snapshot becomes authoritative for official ranking/results. A merely calculated or finalized snapshot is not used as published official data. A round-filtered ranking continues to use the live round calculation rather than substituting an event-wide publication.

**IMPLEMENTATION MISMATCH.** Ending the session marks the event completed, and the route guard blocks later POSTs to deductions/tabulation outside the session exemption. Therefore successful finalization/publication after End Session is not established by the current UI order. Publishing a calculation does not itself emit a fresh rankings event, so another fetch is needed for other views to see it.

Evidence: [competition-tabulation.service.js](backend/src/services/competition-tabulation.service.js), `finalizeCalculation`, `publishCalculation`; [pageant.service.js](backend/src/services/pageant.service.js), `getPublishedCalculation`, `getOfficialRankings`; [eventGuards.js](backend/src/middleware/eventGuards.js); [pageant-organizer.routes.js](backend/src/routes/pageant-organizer.routes.js).

### Viewing results and producing reports

The Organizer opens Rankings and can search contestants, choose a division or round, and refresh. The heading distinguishes official rankings from live preview. Rows show visible ranks, contestant names/numbers/photos, scores and breakdowns. `getCompetitionResults` separately supplies overall standing, first-row champion, division results, derived category leaders, and finalized round snapshots. If no nonempty published event snapshot exists, these results fall back to live ranking data.

Opening Rankings is not only a read operation in the application: once per mount, the page attempts a score-store resync POST from fully locked session rows, then fetches rankings/foundation/results. The analysis did not run that page. On realtime updates, filtered views refetch; an unfiltered view accepts a supplied ranking payload, but a payload-free update alone does not trigger its reload.

The Organizer's report screen loads the competition report through analytics providers and refreshes on its configured polling interval. Reports combine event details, turnout, rankings, round results, division results, category awards and official publication metadata. Frontend buttons generate CSV, JSON and SpreadsheetML `.xls`, while the PDF action opens print-styled HTML for the browser's Save as PDF workflow. Backend report export endpoints separately support CSV or JSON.

Judges have the participant scoring page and their current saved scores/locks. A separate Judge results/publication screen or contestant self-service result/login screen is **NOT FOUND IN REPOSITORY.** Competition contestants are records, not a distinct authenticated role. Once no active session is returned, a freshly loaded Judge page waits rather than loading completed historical sessions as a results page.

Category awards are calculated leaders from score breakdowns. Custom award tables were introduced historically and dropped by migration 068; current derived category leaders do not imply that those former custom award tables are still the writable result model.

Evidence: [CompetitionRankingsPage.jsx](frontend/src/pages/organizer/competition/CompetitionRankingsPage.jsx), `load`, resync effect; [pageant.service.js](backend/src/services/pageant.service.js), `getCompetitionResults`; [CompetitionReportPage.jsx](frontend/src/pages/organizer/reports/CompetitionReportPage.jsx); [reports.service.js](backend/src/services/reports.service.js), `getCompetitionReport`; [reports-organizer.controller.js](backend/src/controllers/reports-organizer.controller.js); [exportReport.js](frontend/src/utils/exportReport.js); [068 migration](backend/src/database/migrations/068_remove_competition_awards.sql).

### Ending and retaining the event

The Organizer's **End Session** calls `completeSession`, which marks the live or paused session completed and writes its completion time. It attempts to set the event completed and scoring disabled, sends lifecycle events, and performs best-effort flat-store backfill/ranking updates. It does not enforce all Judge/contestant/criterion locks complete and does not create an official publication snapshot automatically.

Historical Organizer GETs remain available for results/reports. Optional archival policy later marks completed events archived based on their stored end date and configured age; the default policy is disabled. Admin restoration sets an archived event back to completed. Archival is a lifecycle change, not deletion of the original competition scores and snapshots.

Evidence: [competition-session.service.js](backend/src/services/competition-session.service.js), `completeSession`, `backfillLiveScoresToRankingStore`; [archival.service.js](backend/src/services/archival.service.js), `runArchivalNow`, `restoreArchivedEvent`; [ArchivalPolicyPage.jsx](frontend/src/pages/admin/ArchivalPolicyPage.jsx).

## Complete Role-Based Process

### Administrator

The Administrator signs in and manages accounts in User Management. For an Organizer, the Administrator supplies email, Organizer name/position, organization name/type, and access scope. The registration service validates profile/scope and creates the account with a temporary password/email process. The Administrator can create participant accounts and add their voter/respondent/judge memberships, preview/import supported files, maintain student taxonomy, change account status, and edit Judge professional/Organizer-association data.

These administrative pools become the Organizer's source of eligible event participants. The Administrator does not normally configure another Organizer's competition rounds through a parallel admin scoring wizard. Global Events, dashboards, audits, health, search, notifications/alerts, system settings, session revocation and archival controls provide management/oversight. The domain's competition setup, live scoring and tabulation are performed through Organizer/Judge paths. Administrator status management and session revocation can affect whether those users can authenticate or access their operations.

Evidence: [UserManagementPage.jsx](frontend/src/pages/admin/UserManagementPage.jsx), [CreateOrganizerModal.jsx](frontend/src/components/admin/CreateOrganizerModal.jsx), [admin.routes.js](backend/src/routes/admin.routes.js), [admin-organizer.service.js](backend/src/services/admin-organizer.service.js), [admin-participant.service.js](backend/src/services/admin-participant.service.js), [session.service.js](backend/src/services/session.service.js).

### Organizer

The Organizer signs in and opens the relevant event module. For a competition, the Organizer enters details, saves branding/draft data, creates the event and receives its identifier. The Organizer defines optional rounds/divisions, parent/minor criteria and combination settings, adds contestants and round memberships, selects existing Judges and records scope assignments. Review & Publish releases setup; Live Control separately starts and controls the shared session.

During scoring, the Organizer monitors locks/progress, gates contestants/criteria, changes round/presentation context and reopens scores where allowed. Round preview/finalization can record advancement decisions, subject to the documented control/order mismatches. Tabulation calculates and stores a review snapshot, then offers finalize and publish. Rankings, analytics and reports explain the scores and publication status. Ending the session and publishing results are independent actions with the terminal-route boundary described earlier; the narrative does not assume that completion silently performs publication.

Evidence: the Organizer competition pages under [frontend/src/pages/organizer/competition](frontend/src/pages/organizer/competition), plus [pageant.service.js](backend/src/services/pageant.service.js), [competition.service.js](backend/src/services/competition.service.js), [competition-session.service.js](backend/src/services/competition-session.service.js), [competition-tabulation.service.js](backend/src/services/competition-tabulation.service.js).

### Judge

The Judge's journey starts with an Administrator-provided participant identity and judge membership, followed by Organizer event enrollment. The Judge signs in, resolves any first-login password state, and sees assigned/enrolled events through the participant dashboard or direct eligible destination. Opening a competition retrieves the current session view; the Judge waits if no active session is available.

During active scoring, the Judge enters values for each available minor and locks one completed parent for a contestant. The server ties the committed data to the authenticated Judge, current session/round, contestant and criteria. Saved values reload as locked, and the Judge continues with other available parents/contestants. Unsent edits have different persistence behavior from queued failed submissions. A correction requires Organizer unlocking, and session pause/finalization/completion limits new submissions. There is no separate final assignment-completion action on this live page; full-row locks and Organizer monitoring represent scoring progress.

Evidence: [VoterDashboardPage.jsx](frontend/src/pages/voter/VoterDashboardPage.jsx), [JudgeScoringPage.jsx](frontend/src/pages/voter/JudgeScoringPage.jsx), [CompetitionScoringForm.jsx](frontend/src/components/voter/competition/CompetitionScoringForm.jsx), [pageant-judge.routes.js](backend/src/routes/pageant-judge.routes.js).

### Other users

Election Voters and Polling Respondents are event types of participant, not separate global role systems. The same account can have appropriate global pool memberships and participate in distinct events. An Election Voter opens a ballot, chooses candidates, reviews and submits the current eligible ballot group. A Polling Respondent opens an available poll, answers questions, and submits a response; repeated responses depend on that event's multiple-submission flag.

Legacy global role `voter` is accepted for compatibility while current code uses `participant`. A separate authenticated competition-contestant role, public competition spectator results process, or dedicated head-Judge application is **NOT FOUND IN REPOSITORY.** Event judge roles `judge`, `head_judge`, and `score_reviewer` exist as metadata/permission inputs, with the live enforcement limits already described.

Evidence: [constants.js](backend/src/utils/constants.js), [participant.service.js](backend/src/services/participant.service.js), [voter.routes.js](backend/src/routes/voter.routes.js), [VoterEventPage.jsx](frontend/src/pages/voter/VoterEventPage.jsx), [VoterPollPage.jsx](frontend/src/pages/voter/VoterPollPage.jsx).

## Complete VOTRIX End-to-End Process

The complete competition process begins when the Administrator prepares access. The Administrator records the Organizer's organization/profile/scope information and makes Judge accounts eligible through participant-type memberships. New-account credentials are delivered through the account-email operation where configured. Those accounts remain independent of event enrollment: the Organizer still decides which eligible Judges join each competition.

The Organizer signs in and reaches Competition Scoring Events. The Organizer starts a new competition, supplies the actual fields offered by Details, and moves to Branding. The system may save a partial create draft while this happens. After the Organizer chooses Create & continue, the backend materializes an event row and returns its UUID. The frontend opens Structure & Scoring with that UUID in the route, making it the common identifier for subsequent setup.

The Organizer then describes how this competition is evaluated. If it has several segments, the Organizer creates rounds and links parent criteria and contestants through membership records. If it is a flat single-performance format, criteria and contestants can remain event-wide. The optional type label provides hints but does not generate the configuration. Parent percentage weights and minor scoring scales determine the input cells and their later contribution; the Scoring rules screen saves supported precision/removal settings. Division/category structures are optional and have separate relationships rather than forming a mandatory hierarchy.

The Organizer adds each contestant's name, number, optional division and photo. The saved contestant UUID is used by round memberships and future score rows. Next the Organizer adds existing Judge-pool accounts to the event and optionally asks for invitation emails. The resulting event participant UUID connects the Judge account to that competition. Scope assignments reference the participant UUID and event/round/category/division target, although the live submit service does not enforce every scope restriction used in other paths.

Review & Publish checks the presence of contestants, criteria and Judges and releases the event from draft to scheduled. Setup editing changes accordingly. The Organizer moves to Live Control and explicitly starts a session. The backend checks start prerequisites, creates the shared active session and current scoring context, and attempts to update the event's active/scoring state. The scheduler thereafter follows live session state for competition lifecycle. No Judge creates this session by merely logging in.

An enrolled Judge signs in and opens the event from the participant destination. The scoring page requests the current session and relevant field/criteria, along with that Judge's already saved values and locks. The Organizer's gates determine which returned entries can be edited. The Judge enters valid values and locks a complete parent for one contestant. The backend validates that live context, merges its JSON score row and locks, and mirrors numeric target rows into the ranking store. A saved response and sheet reload turn the parent read-only; Organizer progress can update.

This cycle repeats across the open parents and contestants. Missing cells remain incomplete; they are not automatically submitted by leaving the page. A refresh restores server submissions, while a failed network attempt has a separate local retry queue. If a correction is required, the Organizer can remove locks and let the Judge submit revised values. The Organizer may pause/resume or change round context. Round-finalization logic can compute standings/qualifiers and save progression snapshots, but successful progression depends on the documented round-control and stored-order boundaries.

The system can compute live rankings from the numeric ranking-store rows before everyone is complete. It reduces Judge values, normalizes minor scales, averages minors within parents, applies the applicable parent/round/category weights and rounds calculated values. An official calculation is a separate Organizer action in Tabulation. The Organizer records official deductions if needed, chooses a method, and calculates a snapshot. The snapshot is reviewed, finalized and published through separate requests; publication is not inferred merely from completed scoring.

Official event results then come from the latest nonempty published event-wide snapshot. Without that publication, the Organizer's results/report services use live calculations. Rankings expose ordering and ties; reports add turnout, round/division standing and exports. The Organizer may end the live session, which completes session/event state and attempts score reconciliation, but that does not publish a result. The current terminal guard prevents later tabulation mutations after completion, so this end-to-end account explicitly includes that mismatch instead of asserting the sidebar's final steps always execute successfully.

The original event identifier remains the connection from account-owned setup through contestant and Judge enrollment, current-session context, score records and publication snapshots. Reports and historical reads use those relationships to explain the same competition afterward. Optional policy archival changes its lifecycle state while retaining history. The result is a connected account-to-event-to-score-to-result process, with the implementation's present limits recorded rather than replaced by an idealized workflow.

## Frontend → Backend → Database Connections

This section provides the technical chain behind each major user activity. All competition Organizer event-relative paths below use `/api/organizer/competition/events/:eventId`. The backend accesses PostgreSQL through its Supabase service client; migrations declare the tables/relationships, but deployed migration state is unconfirmed.

### 1. Creating an event

The Organizer's **Create & continue** click runs `CompetitionEventFormPage.handleNextBranding` and then `handleContinueToContestants`. `draftService.publishDraft` POSTs the event details to `/api/organizer/competition/drafts/publish`. `draft.controller.publishDraft('competition')` uses `validateCompetitionEvent(body,true)`, then `draft.service.publishDraft` calls `pageant.service.createCompetitionEvent`. The database inserts `events`, cleanup can remove `event_drafts`, and the controller returns HTTP 201 `{success,event}`. The event ID becomes the workspace URL and the key for all subsequent setup requests.

Files: [CompetitionEventFormPage.jsx](frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx), [draft.service.js frontend](frontend/src/services/draft.service.js), [draft.controller.js](backend/src/controllers/draft.controller.js), [competition.validator.js](backend/src/validators/competition.validator.js), [draft.service.js backend](backend/src/services/draft.service.js), [pageant.service.js](backend/src/services/pageant.service.js), [001 event schema](backend/src/database/migrations/001_initial_schema.sql), [034 draft schema](backend/src/database/migrations/034_event_drafts.sql).

### 2. Creating a round

The Organizer submits `RoundsTab` in `CompetitionWorkspacePage`; its local `submit` sends name, weight and optional category/division through `pageantService.createRound`. POST event `/rounds` runs `competition.controller.createRound`, `validateRound`, and `competition.service.createRound`. It INSERTs `competition_rounds` with event and optional scope references, returns HTTP 201 `{success,round}`, and reloads foundation. The returned round UUID is used for criterion/contestant memberships and later session selection.

Files: [CompetitionWorkspacePage.jsx](frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx), [pageant.service.js frontend](frontend/src/services/pageant.service.js), [competition-organizer.routes.js](backend/src/routes/competition-organizer.routes.js), [competition.controller.js](backend/src/controllers/competition.controller.js), [competition.validator.js](backend/src/validators/competition.validator.js), [competition.service.js](backend/src/services/competition.service.js), [015 schema](backend/src/database/migrations/015_competition_scoring_foundation.sql).

### 3. Creating criteria and minors

The Organizer's `CriteriaManager.handleCreate` calls `pageantService.createCriteria` at POST event `/criteria`. The pageant organizer controller validates and calls `pageant.service.createCriteria`, inserting `competition_criteria` and returning `{success,criteria}`. If a round is selected, `addRoundCriteria` separately POSTs `/rounds/:roundId/criteria/:criteriaId` to create the membership. `MinorCriteriaManager.add` then POSTs `/criteria/:criteriaId/minor-criteria`; the minor validator/service inserts `competition_minor_criteria` and returns `{success,minorCriteria}`. Reloaded foundation supplies these saved targets to the later Judge session sheet.

Files: [CriteriaManager.jsx](frontend/src/components/organizer/competition/CriteriaManager.jsx), [pageant.service.js frontend](frontend/src/services/pageant.service.js), [pageant-organizer.routes.js](backend/src/routes/pageant-organizer.routes.js), [pageant-organizer.controller.js](backend/src/controllers/pageant-organizer.controller.js), [competition.validator.js](backend/src/validators/competition.validator.js), [pageant.service.js backend](backend/src/services/pageant.service.js), [competition.service.js](backend/src/services/competition.service.js), [071 schema](backend/src/database/migrations/071_minor_criteria.sql).

### 4. Adding contestants

The Organizer's **Add contestant** runs `CompetitionContestantsPage.handleCreate`, which calls `pageantService.createContestant` with name/number/division. POST event `/contestants` uses `validateContestant` and `pageant.service.createContestant` to INSERT `competition_contestants`, returning HTTP 201 `{success,contestant}`. Optional photo upload is a second POST `/contestants/:contestantId/photo` and updates photo/asset references. Round assignment separately inserts/deletes `competition_round_contestants`. The session later SELECTs these contestants by stored order and returns their display information to Judges.

Files: [CompetitionContestantsPage.jsx](frontend/src/pages/organizer/competition/CompetitionContestantsPage.jsx), [pageant-organizer.controller.js](backend/src/controllers/pageant-organizer.controller.js), [pageant.service.js](backend/src/services/pageant.service.js), [competition.service.js](backend/src/services/competition.service.js), [upload.service.js](backend/src/services/upload.service.js), [039 uniqueness](backend/src/database/migrations/039_per_division_contestant_number.sql).

### 5. Enrolling and assigning Judges

The Organizer's **Add judges** runs `CompetitionJudgesPage.handlePick` and POST event `/judges-v2/pick`. `competition.controller.pickJudges` delegates to `competition.service.pickJudges`, which verifies pool eligibility and calls `participant.service.registerParticipant`. That operation UPSERTs `event_participants`; the response returns enrollment/notification counts and causes list/pool/foundation reload. Next `JudgeAssignmentPanel.addAssignment` POSTs `/judges-v2/:participantId/assignments`; validator/service INSERTs `competition_judge_assignments`, returning HTTP 201 `{success,assignment}`. The assignment connects the enrollment to its scope without creating another account.

Files: [CompetitionJudgesPage.jsx](frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx), [JudgeAssignmentPanel.jsx](frontend/src/components/organizer/competition/JudgeAssignmentPanel.jsx), [competition-organizer.routes.js](backend/src/routes/competition-organizer.routes.js), [competition.controller.js](backend/src/controllers/competition.controller.js), [competition.service.js](backend/src/services/competition.service.js), [participant.service.js](backend/src/services/participant.service.js), [041 schema](backend/src/database/migrations/041_unify_competition_judges.sql), [063 scope trigger](backend/src/database/migrations/063_judge_assignment_scope_guard.sql).

### 6. Starting the competition/session

The Organizer's **Start Live Session** runs `CompetitionLiveControlPage.performAction` and `competitionSessionService.startSession`. POST event `/session/start` calls `competition-session.controller.startSession` and `competition-session.service.startSession`. After validation it UPDATEs event status/scoring and INSERTs `competition_sessions`; HTTP 201 returns `{success,session,message}`. Live Control reloads and status emissions can tell Judges to fetch their new scoring context.

Files: [CompetitionLiveControlPage.jsx](frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx), [competition-session.service.js frontend](frontend/src/services/competition-session.service.js), [competition-organizer.routes.js](backend/src/routes/competition-organizer.routes.js), [competition-session.controller.js](backend/src/controllers/competition-session.controller.js), [competition-session.service.js backend](backend/src/services/competition-session.service.js), [023 schema](backend/src/database/migrations/023_competition_live_session.sql).

### 7. Loading and entering Judge scores

Opening the Judge route mounts `JudgeScoringPage`, which calls `pageantService.getSessionView`. GET `/api/participant/competition/events/:eventId/session-view` runs enrollment middleware, the session controller and `getJudgeSessionView`. It SELECTs active view, contestants/criteria/minors and this Judge's JSON score rows and returns event/session/field/criteria/bounds/locks. `CompetitionScoringForm` renders them. A numeric edit calls `onScoreChange` and updates React's score map; it performs no API or database operation until Lock.

Files: [routes/index.jsx](frontend/src/routes/index.jsx), [JudgeScoringPage.jsx](frontend/src/pages/voter/JudgeScoringPage.jsx), [CompetitionScoringForm.jsx](frontend/src/components/voter/competition/CompetitionScoringForm.jsx), [pageant.service.js frontend](frontend/src/services/pageant.service.js), [pageant-judge.routes.js](backend/src/routes/pageant-judge.routes.js), [competition-session.controller.js](backend/src/controllers/competition-session.controller.js), [competition-session.service.js backend](backend/src/services/competition-session.service.js).

### 8. Submitting a Judge score

Lock calls `submitCriterion`/`buildCriterionPayload`, then `pageantService.submitSessionScore`. POST participant event `/session-score` supplies `{contestantId,scores}`. The controller/service infer Judge/session/round, validate gates/bounds/locks, UPDATE or INSERT `competition_session_judge_scores`, and call the mirror for DELETE/INSERT `competition_scores`. It returns `{success,locked,lockedCriteria,message}`, emits progress and prompts frontend saved confirmation/resync. The committed parent is the next input's lock boundary.

Files: [JudgeScoringPage.jsx](frontend/src/pages/voter/JudgeScoringPage.jsx), [pageant.service.js frontend](frontend/src/services/pageant.service.js), [pageant-judge.routes.js](backend/src/routes/pageant-judge.routes.js), [competition-session.controller.js](backend/src/controllers/competition-session.controller.js), [competition-session.service.js backend](backend/src/services/competition-session.service.js), [023 row schema](backend/src/database/migrations/023_competition_live_session.sql), [073 locks](backend/src/database/migrations/073_session_locked_criteria.sql), [064 participant triggers](backend/src/database/migrations/064_autofill_participant_id.sql).

### 9. Calculating tabulation

The Organizer selects a method and clicks Calculate in `CompetitionTabulationPage.calculate`. `competitionTabulationService.calculate` POSTs event `/tabulation/calculate`. `pageant-organizer.controller.calculateResults` calls `competition-tabulation.service.calculateResults`, which invokes `getLiveRankings`/`computeRankings`, reads active deductions and applies `applyDeductionsToRankings`. It INSERTs `competition_result_calculations` and returns HTTP 201 `{success,calculationId,status,configuration,results}`. The UI displays the snapshot for review and subsequent finalize/publish transitions.

Files: [CompetitionTabulationPage.jsx](frontend/src/pages/organizer/competition/CompetitionTabulationPage.jsx), [competition-tabulation.service.js frontend](frontend/src/services/competition-tabulation.service.js), [pageant-organizer.controller.js](backend/src/controllers/pageant-organizer.controller.js), [competition-tabulation.service.js backend](backend/src/services/competition-tabulation.service.js), [pageant.service.js](backend/src/services/pageant.service.js), [scoring-engine.js](backend/src/modules/scoring-engine.js), [tabulation.js](backend/src/modules/tabulation.js), [082 schema](backend/src/database/migrations/082_competition_result_calculations.sql).

### 10. Reading rankings

`CompetitionRankingsPage.load` calls `pageantService.getRankings`, with optional division/round query parameters. GET event `/rankings` runs `pageant-organizer.controller.getRankings` and `pageant.service.getOfficialRankings`. This computes live ranking data from flat scores/config, then substitutes eligible published snapshot rows for the overall official view. The `{success,...rankingsData}` response supplies rows, totals, Judge counts and official metadata. No dedicated ranking table is INSERTed by this GET. The page's preceding once-per-mount resync POST is the separate write operation described earlier.

Files: [CompetitionRankingsPage.jsx](frontend/src/pages/organizer/competition/CompetitionRankingsPage.jsx), [pageant.service.js frontend](frontend/src/services/pageant.service.js), [pageant-organizer.controller.js](backend/src/controllers/pageant-organizer.controller.js), [pageant.service.js backend](backend/src/services/pageant.service.js), [scoring-engine.js](backend/src/modules/scoring-engine.js).

### 11. Publishing and reading results/reports

The Organizer's Finalize/Publish buttons call `CompetitionTabulationPage.transition` and the tabulation service at POST event `/tabulation/:calculationId/finalize` or `/publish`. Backend state-guarded UPDATEs set workflow status/users/times and return `{success,calculation}`. Subsequent GET event `/results` calls `getCompetitionResults`, reading live/published rows and round snapshots to return `{success,results}`. `CompetitionReportPage` requests `/api/organizer/reports/competition/:eventId` through its analytics provider; `reports.service.getCompetitionReport` builds `{success,report}` for display/export. The event and contestant IDs remain the links to the original setup and submitted scores.

Files: [CompetitionTabulationPage.jsx](frontend/src/pages/organizer/competition/CompetitionTabulationPage.jsx), [competition-tabulation.service.js](backend/src/services/competition-tabulation.service.js), [pageant.service.js](backend/src/services/pageant.service.js), [CompetitionReportPage.jsx](frontend/src/pages/organizer/reports/CompetitionReportPage.jsx), [providers.js](frontend/src/modules/analytics/services/providers.js), [reports-organizer.routes.js](backend/src/routes/reports-organizer.routes.js), [reports-organizer.controller.js](backend/src/controllers/reports-organizer.controller.js), [reports.service.js](backend/src/services/reports.service.js), [exportReport.js](frontend/src/utils/exportReport.js).

## Data Connection Map

The diagram describes stored relationships and calculation dependencies. It does not require an extra Stage table or imply assignments are enforced by every live scoring operation.

```text
ADMIN creates/manages USERS and USER_PARTICIPANT_TYPES
  |
  +-- ORGANIZER user
  |     +-- ORGANIZATIONS.organizer_id
  |           +-- EVENTS.organization_id
  |                 +-- competition_type label and scoring_config
  |                 +-- optional COMPETITION_DIVISIONS
  |                 +-- optional COMPETITION_CATEGORIES
  |                 +-- COMPETITION_ROUNDS
  |                 |     +-- ROUND_CRITERIA ----> COMPETITION_CRITERIA
  |                 |     |                         +-- MINOR_CRITERIA
  |                 |     +-- ROUND_CONTESTANTS -> COMPETITION_CONTESTANTS
  |                 |     +-- ROUND_RESULTS (standing / qualification snapshot)
  |                 +-- COMPETITION_CONTESTANTS (optional division)
  |                 +-- EVENT_PARTICIPANTS (COMPETITION_JUDGE)
  |                 |     +-- user_id -----------> Judge USERS.id
  |                 |     +-- JUDGE_ASSIGNMENTS (participant_id)
  |                 |           +-- scope_id ----> event/category/round/division
  |                 +-- COMPETITION_SESSIONS
  |                 |     +-- current_round_id / current_division_id
  |                 |     +-- primary contestant / contestant_order / gates
  |                 |     +-- SESSION_JUDGE_SCORES
  |                 |           +-- session/event/round/Judge/participant/contestant IDs
  |                 |           +-- scores JSON keyed by minor (or fallback parent)
  |                 |           +-- locked parent IDs and full-row lock
  |                 +-- COMPETITION_DEDUCTIONS
  |                 +-- COMPETITION_RESULT_CALCULATIONS
  |                       +-- event_id / optional round context
  |                       +-- configuration_snapshot / result_snapshot
  |                       +-- calculated -> finalized -> published
  |
  +-- JUDGE participant user
        +-- global COMPETITION_JUDGE membership
        +-- event enrollment and optional assignment records
        +-- authenticated live score submission

SESSION_JUDGE_SCORES
  -- mirror committed values --> COMPETITION_SCORES
                                  +-- Judge user and event participant IDs
                                  +-- contestant / parent / minor / optional round IDs
                                  +-- numeric score (no session_id)
                                  |
                                  +-- backend scoring-engine calculation
                                        +-- live rankings
                                        +-- round standing / advancement snapshot
                                        +-- deductions + calculated result snapshot
                                              +-- finalize and publish
                                                    +-- official event results/reports
```

| Identifier | Where it is created | What later uses it |
|---|---|---|
| `users.id` | Account creation | Authentication, Judge score identity, Organizer ownership, audit actors |
| `organizations.id` | Organizer organization service | `events.organization_id` |
| `events.id` | Event INSERT | Setup routes, memberships via parents, enrollment, sessions, deductions, calculations |
| `competition_rounds.id` | Round INSERT | Memberships, current session round, optional score context, finalized standing |
| `competition_criteria.id` | Parent INSERT | Round membership, minors, score parents, locks |
| `competition_minor_criteria.id` | Minor INSERT | Normal input/JSON key and flat `minor_criteria_id` |
| `competition_contestants.id` | Contestant INSERT | Round memberships, session order, score rows, result/deduction identity |
| `event_participants.id` | Enrollment UPSERT | Assignment participant reference and score `participant_id` |
| `competition_judge_assignments.id` | Assignment INSERT | Assignment removal/list; not a score assignment FK |
| `competition_sessions.id` | Start INSERT | Live JSON score context, lifecycle/history |
| `competition_session_judge_scores.id` | First committed parent | Further merged parent submissions and unlock updates |
| `competition_scores.id` | Flat score INSERT | Individual numeric persistence read for calculations |
| `competition_result_calculations.id` | Calculate INSERT | Review/latest GET, finalize/publish transition, publication metadata |

Foreign-key evolution is defined in the migration directory. `competition_judges` is a compatibility view after migration 041; canonical Judge enrollment is `event_participants`. `contestants`, `criteria` and `judge_scores` are historical names renamed to competition tables. Judge assignments use polymorphic scope IDs plus a validating trigger. Numeric arrays/JSON keys are logical connections, not separate per-key SQL foreign keys.

Evidence: [constants.js](backend/src/utils/constants.js), [011 table rename](backend/src/database/migrations/011_rename_pageant_to_competition_scoring.sql), [015 foundation](backend/src/database/migrations/015_competition_scoring_foundation.sql), [041 enrollment unification](backend/src/database/migrations/041_unify_competition_judges.sql), [063 scope guard](backend/src/database/migrations/063_judge_assignment_scope_guard.sql), and score/session/result migrations cited above.

## Other Implemented VOTRIX Processes

### Elections

An Organizer using Election creates details/branding and configures ballot groups/positions/candidates, enrolls eligible student cohorts, then reviews and publishes. The current working-tree group implementation reuses `election_ballot_sections`, adds eligibility mode and selected voter membership through `election_group_voters`, and connects positions to a section. The Organizer's groups are not competition rounds and use different data and APIs.

An enrolled participant opens `VoterEventPage`, loads the current eligible pending section, chooses candidates within position constraints, and reviews selections. The frontend persists selection drafts locally. Submit sends selections, section ID and voting nonce. Backend checks event enrollment, current section/nonce, schedule/open state, positions/candidates/duplicates and at least one selection, then calls transactional `cast_election_ballot`. The SQL writes votes and section completion together, rotates/clears nonce and updates event-level completion based on eligible sections. The response either continues the next group or shows completion.

Election result services count candidate votes, calculate position/group/turnout results, and expose results according to visibility. Hidden does not expose participant results; real-time allows enrolled access; public requires genuine conclusion rather than a transient paused voting flag. Organizer finalization completes the election/voting state. Reports/export and optional duplication are separate Organizer operations.

Evidence: [ElectionEventsPage.jsx](frontend/src/pages/organizer/election/ElectionEventsPage.jsx), [ElectionPositionsPage.jsx](frontend/src/pages/organizer/election/ElectionPositionsPage.jsx), [VoterEventPage.jsx](frontend/src/pages/voter/VoterEventPage.jsx), [election.service.js](backend/src/services/election.service.js), [electionGroups.js](backend/src/utils/electionGroups.js), [080 groups migration](backend/src/database/migrations/080_election_groups.sql), [eventSchedule.js](backend/src/utils/eventSchedule.js).

### Polling

For Polling, the Organizer creates details/branding/settings, uses Builder for questions/options/configuration, enrolls respondent cohorts, and publishes setup. Question types come from system and organization-specific registry definitions; required/type/range settings determine input and backend validation. Poll settings include anonymity, multiple submissions and expiration; the data model still has account-linked submission records, so an anonymous flag does not mean those foreign keys disappear.

An enrolled participant opens `VoterPollPage`, receives available questions, enters answers and submits with a start timestamp. `submitPollResponse` verifies enrollment and availability, validates/serializes each answer from registry rules and calls transactional `cast_poll_response`. It creates the submission/answer records and response state together, rejecting repeated single submissions or permitting multiple submissions according to settings. The response returns a submission ID and confirmation, with participation events/statistics for Organizer views.

Poll analytics aggregate answers, participation cohorts and timing/activity; reports export those results. Elections/polls use planned schedule/expiry checks, while current competition lifecycle follows live sessions. These module processes share accounts and event enrollment but do not use the competition scoring engine to count votes or validate poll answers.

Evidence: [PollingBuilderPage.jsx](frontend/src/pages/organizer/polling/PollingBuilderPage.jsx), [VoterPollPage.jsx](frontend/src/pages/voter/VoterPollPage.jsx), [polling.service.js](backend/src/services/polling.service.js), [poll-question-types.js](backend/src/modules/poll-question-types.js), [polling-registry.service.js](backend/src/services/polling-registry.service.js), [060 poll RPC](backend/src/database/migrations/060_poll_cast_response_rpc.sql).

### Accounts, authentication, cohorts, media and oversight

All users enter through the shared email/password login process. Access and refresh JWTs are set in HTTP-only cookies, and Axios sends credentials automatically. Frontend user display data and CSRF are distinct from access-token storage. Backend authentication checks JWT/current token version and optional session identity; refresh renews cookies. Logout clears cookies and revokes the relevant bound session. Password reset stores hashed reset-token metadata, sends a link, updates password/version and clears old sessions; non-admin eligibility and first-login skip behavior are implemented separately.

Organizers invite voter/respondent cohorts from admin-managed eligible pools. The cohort service validates chosen program/year-section values against Organizer scope, registers event participants and optionally sends event emails. Pool membership, account status, event enrollment and email delivery are not the same state. CSV/XLSX preview/register and admin updates maintain these records.

Uploads go through multipart UI requests, upload middleware, validation/content hashing, Cloudinary and `image_assets`, with stored owner references. Replacement/deletion cleanup checks asset references; failures can enter a deletion queue. Image cleanup scripts exist, but automatic external scheduling of them is **UNCONFIRMED — repository evidence is insufficient.** Server startup explicitly starts event schedule and archival services.

Notifications persist per-user messages/read state and may emit user-room updates. Audit/activity services preserve actor/action/entity metadata for administrative and domain operations. Vote/poll activity records counts rather than individual choices/answers. Admin health, settings, alert configuration, search, exports, global events and session management support oversight rather than creating an alternative competition workflow.

Evidence: [auth.controller.js](backend/src/controllers/auth.controller.js), [auth.js](backend/src/middleware/auth.js), [api.js](frontend/src/services/api.js), [auth.store.js](frontend/src/store/auth.store.js), [cohort.service.js](backend/src/services/cohort.service.js), [upload.service.js](backend/src/services/upload.service.js), [imageAsset.service.js](backend/src/services/imageAsset.service.js), [notification.service.js](backend/src/services/notification.service.js), [foundation/activity.js](backend/src/foundation/activity.js), [admin.routes.js](backend/src/routes/admin.routes.js), [server.js](backend/src/server.js).

## Realtime and Process Evidence Boundaries

React component state holds forms/sheets/selections, Zustand holds user/toast state, and TanStack Query is used selectively for dashboards/analytics. Native WebSocket connects to `/ws`; session/score/lifecycle events can prompt refetches or state updates. Waiting Judge polling and report polling provide additional HTTP refresh paths. There is no confirmation of delivery merely because an emitter/subscriber function exists.

**IMPLEMENTATION MISMATCH.** WebSocket room initialization expects token properties `id` and `organizationId`, while the issued payload uses `sub` and does not supply organization ID. Explicit event-room subscription exists on pages, but the backend accepts event-room subscription strings without the HTTP event-ownership/enrollment checks. Its socket authentication also does not perform the HTTP middleware's database session/version/account checks. Therefore this document describes implemented emissions/refetch handlers without promising that all automatic room delivery succeeds in deployment.

**IMPLEMENTATION MISMATCH.** The frontend socket's intentional-disconnect flag is set on disconnect and not reset in connect, affecting the assumed reconnect lifecycle after an account switch. **IMPLEMENTATION INCOMPLETE / PARTIALLY IMPLEMENTED.** A socket-auth message is mentioned in comments but no such message-handler branch is implemented. Redistributed multi-process room state or frontend Supabase realtime subscriptions are **NOT FOUND IN REPOSITORY.** The current backend uses in-memory native `ws` rooms.

Actual production environment values, email arrival, deployed database contents/migrations, successful repeat-session runs, no-round query behavior and observed browser outcomes are **UNCONFIRMED — repository evidence is insufficient.** Source tracing confirms declared operations, field use and mismatches; it does not replace live evidence with an assumed successful workflow. No implementation change is proposed or applied by this document.

Evidence: [Bootstrap.jsx](frontend/src/app/Bootstrap.jsx), [queryClient.js](frontend/src/app/queryClient.js), [socket.service.js](frontend/src/services/socket.service.js), [useSocketEvent.js](frontend/src/hooks/useSocketEvent.js), [ws-server.js](backend/src/websocket/ws-server.js), [token.service.js](backend/src/services/token.service.js), [ws-emitter.js](backend/src/websocket/ws-emitter.js).
