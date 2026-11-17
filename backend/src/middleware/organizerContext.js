import { ApiError } from '../utils/ApiError.js'
import { ACCOUNT_STATUS, USER_ROLES, isParticipantRole } from '../utils/constants.js'
import { runWithActor } from '../foundation/requestContext.js'
import { findUserById } from '../services/user.service.js'
import { resolveOfficerContext } from '../services/organization-officer.service.js'

// Plan docs/plans/organizer-invitation-and-student-officers-plan.md §5.1.
//
// Lets an ACTIVE student officer use the existing organizer API as the owner
// organizer. After this runs, `req.user` IS the owner (id, role, tokenVersion…),
// so every controller, ownership check (assertOrganizerOwnsEvent), scope filter
// and requireActiveAccount works unchanged. The real student is on `req.actor`
// and in the request context (for the audit trail).
//
// Design rules:
//  - Organizers and admins pass straight through — zero behavior change.
//  - The decision is read from the database on EVERY request; nothing is cached,
//    so deactivating an officer takes effect on their very next call.
//  - There is no client-supplied input (no header, no id): one active officership
//    per student, resolved server-side. Nothing to spoof.
//  - A student with no officership falls through untouched, so the normal
//    authorize(ORGANIZER) check rejects them with the usual 403.

export async function resolveOrganizerContext(req, _res, next) {
  let actor
  let delegate
  try {
    if (!req.user || !isParticipantRole(req.user.role)) return next()

    const context = await resolveOfficerContext(req.user.id)
    if (!context) return next()

    if (req.user.mustChangePassword) {
      throw new ApiError(403, 'You must change your password before continuing', { code: 'MUST_CHANGE_PASSWORD' })
    }

    // authenticate() verified the token/session; the officer's own account
    // status is checked here (an archived or suspended student loses access).
    const self = await findUserById(req.user.id)
    if (!self || self.account_status !== ACCOUNT_STATUS.ACTIVE) {
      throw new ApiError(403, 'Your account is not active')
    }

    // The organization stops working for its officers when its owner is
    // suspended or archived.
    const { officership, owner } = context
    if (!owner || owner.role !== USER_ROLES.ORGANIZER || owner.account_status !== ACCOUNT_STATUS.ACTIVE) {
      throw new ApiError(403, 'This organization is not currently active')
    }

    actor = {
      id: req.user.id,
      email: req.user.email ?? self.email ?? null,
      position: officership.position,
      officershipId: officership.id,
      organizerId: owner.id,
    }
    delegate = {
      id: owner.id,
      role: USER_ROLES.ORGANIZER,
      username: owner.username ?? undefined,
      email: owner.email,
      accountStatus: owner.account_status,
      // The officer's own password state was verified above; the owner's is not
      // the officer's concern.
      mustChangePassword: false,
      // requireActiveAccount() compares this with the owner's stored version.
      tokenVersion: owner.token_version ?? 0,
      sessionId: req.user.sessionId ?? null,
    }
  } catch (error) {
    return next(error)
  }

  req.actor = actor
  req.user = delegate
  // Run the rest of the chain inside the actor context so recordAudit() (which
  // has no access to `req`) can attribute actions to the real person.
  return runWithActor(actor, () => next())
}

/** Blocks officers from owner-only actions (profile, logo, managing officers). */
export function requireOwnerOrganizer(req, _res, next) {
  if (req.actor) {
    return next(new ApiError(403, 'Only the organizer account can do this'))
  }
  return next()
}
