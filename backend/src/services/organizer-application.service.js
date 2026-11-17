import { db as getClient } from '../foundation/db.js'
import { recordAudit } from '../foundation/audit.js'
import { conflict, notFound } from '../foundation/errors.js'
import { ApiError } from '../utils/ApiError.js'
import {
  DB_TABLES,
  ORGANIZER_APPLICATION_STATUS,
  ORGANIZER_ORGANIZATION_TYPES,
} from '../utils/constants.js'
import {
  validateApplicationFields,
  validateDeclineReason,
} from '../validators/organizer-application.validator.js'
import { createOrganizerAccount } from './admin-organizer.service.js'
import { listActivePrograms } from './program.service.js'
import { findUserByEmail } from './user.service.js'
import { sendOrganizerApplicationDeclinedEmail } from './mailer.service.js'
import {
  claimInvitation,
  getUsableInvitationByToken,
  releaseInvitation,
} from './organizer-invitation.service.js'
import {
  deleteCertificates,
  getCertificateAccessUrl,
  uploadCertificate,
  validateCertificateFiles,
} from './certificate-storage.service.js'

// Plan docs/plans/organizer-invitation-and-student-officers-plan.md §6.
//
// The data layer (PostgREST) has no multi-statement transactions, so every
// state change is a single conditional UPDATE used as a claim ("pending →
// X WHERE status = pending"), followed by the side effect, with an explicit
// revert if the side effect fails. Two concurrent actors can never both win a
// claim.

function nowIso() {
  return new Date().toISOString()
}

function toApplicationDto(row, { withCertificates = false } = {}) {
  const certificates = Array.isArray(row.certificates) ? row.certificates : []
  const dto = {
    id: row.id,
    invitationId: row.invitation_id,
    email: row.email,
    organizerName: row.organizer_name,
    position: row.position,
    organizationName: row.organization_name,
    organizationType: row.organization_type_display,
    requestedScope: row.requested_scope,
    status: row.status,
    declineReason: row.decline_reason ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    organizerUserId: row.organizer_user_id ?? null,
    createdAt: row.created_at,
    certificateCount: certificates.length,
  }
  if (withCertificates) {
    // Signed, admin-only links. The stored Cloudinary reference is never sent.
    dto.certificates = certificates.map((c) => ({
      name: c.name,
      mime: c.mime,
      size: c.size,
      url: getCertificateAccessUrl(c),
    }))
  }
  return dto
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------
export async function getApplicationFormContext(token) {
  const invitation = await getUsableInvitationByToken(token)
  const programs = await listActivePrograms()
  return {
    email: invitation.email,
    note: invitation.note ?? null,
    expiresAt: invitation.expires_at,
    organizationTypes: ORGANIZER_ORGANIZATION_TYPES,
    programs,
  }
}

/**
 * Submit an application. Order matters:
 *   1. validate everything (no side effects)
 *   2. claim the invitation (atomic, single-use)
 *   3. upload certificates, insert the application
 *   4. on any failure after the claim: delete uploads, release the invitation
 */
export async function submitApplication(token, body, files) {
  const invitation = await getUsableInvitationByToken(token)

  const fields = validateApplicationFields(body, { programs: await listActivePrograms() }, { strictOrganizationType: true })
  const verifiedFiles = validateCertificateFiles(files)

  // The email is bound to the invitation; the applicant cannot supply or change it.
  if (await findUserByEmail(invitation.email)) {
    throw conflict('An account with this email already exists')
  }

  await claimInvitation(invitation.id)

  const uploaded = []
  try {
    for (const file of verifiedFiles) {
      uploaded.push(await uploadCertificate(file, { keyPrefix: invitation.id }))
    }

    const { data, error } = await getClient()
      .from(DB_TABLES.ORGANIZER_APPLICATIONS)
      .insert({
        invitation_id: invitation.id,
        email: invitation.email,
        organizer_name: fields.organizerName,
        position: fields.position,
        organization_name: fields.organizationName,
        organization_type_display: fields.organizationType,
        requested_scope: fields.scope,
        certificates: uploaded,
        status: ORGANIZER_APPLICATION_STATUS.PENDING,
      })
      .select('*')
      .single()
    if (error) throw new ApiError(500, error.message)

    recordAudit({
      userId: null,
      action: 'organizer.application.submit',
      entity: DB_TABLES.ORGANIZER_APPLICATIONS,
      entityId: data.id,
      details: { email: invitation.email, certificateCount: uploaded.length },
    })
    return { applicationId: data.id }
  } catch (err) {
    await deleteCertificates(uploaded)
    await releaseInvitation(invitation.id)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export async function listApplications({ status, limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 200)
  const safeOffset = Math.max(0, Number(offset) || 0)

  let query = getClient()
    .from(DB_TABLES.ORGANIZER_APPLICATIONS)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1)

  if (status) {
    if (!Object.values(ORGANIZER_APPLICATION_STATUS).includes(status)) {
      throw new ApiError(400, 'status must be pending, approved or declined')
    }
    query = query.eq('status', status)
  }

  const { data, error, count } = await query
  if (error) throw new ApiError(500, error.message)
  return { applications: (data ?? []).map((row) => toApplicationDto(row)), total: count ?? (data ?? []).length }
}

async function loadApplication(applicationId) {
  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZER_APPLICATIONS)
    .select('*')
    .eq('id', applicationId)
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw notFound('Application not found')
  return data
}

export async function getApplication(applicationId) {
  const row = await loadApplication(applicationId)
  return { application: toApplicationDto(row, { withCertificates: true }) }
}

/**
 * Approve = claim, then create the organizer through the EXISTING
 * createOrganizerAccount() path (validation, scope handling, temporary password,
 * invitation email, must-change-password). The admin may correct any field.
 */
export async function approveApplication(applicationId, adminId, overrides = {}) {
  const row = await loadApplication(applicationId)
  if (row.status !== ORGANIZER_APPLICATION_STATUS.PENDING) {
    throw conflict(`This application is already ${row.status}`)
  }

  const merged = {
    organizerName: overrides.organizerName ?? row.organizer_name,
    position: overrides.position ?? row.position,
    organizationName: overrides.organizationName ?? row.organization_name,
    organizationType: overrides.organizationType ?? row.organization_type_display,
    scopeType: overrides.scopeType ?? row.requested_scope?.scopeType,
    programs: overrides.programs ?? row.requested_scope?.programs ?? [],
  }

  // Validate first so a bad correction fails before any state changes. The admin
  // may use a non-standard organization type (same freedom as direct add).
  validateApplicationFields(merged, { programs: await listActivePrograms() }, { strictOrganizationType: false })

  const claim = await getClient()
    .from(DB_TABLES.ORGANIZER_APPLICATIONS)
    .update({
      status: ORGANIZER_APPLICATION_STATUS.APPROVED,
      reviewed_by: adminId ?? null,
      reviewed_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('id', applicationId)
    .eq('status', ORGANIZER_APPLICATION_STATUS.PENDING)
    .select('*')
    .maybeSingle()
  if (claim.error) throw new ApiError(500, claim.error.message)
  if (!claim.data) throw conflict('This application was already reviewed by someone else')

  let created
  try {
    created = await createOrganizerAccount({ email: row.email, ...merged })
  } catch (err) {
    await getClient()
      .from(DB_TABLES.ORGANIZER_APPLICATIONS)
      .update({
        status: ORGANIZER_APPLICATION_STATUS.PENDING,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: nowIso(),
      })
      .eq('id', applicationId)
      .eq('status', ORGANIZER_APPLICATION_STATUS.APPROVED)
      .is('organizer_user_id', null)
    throw err
  }

  const linked = await getClient()
    .from(DB_TABLES.ORGANIZER_APPLICATIONS)
    .update({ organizer_user_id: created.user.id, updated_at: nowIso() })
    .eq('id', applicationId)
    .select('*')
    .maybeSingle()
  if (linked.error) {
    // The account exists and the status is final; only the back-link is missing.
    console.error('[organizer-application] could not link organizer to application:', linked.error.message)
  }

  recordAudit({
    userId: adminId ?? null,
    action: 'organizer.application.approve',
    entity: DB_TABLES.ORGANIZER_APPLICATIONS,
    entityId: applicationId,
    details: { email: row.email, organizerUserId: created.user.id },
  })

  return {
    application: toApplicationDto(linked.data ?? claim.data),
    user: created.user,
    email: created.email,
  }
}

export async function declineApplication(applicationId, adminId, rawReason) {
  const reason = validateDeclineReason(rawReason)

  const { data, error } = await getClient()
    .from(DB_TABLES.ORGANIZER_APPLICATIONS)
    .update({
      status: ORGANIZER_APPLICATION_STATUS.DECLINED,
      decline_reason: reason,
      reviewed_by: adminId ?? null,
      reviewed_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('id', applicationId)
    .eq('status', ORGANIZER_APPLICATION_STATUS.PENDING)
    .select('*')
    .maybeSingle()
  if (error) throw new ApiError(500, error.message)

  if (!data) {
    const existing = await loadApplication(applicationId) // 404 when missing
    throw conflict(`This application is already ${existing.status}`)
  }

  const email = await sendOrganizerApplicationDeclinedEmail({
    email: data.email,
    organizerName: data.organizer_name,
    reason,
  })

  recordAudit({
    userId: adminId ?? null,
    action: 'organizer.application.decline',
    entity: DB_TABLES.ORGANIZER_APPLICATIONS,
    entityId: applicationId,
    details: { email: data.email, emailSent: Boolean(email?.sent) },
  })

  return { application: toApplicationDto(data), email }
}
