# Fix: Registering/Inviting an Existing Voter Must Not Reset Their Password

## Bug

When an organizer registers + invites an already-registered voter to a different event (e.g. a polling event), the voter is forced to the "change temporary password" screen on next login even though they already have an account with their own password. The invitation email correctly omits a temp password (it detects the account already exists), but the voter's stored password has already been silently replaced with a random temporary one. Result: the voter's real password no longer matches, and they never received the new temp → the account is effectively lost.

**Root cause:** `ensureRespondentAccount` (polling) and `ensureVoterAccount` (invitation) unconditionally overwrote an existing user's password and set `must_change_password = true` — even when the caller passed `resetPasswordForExisting: false`. They ignored the flag entirely.

## Fix Principle

- An existing account's password and `must_change_password` flag must **never** be touched when registering or inviting them to a new event.
- Only brand-new accounts get a temporary password (`must_change_password = true`).
- Invitation emails to existing accounts always say "sign in with your existing password" (no temp password, no reset).
- New/existing classification uses `voter.must_change_password` (the account's actual state) instead of a `.limit(1)` query on other invitations.

## Changes

### 1. `backend/src/services/polling.service.js`

- `ensureRespondentAccount`: added `resetPasswordForExisting = true` param and early-return guard for existing accounts when flag is `false`.
- `registerRespondentToPoll`: already passes `resetPasswordForExisting` through (default `false`).
- `sendRespondentInvitation`: replaced `.limit(1)` heuristic with `!voter.must_change_password`.
- `sendAllPendingRespondentInvitations`: select now includes `must_change_password`; derives `isExistingAccount` from it instead of a batch `existingCheck` query.

### 2. `backend/src/services/invitation.service.js`

- `ensureVoterAccount`: added `resetPasswordForExisting = true` param and early-return guard.
- `inviteVoterToEvent`: passes `false`; branches email on `isNew`.
- `registerVoterToEvent`: default changed to `false`; existing branch sanitizes the returned user.
- `resendVoterInvitation`: replaced `.limit(1)` heuristic with `!voter.must_change_password`.
- `sendVoterInvitation`: replaced heuristic (two extra queries) with `!voter.must_change_password`.
- `sendAllPendingInvitations`: select now includes `must_change_password`; dropped `existingCheck` batch query.

### 3. `backend/src/services/pageant.service.js`

- `ensureJudgeAccount`: existing early-return now calls `sanitizeUser(existing)` (was returning raw row).
- `inviteJudge`: passes `false` to `ensureJudgeAccount`; branches email on `isNew`; sanitizes returned user.
- `sendJudgeInvitation`: select now includes `must_change_password`; replaced `.limit(1)` heuristic.
- `sendAllPendingJudgeInvitations`: select now includes `must_change_password`; dropped `existingCheck` batch query.

### 4. `backend/src/services/pageant-csv.service.js`

- CSV judge import: `resetPasswordForExisting: true` → `false`. Existing judges are never reset to an unknown temp with no email.

### 5. `backend/__tests__/services/enrollment-regression.test.js`

Added assertions:
1. `registerRespondentToPoll` with existing voter → `isNewRespondent: false`, no `hashPassword` call.
2. `inviteVoterToEvent` with existing voter → `sendVoterInvitationEmailRegistered` called, not `sendVoterInvitationEmail`.
3. `registerVoterToEvent` with existing voter → no password update, no `hashPassword` call.
4. `sendVoterInvitation` for voter with `must_change_password: false` → registered email, no reset, `temporaryPassword: null`.
5. Returned user objects do not contain a `password` field.

## Database

No schema migration required. `users.password`, `users.must_change_password`, and `invitations.is_new_account` already exist. This fix is purely behavioral in the service layer.

## Frontend

No changes required. The frontend already redirects to `/change-password` only when the backend reports `mustChangePassword: true`.
