# Implementation TODO — Voter Registration & Invitation Wrong-Table Fix

## Plan: `docs/plans/voter-registration-invitation-table-mixup-fix.md`

- [ ] Step 1: Migration 033 — add `voting_nonce` to `event_participants`, backfill, fix `v_event_voters` view, reconcile legacy rows.
- [ ] Step 2: `pageant.service.js` — `inviteJudge()` / `registerJudge()` write to `event_participants` via `registerParticipant()`.
- [ ] Step 3: `polling.service.js` — implement missing respondent functions (`listEventRespondents`, `registerRespondentToPoll`, `registerExistingRespondent`, `sendRespondentInvitation`, `sendAllPendingRespondentInvitations`).
- [ ] Step 4: `election.service.js` — use `EVENT_PARTICIPANTS` for ballot nonce read/update.
- [ ] Step 5: `csv-import.service.js` — `previewCsv()` uses `EVENT_PARTICIPANTS` for `alreadyEnrolled`.
- [ ] Step 6: `event.service.js` — `getEventVoterAccounts()` (read-only) → `EVENT_PARTICIPANTS`.
- [ ] Step 7: Verify (lint/tests).
