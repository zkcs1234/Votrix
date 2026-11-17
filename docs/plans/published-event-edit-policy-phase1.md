# Published Event Edit Policy — Phase 1 Plan

Applies to Election, Competition and Polling organizer events.
Status: **proposal, nothing implemented.**

## 1. Problem

The panel asked how an organizer can correct a mistake after an event is published.

Today (see `backend/src/utils/eventLifecycle.js`):

| Status | Setup editable | Way to fix a mistake |
|---|---|---|
| `draft` | Yes | Edit directly |
| `scheduled` | No (409) | `unpublish` back to draft. Polling also requires zero submissions. Competition is refused once `official_rules_id` is set. |
| `active` | No | None. `canUnpublishEventStatus` is `scheduled` only. |
| `completed` / `cancelled` / `archived` | No | None. Only whole-event duplicate is allowed (`middleware/eventGuards.js`). |

Related observations from the code:

- `updateElectionEvent`, `updateCompetitionEvent` and `updatePollEvent` call `assertSetupEditable` first. That throws for every published status, so the later `assertEventUpdateAllowed` check is effectively unreachable for them.
- `updateCompetitionEvent` also refuses once `competition_created_at` is set ("reviewed setup is frozen"), even for cosmetic fields.
- Event status is derived by `event-schedule-sync.service.js`. Drafts are skipped by the sync, so reverting an active election or poll to `draft` closes voting without extra work. Competition status is driven by the live session, so it cannot be handled the same way.
- Election already has a whole-event duplicate (`duplicateElectionEvent`, `POST /events/:eventId/duplicate`). Polling has only a question-level duplicate. Competition has none.

## 2. Phase 1 scope

1. Classify edits by risk: **safe**, **schedule**, **integrity**.
2. **Limited live edit** of safe fields and schedule changes on published events, with a required reason and an audit diff.
3. **Pause and revise** for an active election or poll that has zero activity (no ballot, no response).
4. A server-provided edit policy (`GET /events/:eventId/edit-policy`), so the frontend stops duplicating lock logic.

Out of scope: event duplication (decided not needed for this problem), amendment and approval flow for elections and polls, participant notification emails, visible public change log, pause and revise for competitions.

## 3. Edit classes and rules

| Class | Fields | draft | scheduled | active | completed / cancelled / archived |
|---|---|---|---|---|---|
| Safe | description, banner / `image_asset_id`, title (typo fix) | Free | Reason + audit | Reason + audit | Blocked |
| Schedule | `startDate`, `endDate` | Free | Reason + audit. Start must stay in the future. | Only extend `endDate` (new end after current end and after now). Start is locked. | Blocked |
| Integrity | `resultsVisibility`, `competitionType`, positions, candidates (structure), poll questions and options, criteria, rounds, roster | Free | Unpublish to draft first (existing) | Locked. Use Pause and revise if zero activity. | Blocked |

Candidate display fields (bio, photo, spelling of name) are safe edits. Candidate add, remove or reassignment stays integrity.

Status cannot be changed through the update payload on a published event. Strip or reject `status`.

## 4. Backend changes

### 4.1 `utils/eventLifecycle.js`
- Add `SAFE_FIELDS`, `SCHEDULE_FIELDS` and `classifyUpdate(payload)` returning the strictest class present.
- Add `assertPublishedEventUpdateAllowed(event, payload)`:
  - `draft`: allow everything.
  - `scheduled`: allow safe + schedule; reject integrity with the existing "Unpublish it back to draft" 409.
  - `active`: allow safe; allow only `endDate` extension from schedule; reject the rest.
  - terminal statuses: reject (409).
- Add `buildEditPolicy(event, { hasActivity })` returning `{ setupLocked, canUnpublish, canPauseRevise, editableClasses }`.
- Keep `assertSetupEditable` for integrity endpoints (positions, questions, criteria and so on). Those routes are unchanged.

### 4.2 Event update services
Files: `election.service.js:255`, `pageant.service.js:356`, `polling.service.js` (`updatePollEvent`, around line 644).
- Replace `assertSetupEditable(event)` + `assertEventUpdateAllowed(event, payload)` with the new guard.
- Competition: apply the `competition_created_at` freeze only to non-safe fields.
- Require `changeReason` (5–500 chars) whenever the event is not `draft`.
- Record the audit entry with `{ changes: { field: [old, new] }, reason }`. Election uses `recordAudit`; competition and polling use `recordEventActivity`.
- Keep calling `syncEventSchedules()` after the update.
- Remove the old `assertEventUpdateAllowed` once nothing calls it.

### 4.3 Candidate display edits (election)
`updateCandidate` (`election.service.js:844`) currently calls `assertSetupEditable`. Allow bio, photo and name correction on `scheduled` and `active` with a reason; keep position or section changes integrity-locked. The exact field list needs checking against the validator before coding.

### 4.4 Pause and revise (election, polling)
- Election: extend `unpublishElectionEvent` or add `POST /events/:eventId/pause-revise`. Poll: same in `unpublishPollEvent`.
- Allowed when status is `scheduled` (unchanged) or `active` with zero activity:
  - Election activity = rows in `election_ballot_submissions` / `election_votes` for the event.
  - Poll activity = existing `assertNoPollSubmissions`.
- Requires a reason. Sets `status: 'draft'` and `voting_enabled` / `polling_enabled: false`. Audit entry records the reason.
- **Race condition:** a vote could land between the check and the update. Flip to `draft` first (ballot submission already rejects drafts, see `election.service.js:1185`), then re-count. If any activity appeared, revert to the previous status and return 409. A DB function (single transaction) is the cleaner alternative if we want to avoid the compensating write.
- Competition: not included. Active competitions are session-driven; the existing rules-amendment flow remains the path.

### 4.5 Validators
Add optional `changeReason` to the three event-update validators; enforce it in the service when the event is not a draft. Edits are classified by what actually changed compared with the stored event, not by which keys the form sends, because the forms resubmit every field.

No database migration is needed in Phase 1. Reasons live in audit details.

## 5. Frontend changes

- `utils/constants.js`: keep the status helpers, but prefer the server's `editPolicy` when present.
- Event form pages (`ElectionEventFormPage`, `CompetitionEventFormPage`, `PollingEventFormPage`): when the event is published, enable only fields the policy marks editable, show an explanatory banner, and add a required "Reason for change" field.
- Review pages (`ElectionReviewPage`, `PollingReviewPage`, and the competition equivalent): show **Pause and revise** when `editPolicy.canPauseRevise`. Use a confirm dialog that explains voting or responses will close and that invitations remain valid, with a reason field.
- `ElectionCandidatesPage`: allow editing bio, photo and name on published events.
- Frontend services: add `getEditPolicy`, and pass `reason` to the existing `unpublishEvent` calls.

## 6. Tests

- `backend/__tests__/utils/eventLifecycle.test.js`: matrix of class × status, `endDate` extension rules, `status` payload rejection, `buildEditPolicy`.
- New service tests: election and poll pause and revise (zero activity succeeds, activity returns 409, race revert path), update requires `changeReason` when published, audit diff content.
- Competition: safe-field edit passes while `competition_created_at` is set; integrity fields still blocked.
- `frontend/src/utils/constants.test.js` and page tests for the limited-edit form and the Pause and revise button.

## 7. Implementation order

1. `eventLifecycle.js` classification and guard, with unit tests.
2. Wire the guard into the three event-update services, validators, and audit diff.
3. Pause and revise for election and poll, with race handling.
4. Candidate display edits.
5. Frontend: policy-driven form, review buttons, services.
6. Manual QA across all three modules (see checklist below).

## 8. QA checklist

- Scheduled election: edit description with reason, success and audit entry written. Edit positions, rejected with the unpublish message.
- Active election: extend end date succeeds, shorten or change start rejected.
- Active election with zero ballots: Pause and revise returns it to draft; voting is closed; republish works.
- Active election with one ballot: Pause and revise returns 409, event stays active.
- Active poll with a submission: Pause and revise returns 409.
- Competition with `competition_created_at` set: banner edit works, `competitionType` edit rejected.
- Completed event: all edits rejected.
- Missing `changeReason` on a published edit returns 400.

## 9. Risks

- **Late extension:** the schedule sync marks an event `completed` once the end date passes, and completed events cannot be edited. Extensions must happen before the end time. Consider a short grace window in a later phase.
- **Title edits** can confuse voters who already received invitations. Mitigation: required reason now; participant notification in Phase 2.
- **Name correction** on candidates could be misused to swap identity. Mitigation: audit trail now; amendment approval in Phase 2.
- **Frontend and backend drift:** solved by serving `editPolicy` from the backend.

## 10. Open questions for the panel / product owner

1. Is title a safe field, or should it be integrity-locked once published?
2. Should candidate name correction be allowed live, or only bio and photo?
3. Should extending the end date have a limit (for example a maximum number of extensions or a maximum duration)?
4. May an organizer pause and revise alone, or should an admin confirm when invitations were already sent?
5. Is `resultsVisibility` integrity (as proposed) or safe?

Defaults used for implementation until answered: title is a safe edit, candidate name correction is allowed with a reason, no limit on end-date extension, an organizer can pause and revise alone, `resultsVisibility` is integrity.
