import { db as getClient } from '../foundation/db.js'
import { recordAudit } from '../foundation/audit.js'
import { conflict, notFound } from '../foundation/errors.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES, ORGANIZER_INVITATION_STATUS } from '../utils/constants.js'
import { generateSecureToken, hashToken } from '../utils/crypto.js'
import { organizerApplyUrl } from '../utils/urls.js'
import { validateInvitationInput } from '../validators/organizer-application.validator.js'
import { findUserByEmail } from './user.service.js'
import { assertOrganizerCapacity, getPlatformSettings } from './platform-settings.service.js'
import { sendOrganizerInviteLinkEmail } from './mailer.service.js'

// Plan docs/plans/organizer-invitation-and-student-officers-plan.md §6.
// Only the SHA-256 hash of the token is stored. "Expired" is derived from
// expires_at, never stored.

const TOKEN_RE = /^[a-f0-9]{64}$/
// One message for every unusable link (unknown, used, revoked, expired) so the
// public endpoint never reveals which case applies.
const INVALID_LINK = 'This invitation link is invalid or is no longer available.'

function nowIso() {
  return new Date().toISOString()
}

export function effectiveInvitationStatus(row, now = new Date()) {
  if (row.status === ORGANIZER_INVITATION_STATUS.PENDING && new Date(row.expires_at) <= now) return 'expired'
  return row.status
}

// Never expose token_hash.
export function toInvitationDto(row) {
  return {
    id: row.id,
    email: row.email,
    note: row.note ?? null,
    status: effectiveInvitationStatus(row),
    expiresAt: row.expires_at,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    usedAt: row.used_at ?? null,
    revokedAt: row.revoked_at ?? null,
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export async function createInvitation(input, createdBy) {
  const { invitationExpiryDays } = await getPlatformSettings({ force: true })
  const { email, expiresInDays, note } = validateInvitationInput(input, invitationExpiryDays)

  if (await findUserByEmail(email)) {
    throw conflict('An account with this email already exists')
  }

  // Do not invite someone who could not be approved: the organizer limit is
  // enforced again when the application is approved.
  await assertOrganizerCapacity()

  // A new invitation supersedes any still-pending one for the same address, so
  // exactly one link per email is ever live (mirrors password-reset tokens).
  const revoked = await getClient()
    .from(DB_TABLES.ORGANIZER_INVITATIONS)
    .update({ status: ORGANIZER_INVITATION_STATUS.REVOKED, revoked_at: nowIso() })
    .eq('email', email)
    .eq('status', ORGANIZER_INVITATION_STATUS.PENDING)
  if (revoked.error) throw new ApiError(500, revoked.error.message)

  const token = generateSecureToken()
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZER_INVITATIONS)
    .insert({
      email,
      token_hash: hashToken(token),
      note,
      status: ORGANIZER_INVITATION_STATUS.PENDING,
      expires_at: expiresAt,
      created_by: createdBy ?? null,
    })
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)

  const emailResult = await sendOrganizerInviteLinkEmail({ email, token, expiresAt, note })

  recordAudit({
    userId: createdBy ?? null,
    action: 'organizer.invitation.create',
    entity: DB_TABLES.ORGANIZER_INVITATIONS,
    entityId: data.id,
    details: { email, expiresInDays, emailSent: Boolean(emailResult?.sent) },
  })

  return {
    invitation: toInvitationDto(data),
    email: emailResult,
    // Returned once, to the admin only, so the link can still be shared by hand
    // when email delivery is unavailable. It is not recoverable afterwards.
    applyUrl: organizerApplyUrl(token),
  }
}

export async function listInvitations({ status, limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200)
  const safeOffset = Math.max(0, Number(offset) || 0)
  const now = nowIso()

  let query = getClient()
    .from(DB_TABLES.ORGANIZER_INVITATIONS)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1)

  if (status === 'pending') {
    query = query.eq('status', ORGANIZER_INVITATION_STATUS.PENDING).gt('expires_at', now)
  } else if (status === 'expired') {
    query = query.eq('status', ORGANIZER_INVITATION_STATUS.PENDING).lte('expires_at', now)
  } else if (status === 'used' || status === 'revoked') {
    query = query.eq('status', status)
  } else if (status) {
    throw new ApiError(400, 'status must be pending, expired, used or revoked')
  }

  const { data, error, count } = await query
  if (error) throw new ApiError(500, error.message)
  return { invitations: (data ?? []).map(toInvitationDto), total: count ?? (data ?? []).length }
}

export async function revokeInvitation(invitationId, adminId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZER_INVITATIONS)
    .update({ status: ORGANIZER_INVITATION_STATUS.REVOKED, revoked_at: nowIso() })
    .eq('id', invitationId)
    .eq('status', ORGANIZER_INVITATION_STATUS.PENDING)
    .select('*')
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)

  if (!data) {
    const existing = await getClient()
      .from(DB_TABLES.ORGANIZER_INVITATIONS)
      .select('id, status')
      .eq('id', invitationId)
      .maybeSingle()
    if (!existing.data) throw notFound('Invitation not found')
    throw conflict(`This invitation is already ${existing.data.status}`)
  }

  recordAudit({
    userId: adminId ?? null,
    action: 'organizer.invitation.revoke',
    entity: DB_TABLES.ORGANIZER_INVITATIONS,
    entityId: invitationId,
    details: { email: data.email },
  })
  return { invitation: toInvitationDto(data) }
}

// Resend = issue a fresh token (the old one cannot be recovered from its hash).
export async function resendInvitation(invitationId, adminId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZER_INVITATIONS)
    .select('*')
    .eq('id', invitationId)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw notFound('Invitation not found')
  if (data.status === ORGANIZER_INVITATION_STATUS.USED) {
    throw conflict('This invitation has already been used')
  }

  // The fresh link gets the current default expiry, not the old link's.
  return createInvitation({ email: data.email, note: data.note }, adminId)
}

// ---------------------------------------------------------------------------
// Public (token-gated)
// ---------------------------------------------------------------------------
export async function getUsableInvitationByToken(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new ApiError(410, INVALID_LINK)

  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZER_INVITATIONS)
    .select('*')
    .eq('token_hash', hashToken(token))
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)

  if (!data || effectiveInvitationStatus(data) !== ORGANIZER_INVITATION_STATUS.PENDING) {
    throw new ApiError(410, INVALID_LINK)
  }
  return data
}

/**
 * Atomically claim an invitation (pending → used). A single conditional UPDATE,
 * so two concurrent submissions can never both succeed. Returns the row, or
 * throws the same generic 410 when it was already taken/expired/revoked.
 */
export async function claimInvitation(invitationId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZER_INVITATIONS)
    .update({ status: ORGANIZER_INVITATION_STATUS.USED, used_at: nowIso() })
    .eq('id', invitationId)
    .eq('status', ORGANIZER_INVITATION_STATUS.PENDING)
    .gt('expires_at', nowIso())
    .select('*')
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(410, INVALID_LINK)
  return data
}

/** Undo claimInvitation after a failed submission so the applicant can retry. */
export async function releaseInvitation(invitationId) {
  const { error } = await getClient()
    .from(DB_TABLES.ORGANIZER_INVITATIONS)
    .update({ status: ORGANIZER_INVITATION_STATUS.PENDING, used_at: null })
    .eq('id', invitationId)
    .eq('status', ORGANIZER_INVITATION_STATUS.USED)
  if (error) console.error('[organizer-invitation] release failed:', error.message)
}
